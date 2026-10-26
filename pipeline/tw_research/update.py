"""
資料集 tw_research：台股其他研究(營收、因子、事件、機器學習)的回測結果與報告 → web/data/tw_research/

直接用本機 PostgreSQL 計算(cm.tw_daily 日資料、cm.tw_monthly_revenue 月營收、cm.tw_company_info 公告股本)。
回測規則同 tw_strategy(根目錄 CLAUDE.md「選股回測原則」)：進出場、漲跌停、交易成本與資金模擬都共用 pipeline/tw_strategy/events.py。
報告(Markdown)在 reports/<key>.md，裡面的 {名稱} 由這裡算出的數字填入；圖片 ![說明](xxx.png) 由網頁依 JSON 畫圖。

研究：
  rev_pre    營收公告前布局：每月 21 日進場買進綜合分數最高的 10 檔 / 5 檔，營收公告後隔天開盤賣出；不限市值與市值四分位
  rev_growth 營收成長特徵：營收年增率 > 10% 公告後 T1 開盤買進，特徵 IC、分數組合與公告前後的事件研究
  rev_drop   營收衰退開低：營收年增率 < -10% 公告後 T1 開盤跳空 ≤ -5%，開盤買進，日內 / T+1 出場
  rev_turn   營收由負轉正：營收年增率上月 < 0、本月 > 0 公告後 T1 開盤買進，持有 5、10、20 日；門檻敏感度、四種營收變化的事件研究
  disp       處置股策略：處置第一天收盤買進(處置前一天融資使用率 ≥ 20%)，處置結束後一天開盤賣；只回測新制(2026/8/10)上路後，
             門檻與出場的依據用 2016 年起的全部處置事件；資金：有新股票進場時總資產平均分散到所有持股(使用者指定)；網頁在 股票 › 處置股 › 處置股策略
共用定義：
  - 月營收只用月底後 15 天內的公告；年增率用單月合併營收，缺值時用單月營收
  - T0 = 公告日(非交易日則為之前最後一個交易日)，T1 = T0 的下一個交易日
  - 均額 = 含當天的事前 N 日平均成交金額；市值 = 原始收盤價 × 當年度交易所公告股本 ÷ 面額 10 元

用法：python pipeline/tw_research/update.py [研究 ...]   (預設全部；python pipeline/run_local.py tw_research 會執行並發佈)
"""
import io
import warnings
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / 'tw_strategy'), str(HERE.parent)]
import events as E  # noqa: E402
from common import dataset_dir, pg_connect, write_json, write_meta  # noqa: E402

NAME = 'tw_research'
warnings.filterwarnings('ignore', category=RuntimeWarning)
LAG = 15                 # 月底後幾天內的公告才算
LIQ = 10_000             # 均額門檻(千元) = 1 千萬
EXTRA = {'fnet': '外資買賣超', 'inet': '投信買賣超', 'main5': '近5日主力買賣超(%)'}
try:   # 融資使用率(mutil)的欄位名稱放在不進版控的 private_strategies.py(RESEARCH_COLS)；沒有這個檔案時，這個特徵為缺值
    from private_strategies import RESEARCH_COLS
    EXTRA.update(RESEARCH_COLS)
except ImportError:
    pass


# ---------- 資料 ----------
class Data:
    def __init__(self, data=None):
        W, self.names = data or E.load()
        self.W = W
        self.D = W['c'].index
        self.stocks = list(W['c'].columns)
        self.jx = {s: j for j, s in enumerate(self.stocks)}
        self.nd = len(self.D)
        self.C, self.O = W['c'].ffill().to_numpy(), W['o'].to_numpy()
        self.Craw = W['c'].to_numpy()
        self.RC, self.RO, self.VOL = W['close'].to_numpy(), W['open'].to_numpy(), W['vol'].to_numpy()
        self.LU, self.LD = E.limits(W)
        self.TR, self.LAST = E.traded(W), E.last_day(W)
        val = W['val'].fillna(0)
        self.A10 = val.rolling(10, min_periods=10).mean().to_numpy()
        self.A20 = val.rolling(20, min_periods=20).mean().to_numpy()
        self.rev = self._revenue()
        self.mcap = self.RC * self._shares() / 1e8                 # 億元
        self.X = self._extra()

    def _revenue(self):
        with pg_connect() as c:
            cur = c.execute('SELECT "股票代號", "年月", "單月合併營收年成長(%)", "單月營收年成長(%)", "單月合併營收月變動(%)", "單月營收月變動(%)", "公告日" '
                            'FROM cm.tw_monthly_revenue WHERE "公告日" IS NOT NULL')
            df = pd.DataFrame(cur.fetchall(), columns=['s', 'ym', 'yc', 'y', 'mc', 'm', 'ann'])
        df = df[df['s'].isin(self.jx) & (df['s'] != E.BENCH)].copy()
        df['yoy'] = df['yc'].fillna(df['y'])
        df['mom'] = df['mc'].fillna(df['m'])
        df['ym'] = pd.to_datetime(df['ym'] + '01')
        df['lag'] = (df['ann'] - (df['ym'] + pd.offsets.MonthEnd(0))).dt.days
        df['j'] = df['s'].map(self.jx)
        df['t0'] = np.searchsorted(self.D.values, df['ann'].values.astype('datetime64[ns]'), side='right') - 1
        df = df.sort_values(['s', 'ym']).reset_index(drop=True)
        g = df.groupby('s')
        prev = g['ym'].shift(1) == df['ym'] - pd.offsets.MonthBegin(1)
        df['prev_yoy'] = g['yoy'].shift(1).where(prev)
        up, cont, streak = (df['yoy'] > 10).to_numpy(), prev.to_numpy(), np.zeros(len(df), int)
        for i in range(len(df)):                                  # 連續年增 > 10% 的月數(含當月，月份要連續)
            streak[i] = (streak[i - 1] + 1 if i and cont[i] else 1) if up[i] else 0
        df['streak'] = streak
        return df[['s', 'j', 'ym', 'yoy', 'mom', 'ann', 'lag', 't0', 'prev_yoy', 'streak']]

    def _shares(self):
        with pg_connect() as c:
            r = c.execute('SELECT "股票代號", "年度", "交易所公告股本(千)" FROM cm.tw_company_info').fetchall()
        s = pd.DataFrame(r, columns=['s', 'y', 'cap'])
        s = s[s['s'].isin(self.jx)].pivot_table(index='y', columns='s', values='cap')
        return s.reindex(self.D.year.astype(str)).set_axis(self.D).reindex(columns=self.stocks).to_numpy() * 100   # 千元 × 1000 ÷ 10 元

    def _extra(self):
        cols = ', '.join(f'"{c}"' for c in EXTRA.values())
        sql = (f'COPY (SELECT "日期", "股票代號", {cols} FROM cm.tw_daily '
               f"WHERE \"股票代號\" ~ '^[1-9][0-9]{{3}}$' AND \"股票代號\" !~ '^91') TO STDOUT WITH CSV")
        with pg_connect() as conn:
            buf = io.BytesIO()
            with conn.cursor().copy(sql) as cp:
                for chunk in cp:
                    buf.write(chunk)
        buf.seek(0)
        df = pd.read_csv(buf, header=None, names=['d', 's', *EXTRA], dtype={'s': str}, parse_dates=['d'])
        X = {k: df.pivot(index='d', columns='s', values=k).reindex(index=self.D, columns=self.stocks).to_numpy() for k in EXTRA}
        X.setdefault('mutil', np.full((self.nd, len(self.stocks)), np.nan))
        return X

    def after(self, day):
        """某個日期(含)之後第一個交易日的位置"""
        return int(np.searchsorted(self.D.values, np.datetime64(day)))


# ---------- 回測共用 ----------
def long_trade(X, j, s, x0):
    """做多一筆：s 收盤選股，s+1 開盤買(漲停或沒成交延後一天，仍買不到回傳 None)；x0 開盤賣(跌停或沒成交往後延；下市櫃以最後收盤價轉現金)。
    格式同 events.backtest 的交易：(j, 選股日, 進場日, 出場日, 進場還原價, 出場還原價, 原因, 延後出場, 延後進場, 時點)"""
    for e in (s + 1, s + 2):
        if e < X.nd and X.TR[e, j] and X.RO[e, j] < X.LU[e, j] - E.EPS:
            break
    else:
        return None
    x0 = max(x0, e + 1)
    t = x0
    while t < X.nd and t <= X.LAST[j] and (not X.TR[t, j] or X.RO[t, j] <= X.LD[t, j] + E.EPS):
        t += 1
    if t > X.LAST[j] and X.LAST[j] < X.nd - 1:
        return (j, s, e, int(X.LAST[j]), X.O[e, j], X.C[X.LAST[j], j], 'delist', 0, e - s - 1, 'close')
    if t >= X.nd:
        return (j, s, e, None, X.O[e, j], None, 'open', 0, e - s - 1, 'open')
    return (j, s, e, t, X.O[e, j], X.O[t, j], 'time', t - x0, e - s - 1, 'open')


def net_return(X, tr):
    """一筆交易扣成本後的報酬(和資金無關；分組、IC 用)"""
    j, s, e, x, Ein, px, why, delay, edelay, when = tr
    if x is None:
        return np.nan
    adj_in = Ein * E.fill(X.RO[e, j], True, X.LU[e, j], X.LD[e, j]) / X.RO[e, j]
    if why == 'delist':
        adj_out, rate = px, 0.0
    else:
        raw = px * (X.RO[x, j] / X.O[x, j] if when == 'open' else X.RC[x, j] / X.Craw[x, j])
        adj_out = px * E.fill(raw, False, X.LU[x, j], X.LD[x, j]) / raw
        rate = E.FEE + (E.TAX_DT if x == e else E.TAX)
    return adj_out / adj_in * (1 - rate) / (1 + E.FEE) - 1


def held(X, tr):
    return int(X.nd - tr[2]) if tr[3] is None else int(tr[3] - tr[2] + (tr[9] != 'open'))


def run(X, trades, i0, cap=None, whole=True, fails=0):
    """資金模擬 → (淨值, 每日持有檔數, 交易統計)"""
    nav, npos, _, res, cap = E.simulate(X.W, trades, True, i0, cap, whole)
    nav, npos = nav[i0:], npos[i0:]
    done = [k for k in res if trades[k][3] is not None]
    r = np.array([res[k] for k in done])
    held_days = npos > 0
    ts = {'n': len(r), 'win': rnd((r > 0).mean()), 'mean': rnd(r.mean()), 'median': rnd(np.median(r)),
          'pos': rnd(npos[held_days].mean()), 'days': rnd(np.mean([held(X, trades[k]) for k in done])), 'heldPct': rnd(held_days[1:].mean()),
          'nocash': len(trades) - len(res), 'fail': fails, 'delist': sum(trades[k][6] == 'delist' for k in done), 'cap': rnd(cap)}
    return nav, npos, ts


def rnd(v, nd=5):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def navlist(nav):
    return [round(float(v), 5) for v in nav]


def stats(nav):
    """和網頁 stats 同定義：年化 = 期末 ^ (252 / 天數) − 1，夏普 = 年化 ÷ 年化波動，索提諾 = 年化 ÷ 年化下檔波動"""
    nav = np.asarray(nav)
    r = nav[1:] / nav[:-1] - 1
    cagr = nav[-1] ** (252 / len(r)) - 1
    vol = r.std(ddof=1) * np.sqrt(252)
    down = np.sqrt((np.minimum(r, 0) ** 2).mean() * 252)
    dd = nav / np.maximum.accumulate(nav) - 1
    run_ = best = 0
    for x in dd:
        run_ = run_ + 1 if x < 0 else 0
        best = max(best, run_)
    return {'ret': nav[-1] - 1, 'cagr': cagr, 'vol': vol, 'sharpe': cagr / vol, 'sortino': cagr / down, 'mdd': dd.min(), 'dd': best}


def yearly(d, nav):
    s = pd.Series(nav, index=pd.to_datetime(d))
    last = s.groupby(s.index.year).last()
    return (last / last.shift(1).fillna(1.0) - 1).to_dict()


def ic_t(df, f, r, by='ym'):
    """每個營收月份算 Spearman(f, r)，回傳 (平均 IC, t 值, IC > 0 的月份比例, 各月 IC)"""
    ics = {}
    for m, x in df[[f, r, by]].dropna().groupby(by):
        if len(x) >= 10 and x[f].nunique() > 1:
            ics[m] = spearmanr(x[f], x[r]).statistic
    v = pd.Series(ics).dropna()
    return v.mean(), v.mean() / v.std(ddof=1) * np.sqrt(len(v)), (v > 0).mean(), v


# ---------- 格式 ----------
def pc(v, nd=1, sign=True):
    return '–' if v is None or not np.isfinite(v) else f'{v * 100:{"+" if sign else ""}.{nd}f}%'


def num(v, nd=2):
    return f'{v:.{nd}f}'


def intc(v):
    return f'{int(v):,}'


def report(key, facts):
    p = HERE / 'reports' / f'{key}.md'
    if not p.exists():
        return ''
    s = p.read_text(encoding='utf-8')
    s = re.sub(r'^# .*\n+', '', s, count=1)                       # 第一行標題由網頁顯示
    return s.format_map(facts)


def perf_cells(x, mean=None, win=None):
    return (f"{pc(x['ret'], 0)} | {pc(x['cagr'])} | {num(x['sharpe'])} | {num(x['sortino'])} | {pc(x['mdd'], 1, False)} | {x['dd']} 天"
            + (f" | {pc(mean, 2)} | {pc(win, 1, False)}" if mean is not None else ''))


# ---------- 營收公告前布局 ----------
VERS = [('all', '不限市值'), ('q1', '市值 Q1(最小)'), ('q2', '市值 Q2'), ('q3', '市值 Q3'), ('q4', '市值 Q4(最大)')]
RULES_PRE = [('21日', 21), ('25日', 25), ('月底', None)]
FACTORS_PRE = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']


def rev_pre(X):
    R = X.rev
    key = R.set_index(['j', 'ym'])
    YOY, MOM, ANN, LG, STK = (key[c].to_dict() for c in ('yoy', 'mom', 'ann', 'lag', 'streak'))
    J = sorted(set(R['j']))
    fx = np.nan_to_num(X.X['fnet'])
    vol20 = pd.DataFrame(X.VOL).rolling(20).sum().to_numpy()
    f20 = pd.DataFrame(fx).rolling(20).sum().to_numpy() / np.where(vol20 > 0, vol20, np.nan)
    months = pd.date_range('2017-02-01', X.D[-1], freq='MS')
    picks = {(r, g, n): [] for r, _ in RULES_PRE for g, _ in VERS for n in ('t10', 't5', 'ew')}
    fails = {k: 0 for k in picks}
    rows21, cap_rng = [], {g: [] for g, _ in VERS[1:]}
    i0 = None
    for rule, day in RULES_PRE:
        for M in months:
            e = X.after(M + pd.Timedelta(days=day - 1)) if day else X.after(M + pd.offsets.MonthEnd(0) + pd.Timedelta(days=1)) - 1
            if e >= X.nd or e < 1 or X.D[e] < M:
                continue
            s = e - 1
            m1, m2, m3, m12 = (M - pd.offsets.MonthBegin(k) for k in (1, 2, 3, 12))
            rows = []
            for j in J:   # 選股日有成交、事前 10 日均額 ≥ 1 千萬、選股日收盤前已公告上月營收；6 個因子都要有值
                if not (X.TR[s, j] and X.A10[s, j] >= LIQ and (j, m1) in ANN and ANN[(j, m1)] <= X.D[s]):
                    continue
                y = [YOY.get((j, m), np.nan) for m in (m1, m2, m3)]
                rows.append((j, y[0], STK.get((j, m1), 0), np.nanmean(y), y[0] - y[1], MOM.get((j, m1), np.nan), -YOY.get((j, m12), np.nan),
                             X.mcap[s, j], X.C[s, j] / X.C[s - 20, j] - 1, X.C[s, j] / X.C[s - 60, j] - 1, f20[s, j], X.A10[s, j] / 100,
                             YOY.get((j, M), np.nan)))
            df = pd.DataFrame(rows, columns=['j', *FACTORS_PRE, 'mcap', 'r20', 'r60', 'f20', 'a10', 'actual']).dropna(subset=FACTORS_PRE)
            if df.empty:
                continue
            df['score'] = df[FACTORS_PRE].rank(pct=True).mean(axis=1)
            df['q'] = pd.qcut(df['mcap'].rank(method='first'), 4, labels=['q1', 'q2', 'q3', 'q4'])
            nxt16 = X.after(M + pd.offsets.MonthBegin(1) + pd.Timedelta(days=15))
            exit0 = {j: (int(np.searchsorted(X.D.values, np.datetime64(ANN[(j, M)]), side='right')) if (j, M) in ANN and LG[(j, M)] <= LAG else nxt16)
                     for j in df['j']}
            if i0 is None:
                i0 = s
            if rule == '21日':
                df['ym'] = M
                df['rank'] = df['score'].rank(method='first', pct=True)
                rows21.append(df)
                for g, sub in df.groupby('q', observed=True):
                    cap_rng[g].append((M.strftime('%Y-%m'), sub['mcap'].min(), sub['mcap'].max()))
            for g, _ in VERS:
                sub = (df if g == 'all' else df[df['q'] == g]).sort_values(['score', 'j'], ascending=[False, True])
                for n, size in (('t10', 10), ('t5', 5), ('ew', None)):
                    for j in sub['j'].head(size) if size else sub['j']:
                        tr = long_trade(X, int(j), s, exit0[j])
                        if tr is None:
                            fails[(rule, g, n)] += 1
                        else:
                            picks[(rule, g, n)].append(tr)
    d = [x.strftime('%Y-%m-%d') for x in X.D[i0:]]
    b0050 = E.bench_nav(X.W, i0)
    out = {'d': d, 'asof': d[-1], 'versions': [], 'b0050': navlist(b0050)}
    sims = {}
    for (rule, g, n), T in picks.items():
        sims[(rule, g, n)] = run(X, T, i0, cap={'t10': 1 / 10, 't5': 1 / 5, 'ew': None}[n], whole=n != 'ew', fails=fails[(rule, g, n)])
    G = {'t10': '前 10 檔', 't5': '前 5 檔', 'ew': '全部合格股票'}
    for g, name in VERS:
        v = {'key': g, 'name': name, 'nav': {n: navlist(sims[('21日', g, n)][0]) for n in G}, 'ts': {n: sims[('21日', g, n)][2] for n in G}, 'entry': []}
        for rule, _ in RULES_PRE:
            for n in ('t5', 't10', 'ew'):
                x = stats(sims[(rule, g, n)][0])
                v['entry'].append({'rule': rule, 'g': G[n], 'ret': rnd(x['ret']), 'cagr': rnd(x['cagr']), 'sharpe': rnd(x['sharpe']), 'sortino': rnd(x['sortino']),
                                   'mdd': rnd(x['mdd']), 'mean': sims[(rule, g, n)][2]['mean']})
        if g != 'all':
            v['cap'] = {'m': [c[0] for c in cap_rng[g]], 'lo': [round(c[1], 1) for c in cap_rng[g]], 'hi': [round(c[2], 1) for c in cap_rng[g]]}
        out['versions'].append(v)
    # 綜合分數十分位與因子 IC(不限市值、21 日進場的全部合格股票；報酬 = 每筆扣成本，和資金無關)
    A = pd.concat(rows21, ignore_index=True)
    r = {(tr[0], tr[1]): net_return(X, tr) for tr in picks[('21日', 'all', 'ew')]}
    sday = {M: X.after(M + pd.Timedelta(days=20)) - 1 for M in A['ym'].unique()}
    A['r'] = [r.get((j, sday[m]), np.nan) for j, m in zip(A['j'], A['ym'])]
    A['dec'] = np.minimum(9, (A['rank'] * 10 - 1e-9).astype(int)) + 1
    out['decile'] = [{'d': int(k), 'n': int(x['r'].notna().sum()), 'mean': rnd(x['r'].mean()), 'win': rnd((x['r'].dropna() > 0).mean()),
                      'yoy': rnd(x['actual'].median(), 2)} for k, x in A.groupby('dec')]
    A['f6raw'] = -A['f6']
    IC = [('上月年增', 'f1'), ('連續成長月數', 'f2'), ('近3月年增', 'f3'), ('上月年增加速', 'f4'), ('上月月增', 'f5'), ('去年同月年增', 'f6raw'),
          ('市值(億)', 'mcap'), ('事前20日報酬', 'r20'), ('事前60日報酬', 'r60'), ('外資20日買超比', 'f20'), ('均額10', 'a10')]
    out['ic'] = []
    for name, f in IC:
        ic, t, pos, _ = ic_t(A, f, 'r')
        out['ic'].append({'f': name, 'ic': rnd(ic, 4), 't': rnd(t, 2), 'pos': rnd(pos, 3), 'pred': rnd(ic_t(A, f, 'actual')[0], 3)})
    # 報告用的數字
    F = {'start': d[1], 'end': d[-1], 'months': len(rows21)}
    S0 = stats(b0050)
    F['b0050'] = perf_cells(S0)
    F['b_ret'], F['b_sharpe'], F['b_mdd'] = pc(S0['ret'], 0), num(S0['sharpe']), pc(S0['mdd'], 1, False)
    corr = A[['f1', 'actual']].dropna()
    F['corr'] = num(spearmanr(corr['f1'], corr['actual']).statistic)
    dec = out['decile']
    F['dec_lo'], F['dec_hi'] = pc(dec[0]['mean'], 2), pc(dec[-1]['mean'], 2)
    F['dec_yoy_lo'], F['dec_yoy_hi'] = f"{dec[0]['yoy']:.0f}%", f"{dec[-1]['yoy']:.0f}%"
    for it in out['ic']:
        F[f"ic_{it['f']}"] = f"{it['ic']:.3f} | {it['t']:.1f} | {it['pos'] * 100:.0f}% | {it['pred']:.2f}"
    F['ic_other_t'] = num(max(abs(it['t']) for it in out['ic'] if it['f'] in ('事前20日報酬', '事前60日報酬', '外資20日買超比', '均額10')), 1)
    for g, _ in VERS:
        for n in ('t10', 't5', 'ew'):
            nav, npos, ts = sims[('21日', g, n)]
            x = stats(nav)
            F[f'{g}_{n}'] = perf_cells(x, ts['mean'], ts['win'])
            F[f'{g}_{n}_short'] = perf_cells(x).rsplit(' | ', 1)[0]
            F[f'{g}_{n}_ret'], F[f'{g}_{n}_cagr'], F[f'{g}_{n}_sharpe'], F[f'{g}_{n}_sortino'] = pc(x['ret'], 0), pc(x['cagr']), num(x['sharpe']), num(x['sortino'])
            F[f'{g}_{n}_mdd'], F[f'{g}_{n}_mean'] = pc(x['mdd'], 1, False), pc(ts['mean'], 2)
            F[f'{g}_{n}_fail'], F[f'{g}_{n}_delist'], F[f'{g}_{n}_n'] = ts['fail'], ts['delist'], intc(ts['n'] + ts['fail'])
            F[f'{g}_{n}_pos'], F[f'{g}_{n}_days'] = num(ts['pos'], 1), num(ts['days'], 1)
            yr = yearly(d, nav)
            for y in (2018, 2022, 2025):
                F[f'{g}_{n}_{y}'] = pc(yr.get(y, np.nan))
        for rule, _ in RULES_PRE[1:]:
            for n in ('t10', 'ew'):
                nav, _, ts = sims[(rule, g, n)]
                x = stats(nav)
                F[f'{g}_{n}_{rule}'] = perf_cells(x, ts['mean'], ts['win'])
                F[f'{g}_{n}_{rule}_mean'] = pc(ts['mean'], 2)
        if g != 'all':
            c = cap_rng[g]
            F[f'{g}_cap'] = (f'{c[0][2]:.0f} 億以下 → {c[-1][2]:.0f} 億以下' if g == 'q1' else f'{c[0][1]:.0f} 億以上 → {c[-1][1]:.0f} 億以上' if g == 'q4'
                             else f'{c[0][1]:.0f} ～ {c[0][2]:.0f} 億 → {c[-1][1]:.0f} ～ {c[-1][2]:.0f} 億')
            F['y0'], F['y1'] = c[0][0][:4], c[-1][0][:4]
    for g, _ in VERS:          # 選出的公司(前 10 檔)：市值與均額中位數
        T = picks[('21日', g, 't10')]
        F[f'{g}_mcap_med'] = f'{np.median([X.mcap[t[1], t[0]] for t in T]):,.0f} 億元'
        a = np.median([X.A10[t[1], t[0]] for t in T]) * 1000
        F[f'{g}_a10_med'] = f'{a / 1e8:.2f} 億元' if a >= 1e8 else f'{a / 1e4:,.0f} 萬元'
    T = picks[('21日', 'all', 't10')]
    a = np.array([X.A10[t[1], t[0]] for t in T]) * 1000
    F['liq_med'], F['liq_p10'] = f'{np.median(a) / 1e4:,.0f} 萬元', f'{np.percentile(a, 10) / 1e4:,.0f} 萬元'
    F['q_n'] = intc(np.mean([len(x) for x in rows21]) / 4)
    out['report'] = report('rev_pre', F)
    return out, F


# ---------- 營收成長特徵 ----------
FEAT = {'成長': ('yoy', -1), '月增': ('mom', 1), '年增加速': ('accel', 1), '連續成長月數': ('streak', -1), '公告天數': ('lag', 1), '開盤跳空': ('gap', 0),
        '事前5日報酬': ('r5', -1), '事前20日報酬': ('r20', -1), '距60日高點': ('hi60', 0), '市值(億)': ('mcap', 1), '均額10': ('a10', -1),
        '外資5日買超比': ('f5', 0), '投信5日買超比': ('i5', 0), '近5日主力買賣超(%)': ('main5', -1), '融資使用率': ('mutil', -1)}
NO_SCORE = {'開盤跳空'}            # T1 開盤才知道，不拿來選股
HOLD = {'日內': (1, 'close'), 'T+1': (1, 'open'), '5日': (5, 'close')}
GROUPS = ['全部事件', '分數 >= 2', '分數 = 3']
CAR_BINS = [-np.inf, -30, -10, 0, 10, 30, 50, 100, np.inf]
CAR_LAB = ['年增 < -30%', '年增 -30% ~ -10%', '年增 -10% ~ 0%', '年增 0% ~ 10%', '年增 10% ~ 30%', '年增 30% ~ 50%', '年增 50% ~ 100%', '年增 > 100%']


def sig_frame(X, idx):
    S = np.zeros((X.nd, len(X.stocks)), bool)
    for t, j in idx:
        S[t, j] = True
    return pd.DataFrame(S, index=X.D, columns=X.stocks)


def rev_growth(X):
    R = X.rev
    F = {}
    ev = R[(R['yoy'] > 10) & (R['lag'] <= LAG)].copy()
    F['n_all'] = intc(len(ev))
    ev = ev[(ev['t0'] >= 20) & (ev['t0'] + 1 < X.nd)]
    t0, j = ev['t0'].to_numpy(), ev['j'].to_numpy()
    ok = np.isfinite(X.RC[t0, j])
    F['n_close'] = intc(ok.sum())
    ok &= X.A10[t0, j] >= LIQ
    F['n_liq'] = intc(ok.sum())
    ev, t0, j = ev[ok].copy(), t0[ok], j[ok]
    vol5 = pd.DataFrame(X.VOL).rolling(5).sum().to_numpy()
    roll5 = lambda a: pd.DataFrame(np.nan_to_num(a)).rolling(5).sum().to_numpy() / np.where(vol5 > 0, vol5, np.nan)  # noqa: E731
    hi60 = pd.DataFrame(X.C).rolling(60, min_periods=60).max().to_numpy()
    ev['accel'] = ev['yoy'] - ev['prev_yoy']
    ev['gap'] = X.O[t0 + 1, j] / X.C[t0, j] - 1
    ev['r5'], ev['r20'] = X.C[t0, j] / X.C[t0 - 5, j] - 1, X.C[t0, j] / X.C[t0 - 20, j] - 1
    ev['hi60'] = X.C[t0, j] / hi60[t0, j] - 1
    ev['mcap'], ev['a10'] = X.mcap[t0, j], X.A10[t0, j]
    ev['f5'], ev['i5'] = roll5(X.X['fnet'])[t0, j], roll5(X.X['inet'])[t0, j]
    ev['main5'], ev['mutil'] = X.X['main5'][t0, j], X.X['mutil'][t0, j]
    ev['vol1'] = X.VOL[np.minimum(t0 + 1, X.nd - 1), j]
    sig_all = sig_frame(X, zip(t0, j))
    trades = {}
    for h, (n, x) in HOLD.items():
        T, skipped = E.backtest(X.W, sig_all, {'side': 'long', 'tp': None, 'sl': None, 'hold': n, 'exit': x})
        r = {(tr[1], tr[0]): net_return(X, tr) for tr in T}
        ev[h] = [r.get((a, b), np.nan) for a, b in zip(t0, j)]
        trades[h] = T
    F['n_final'] = intc(ev['5日'].notna().sum())
    F['vol1_mean'], F['vol1_med'] = intc(ev.loc[ev['5日'].notna(), 'vol1'].mean()), intc(ev.loc[ev['5日'].notna(), 'vol1'].median())
    for h in HOLD:
        F[f'all_{h}'] = f"{pc(ev[h].mean(), 2)} | {pc(ev[h].median(), 2)} | {pc((ev[h].dropna() > 0).mean(), 1, False)}"
        F[f'mean_{h}'] = pc(ev[h].mean(), 2)
    # 特徵 IC(每個營收月份)、同向年數、五分位差
    ev['y'] = ev['ym'].dt.year
    ic = {}
    for name, (f, _) in FEAT.items():
        ic[name] = {h: ic_t(ev, f, h) for h in HOLD}
    out_ic = [{'f': name, 'h': {h: rnd(ic[name][h][1], 2) for h in HOLD}} for name in FEAT]
    for name, (f, _) in FEAT.items():
        _, t5, _, v = ic[name]['5日']
        yr = v.groupby(pd.DatetimeIndex(v.index).year).mean()
        same = (np.sign(yr) == np.sign(t5)).mean()
        q = pd.qcut(ev[f].rank(method='first'), 5, labels=False)
        spread = ev.loc[q == 4, '5日'].mean() - ev.loc[q == 0, '5日'].mean()
        F[f'ic_{name}'] = ' | '.join(f'{ic[name][h][1]:.1f}' for h in HOLD) + f' | {same * 100:.0f}% | {pc(spread, 2)}'
    F['n_years'] = ev['y'].nunique()
    # 分數：每個持有期取 |t| 最大的 3 個特徵(不含 T1 開盤才知道的)，各特徵在全樣本有利方向的前 40% 給 1 分
    picks, score_rows, strats = {}, [], []
    lab = {'yoy': '營收年增率', 'mom': '營收月增率', 'accel': '年增加速', 'streak': '連續成長月數', 'mutil': '融資使用率', 'r5': '事前 5 日報酬', 'r20': '事前 20 日報酬',
           'lag': '公告日距月底天數', 'mcap': '市值', 'a10': '10 日均成交金額', 'main5': '近 5 日主力買賣超', 'hi60': '距 60 日高點', 'f5': '外資 5 日買超比', 'i5': '投信 5 日買超比'}
    i0 = int(min(t0))
    for h in HOLD:
        best = sorted((n for n in FEAT if n not in NO_SCORE), key=lambda n: -abs(ic[n][h][1]))[:3]
        fs = [(FEAT[n][0], np.sign(ic[n][h][1])) for n in best]
        picks[h] = fs
        sc = sum(((ev[f] * d).rank(pct=True) > 0.6).astype(int) for f, d in fs)
        ev['s_' + h] = sc
        for s in range(4):
            x = ev.loc[sc == s, h].dropna()
            score_rows.append({'h': h, 's': s, 'n': len(x), 'mean': rnd(x.mean()), 'win': rnd((x > 0).mean())})
        F[f'pick_{h}'] = ' | '.join(f"{lab[f]}({'高' if d > 0 else '低' if f != 'streak' else '少'})" for f, d in fs)
        for g in GROUPS:
            m = np.ones(len(ev), bool) if g == '全部事件' else (sc.to_numpy() >= 2 if g == '分數 >= 2' else sc.to_numpy() == 3)
            n, x = HOLD[h]
            T, skipped = E.backtest(X.W, sig_frame(X, zip(t0[m], j[m])), {'side': 'long', 'tp': None, 'sl': None, 'hold': n, 'exit': x})
            nav, npos, ts = run(X, T, i0, fails=len(skipped))
            strats.append({'key': f'{h}｜{g}', 'h': h, 'g': g, 'nav': navlist(nav), 'ts': ts, 'npos': npos.tolist()})
            xs = stats(nav)
            F[f'st_{h}_{g}'] = f"{pc(xs['ret'], 0)} | {pc(xs['cagr'])} | {num(xs['sharpe'])} | {num(xs['sortino'])} | {pc(xs['mdd'], 1, False)} | {intc(ts['n'])} | {pc(ts['mean'], 2)} | {pc(ts['median'], 2)} | {intc(ts['nocash'])}"
            F[f'st_{h}_{g}_ret'], F[f'st_{h}_{g}_sharpe'] = pc(xs['ret'], 0), num(xs['sharpe'])
            if h == '5日' and g == '分數 = 3':
                yr = yearly([x.strftime('%Y-%m-%d') for x in X.D[i0:]], nav)
                F['s3_years'] = '、'.join(f'{y} 年 {pc(v, 0)}' for y, v in yr.items())
    for h in HOLD:
        F[f'score_{h}'] = [r for r in score_rows if r['h'] == h]
    F['score_rows'] = '\n'.join(f"| {s} | " + ' | '.join(f"{pc(r['mean'], 2)}（{r['win'] * 100:.0f}%）" for h in HOLD for r in F[f'score_{h}'] if r['s'] == s) + ' |' for s in range(4))
    # 分組明細：年增加速五分位、連續成長月數
    q = pd.qcut(ev['accel'].rank(method='first'), 5, labels=False)
    rows = []
    for k in range(5):
        x = ev[q == k]
        lo, hi = x['accel'].min(), x['accel'].max()
        rng = f'< {hi:.1f}' if k == 0 else f'> {lo:.1f}' if k == 4 else f'{lo:.1f} ～ {hi:.1f}'
        rows.append(f"| Q{k + 1}{'（減速最多）' if k == 0 else '（加速最多）' if k == 4 else ''} | {rng} | {intc(len(x))} | " + ' | '.join(pc(x[h].mean(), 2) for h in HOLD) + ' |')
    F['accel_rows'] = '\n'.join(rows)
    rows = []
    for name, lo, hi in [('1（剛轉為高成長）', 1, 1), ('2', 2, 2), ('3 ～ 5', 3, 5), ('6 ～ 11', 6, 11), ('12 以上', 12, 999)]:
        x = ev[(ev['streak'] >= lo) & (ev['streak'] <= hi)]
        rows.append(f'| {name} | {intc(len(x))} | ' + ' | '.join(pc(x[h].mean(), 2) for h in HOLD) + ' |')
    F['streak_rows'] = '\n'.join(rows)
    # 事件研究：全部月營收公告，公告前後各 10 個交易日的累積超額報酬(市值加權市場，不扣成本)
    car, car_rows, F2 = event_study(X)
    F.update(F2)
    d = [x.strftime('%Y-%m-%d') for x in X.D[i0:]]
    S0 = stats(E.bench_nav(X.W, i0))
    F['b0050'] = f"{pc(S0['ret'], 0)} | {pc(S0['cagr'])} | {num(S0['sharpe'])} | {num(S0['sortino'])} | {pc(S0['mdd'], 1, False)}"
    F['b_ret'], F['b_sharpe'] = pc(S0['ret'], 0), num(S0['sharpe'])
    F['end'] = d[-1]
    out = {'d': d, 'asof': d[-1], 'b0050': navlist(E.bench_nav(X.W, i0)), 'strats': strats, 'ic': out_ic, 'car': car,
           'score': score_rows}
    out['report'] = report('rev_growth', F)
    return out, F


def event_study(X):
    R = X.rev[(X.rev['lag'] <= LAG) & X.rev['yoy'].notna()]
    ret = np.vstack([np.full(X.C.shape[1], np.nan), X.C[1:] / X.C[:-1] - 1])
    w = np.where((X.A10 >= LIQ) & np.isfinite(X.mcap), X.mcap, 0.0)
    w[:, X.jx[E.BENCH]] = 0
    wp = np.vstack([np.zeros(w.shape[1]), w[:-1]])                       # 前一天收盤的市值與流動性決定權重
    mkt = (wp * np.nan_to_num(ret)).sum(1) / np.where(wp.sum(1) > 0, wp.sum(1), np.nan)
    ex = ret - mkt[:, None]
    t0, j = R['t0'].to_numpy(), R['j'].to_numpy()
    ok = (t0 >= 11) & (t0 + 10 < X.nd)
    ok[ok] &= np.isfinite(X.RC[t0[ok], j[ok]]) & (X.A10[t0[ok] - 11, j[ok]] >= LIQ)
    R, t0, j = R[ok], t0[ok], j[ok]
    path = np.nan_to_num(np.array([ex[t0 + k, j] for k in range(-9, 11)]))   # 第 -9 ～ +10 日的超額報酬
    cum = np.vstack([np.zeros(len(t0)), np.cumsum(path, 0)])                # 第 -10 日 = 0
    df = pd.DataFrame({'g': pd.cut(R['yoy'].to_numpy(), CAR_BINS, labels=CAR_LAB, right=False), 'pre': cum[10], 'react': path[10],
                       'post': cum[20] - cum[11], 'y': X.D[t0].year, 'yoy': R['yoy'].to_numpy(), 'prev': R['prev_yoy'].to_numpy()})
    car = {'x': list(range(-10, 11)), 'series': {}}
    F = {'car_n': intc(len(df))}
    rows = []
    show = lambda x: f"{intc(len(x))} | **{pc(x.pre.mean(), 2)}** | {x.pre.mean() / x.pre.std() * np.sqrt(len(x)):.1f} | {pc((x.pre > 0).mean(), 1, False)} | {pc(x.react.mean(), 2)} | {pc(x.post.mean(), 2)}"  # noqa: E731
    for k in CAR_LAB:
        m = (df['g'] == k).to_numpy()
        car['series'][k] = [round(float(v) * 100, 3) for v in cum[:, m].mean(1)]
        rows.append(f"| {k.replace('年增 ', '').replace('~', '～')} | {show(df[m])} |")
    big = df[df['yoy'] > 10]
    rows.append(f'| **年增 > 10% 合計** | {show(big)} |')
    F['car_rows'] = '\n'.join(rows)
    F['car_big_pre'], F['car_big_t'] = pc(big.pre.mean(), 2), num(big.pre.mean() / big.pre.std() * np.sqrt(len(big)), 1)
    F['car_big_pos'], F['car_big_n'] = pc((big.pre > 0).mean(), 1, False), intc(len(big))
    F['car_big_post'], F['car_big_react'] = pc(big.post.mean(), 2), pc(big.react.mean(), 2)
    top = df[df['yoy'] > 100]
    F['car_top_pre'] = pc(top.pre.mean(), 2)
    lo = df[(df['yoy'] >= 0) & (df['yoy'] < 10)]
    F['car_gap'] = f'{(big.pre.mean() - lo.pre.mean()) * 100:.1f}'
    F['car_lo_pre'] = pc(lo.pre.mean(), 2)
    yr = big.groupby('y')['pre'].mean()
    F['car_years'] = '、'.join(f'{y} 年 {pc(v, 2)}' for y, v in yr.items())
    rows = []
    acc = big['yoy'] - big['prev']
    q = pd.qcut(acc.rank(method='first'), 5, labels=False)
    for key, name, m in [('new', '上月年增 ≤ 10%（**剛轉為高成長**）', big['prev'] <= 10), ('cont', '上月年增 > 10%（**延續成長**）', big['prev'] > 10),
                         ('q1', '年增加速 Q1（減速最多）', q == 0), ('q5', '年增加速 Q5（加速最多）', q == 4)]:
        x = big[m]
        rows.append(f'| {name} | {intc(len(x))} | {pc(x.pre.mean(), 2)} | {pc((x.pre > 0).mean(), 1, False)} | {pc(x.react.mean(), 2)} | {pc(x.post.mean(), 2)} |')
        F['split_' + key] = (pc(x.pre.mean(), 2), pc(x.react.mean(), 2), pc(x.post.mean(), 2))
    F['split_rows'] = '\n'.join(rows)
    return car, rows, F


# ---------- 營收衰退開低 ----------
def rev_drop(X):
    R = X.rev
    ev = R[(R['yoy'] < -10) & (R['lag'] <= LAG)]
    funnel = {'營收年增率 < -10% 的公告（月底後 15 天內）': len(ev)}
    ev = ev[(ev['t0'] >= 20) & (ev['t0'] + 1 < X.nd)]
    t0, j = ev['t0'].to_numpy(), ev['j'].to_numpy()
    ok = np.isfinite(X.RC[t0, j]) & (X.VOL[t0 + 1, j] > 0)
    funnel['T0 有收盤價、T1 有成交'] = int(ok.sum())
    gap = X.O[t0 + 1, j] / X.C[t0, j] - 1
    ok &= gap <= -0.05 + 1e-9
    funnel['T1 開盤跳空 <= -5%（最終事件）'] = int(ok.sum())
    ev, t0, j, gap = ev[ok].copy(), t0[ok], j[ok], gap[ok]
    a20 = X.A20[t0, j]
    liq = a20 >= LIQ
    i0 = int(t0.min())
    d = [x.strftime('%Y-%m-%d') for x in X.D[i0:]]
    strats, groups, F = [], [], {}
    for h, (n, x) in [('日內', (1, 'close')), ('T+1', (1, 'open'))]:
        st = {'side': 'long', 'tp': None, 'sl': None, 'hold': n, 'exit': x}
        for g, m in [('全部', np.ones(len(t0), bool)), ('均額 ≥ 1 千萬', liq)]:
            T, skipped = E.backtest(X.W, sig_frame(X, zip(t0[m], j[m])), st)
            funnel[f'{h}：進場失敗'] = funnel.get(f'{h}：進場失敗', 0) + (len(skipped) if g == '全部' else 0)
            nav, npos, ts = run(X, T, i0, fails=len(skipped))
            k = f'{h}｜{g}'
            strats.append({'key': k, 'name': k, 'nav': navlist(nav), 'ts': ts, 'npos': npos.tolist()})
            xs = stats(nav)
            F[k] = (f"{pc(xs['ret'], 0)} | {pc(xs['cagr'])} | {pc(xs['vol'], 1, False)} | {num(xs['sharpe'])} | {num(xs['sortino'])} | {pc(xs['mdd'], 1, False)} | "
                    f"{xs['dd']} 天 | {intc(ts['n'])} | {pc(ts['win'], 1, False)} | {pc(ts['mean'], 2)} | {intc(ts['nocash'])}")
            F[k + '_ret'], F[k + '_cagr'], F[k + '_sharpe'], F[k + '_n'] = pc(xs['ret'], 0), pc(xs['cagr']), num(xs['sharpe']), intc(ts['n'])
            F[k + '_pos'], F[k + '_days'], F[k + '_held'] = num(ts['pos'], 1), num(ts['days'], 1), f"{ts['heldPct'] * 100:.0f}%"
            F[k + '_cap'] = f"{ts['cap'] * 100:.0f}%"
            if g == '全部' and h == '日內':
                F['yr_' + h] = yearly(d, nav)
        # 分組：全部可進場事件的每筆報酬(不受資金限制)
        T, _ = E.backtest(X.W, sig_frame(X, zip(t0, j)), st)
        r = {(tr[1], tr[0]): net_return(X, tr) for tr in T}
        ev[h] = [r.get((a, b), np.nan) for a, b in zip(t0, j)]
    ev['gap'], ev['a20'], ev['vol1'] = gap, a20, X.VOL[t0 + 1, j]
    spec = [('跳空', 'gap', [(-np.inf, -0.095, '<= -9.5%（接近跌停開）'), (-0.095, -0.07, '-9.5% ~ -7%'), (-0.07, 1, '-7% ~ -5%')]),
            ('營收年增率', 'yoy', [(-np.inf, -50, '<= -50%'), (-50, -30, '-50% ~ -30%'), (-30, 1e9, '-30% ~ -10%')]),
            ('事前 20 日均額', 'a20', [(-np.inf, 10_000, '< 1 千萬'), (10_000, 50_000, '1 千萬 ~ 5 千萬'), (50_000, np.inf, '>= 5 千萬')])]
    rows = []
    for gname, f, bins in spec:
        for i, (lo, hi, k) in enumerate(bins):
            x = ev[(ev[f] > lo) & (ev[f] <= hi)] if f != 'a20' else ev[(ev[f] >= lo) & (ev[f] < hi)]
            for h in ('日內', 'T+1'):
                y = x[h].dropna()
                groups.append({'s': h, 'g': gname, 'k': k, 'n': len(y), 'mean': rnd(y.mean()), 'median': rnd(y.median()), 'win': rnd((y > 0).mean()),
                               'vol': rnd(x['vol1'].mean(), 0)})
            a, b = x['日內'].dropna(), x['T+1'].dropna()
            rows.append(f"| {gname if k == bins[0][2] else ''} | {k.replace('~', '～').replace('<=', '≤').replace('>=', '≥')} | {intc(len(a))} | "
                        f"{pc(a.mean(), 2)} | {pc((a > 0).mean(), 1, False)} | {pc(b.mean(), 2)} | {intc(x['vol1'].mean())} |")
            F[f'g_{f}{i}'] = (pc(a.mean(), 2), pc((a > 0).mean(), 1, False), pc(b.mean(), 2), intc(x['vol1'].mean()), intc(len(a)))
    F['group_rows'] = '\n'.join(rows)
    F['f_all'], F['f_ok'], F['f_final'] = (intc(v) for v in list(funnel.values())[:3])
    S0 = stats(E.bench_nav(X.W, i0))
    F['b0050'] = (f"{pc(S0['ret'], 0)} | {pc(S0['cagr'])} | {pc(S0['vol'], 1, False)} | {num(S0['sharpe'])} | {num(S0['sortino'])} | {pc(S0['mdd'], 1, False)} | {S0['dd']} 天")
    F['b_ret'], F['b_sharpe'] = pc(S0['ret'], 0), num(S0['sharpe'])
    F['start'], F['end'] = d[1], d[-1]
    F['years'] = '、'.join(f'{y} {pc(v)}' for y, v in F.pop('yr_日內').items())
    out = {'d': d, 'asof': d[-1], 'b0050': navlist(E.bench_nav(X.W, i0)), 'strats': strats, 'groups': groups, 'funnel': funnel}
    out['report'] = report('rev_drop', F)
    return out, F


# ---------- 營收由負轉正 ----------
TURN = ['由負轉正', '持續成長', '持續衰退', '由正轉負']
HOLD_TURN = {'T+1': (1, 'open'), '5日': (5, 'close'), '10日': (10, 'close'), '20日': (20, 'close')}
PRE, POST = 10, 20


def event_trade(X, j, s, n, when):
    """一筆做多(和資金、其他訊號無關；分組統計用)：規則同 events.backtest。s 收盤選股，s+1 開盤買(漲停或沒成交延後一天)；
    持有 n 天後開盤(open：第 e+n 日)或收盤(close：第 e+n-1 日)賣，跌停或沒成交往後延；下市櫃以最後收盤價轉現金"""
    for e in (s + 1, s + 2):
        if e < X.nd and X.TR[e, j] and X.RO[e, j] < X.LU[e, j] - E.EPS:
            break
    else:
        return None
    t = e + n if when == 'open' else e + n - 1
    R = X.RO if when == 'open' else X.RC
    while t < X.nd and t <= X.LAST[j] and (not X.TR[t, j] or R[t, j] <= X.LD[t, j] + E.EPS):
        t += 1
    if t > X.LAST[j] and X.LAST[j] < X.nd - 1:
        return (j, s, e, int(X.LAST[j]), X.O[e, j], X.C[X.LAST[j], j], 'delist', 0, e - s - 1, 'close')
    if t >= X.nd:
        return (j, s, e, None, X.O[e, j], None, 'open', 0, e - s - 1, when)
    return (j, s, e, t, X.O[e, j], (X.O if when == 'open' else X.C)[t, j], 'time', 0, e - s - 1, when)


def rev_turn(X):
    R = X.rev.copy()
    # 截至上月，連續年增 < 0 的月數(月份要連續)
    neg, run_ = (R['yoy'] < 0).to_numpy(), np.zeros(len(R), int)
    same = (R['s'] == R['s'].shift(1)).to_numpy() & (R.groupby('s')['ym'].shift(1) == R['ym'] - pd.offsets.MonthBegin(1)).to_numpy()
    for i in range(len(R)):
        run_[i] = (run_[i - 1] + 1 if i and same[i] else 1) if neg[i] else 0
    R['negm'] = pd.Series(run_).groupby(R['s']).shift(1).where(same, 0).fillna(0).to_numpy()
    R = R[(R['lag'] <= LAG) & R['yoy'].notna() & R['prev_yoy'].notna() & (R['yoy'] != 0) & (R['prev_yoy'] != 0)].copy()
    R['g'] = np.select([(R['prev_yoy'] < 0) & (R['yoy'] > 0), (R['prev_yoy'] > 0) & (R['yoy'] > 0), (R['prev_yoy'] < 0) & (R['yoy'] < 0)], TURN[:3], TURN[3])
    F = {'n_all': intc(len(R)), 'n_all_turn': intc((R['g'] == '由負轉正').sum())}
    R = R[(R['t0'] >= PRE + 1) & (R['t0'] + 1 < X.nd)]
    t0, j = R['t0'].to_numpy(), R['j'].to_numpy()
    ok = np.isfinite(X.RC[t0, j]) & (X.A10[t0, j] >= LIQ)
    R, t0, j = R[ok].copy(), t0[ok], j[ok]
    F['n_liq'] = intc(len(R))
    # 每筆交易報酬(扣成本；每個事件獨立計算，不受資金與其他訊號影響)
    for h, (n, x) in HOLD_TURN.items():
        R[h] = [np.nan if (tr := event_trade(X, b, a, n, x)) is None else net_return(X, tr) for a, b in zip(t0, j)]
    ok = np.array([event_trade(X, b, a, 1, 'open') is not None for a, b in zip(t0, j)])      # T1 或 T2 開盤買得到
    R, t0, j = R[ok].copy(), t0[ok], j[ok]
    F['n_final'], F['n_turn'] = intc(len(R)), intc((R['g'] == '由負轉正').sum())

    def tt(x):
        x = x.dropna()
        return x.mean() / x.std(ddof=1) * np.sqrt(len(x))

    groups, rows = [], []
    for g in TURN:
        x = R[R['g'] == g]
        groups.append({'g': g, 'n': len(x), **{h: {'mean': rnd(x[h].mean()), 'win': rnd((x[h].dropna() > 0).mean())} for h in HOLD_TURN}})
        rows.append(f"| {'**' + g + '**' if g == '由負轉正' else g} | {intc(len(x))} | {pc(x['T+1'].mean(), 2)} | {pc(x['5日'].mean(), 2)} | {pc(x['10日'].mean(), 2)} | "
                    f"{pc((x['10日'].dropna() > 0).mean(), 1, False)} | {tt(x['10日']):.1f} | {pc(x['20日'].mean(), 2)} | {pc((x['20日'].dropna() > 0).mean(), 1, False)} | {tt(x['20日']):.1f} |")
        for h in HOLD_TURN:
            F[f'm_{g}_{h}'] = pc(x[h].mean(), 2)
        F[f'med_{g}_20日'], F[f't_{g}_10日'], F[f't_{g}_20日'] = pc(x['20日'].median(), 2), num(tt(x['10日']), 1), num(tt(x['20日']), 1)
    F['group_rows'] = '\n'.join(rows)
    T_ = R[R['g'] == '由負轉正']
    rows = []
    for name, lo, hi in [('1 個月', 1, 1), ('2 個月', 2, 2), ('3 ～ 5 個月', 3, 5), ('6 ～ 11 個月', 6, 11), ('12 個月以上', 12, 9999)]:
        x = T_[(T_['negm'] >= lo) & (T_['negm'] <= hi)]
        rows.append(f"| {name} | {intc(len(x))} | {pc(x['10日'].mean(), 2)} | {pc(x['20日'].mean(), 2)} | {pc((x['20日'].dropna() > 0).mean(), 1, False)} | {tt(x['20日']):.1f} |")
    F['neg_rows'] = '\n'.join(rows)
    rows = []
    for name, lo, hi in [('0% ～ 10%', 0, 10), ('10% ～ 30%', 10, 30), ('30% ～ 50%', 30, 50), ('50% ～ 100%', 50, 100), ('> 100%', 100, np.inf)]:
        x = T_[(T_['yoy'] > lo) & (T_['yoy'] <= hi)]
        rows.append(f"| {name} | {intc(len(x))} | {pc(x['10日'].mean(), 2)} | {pc(x['20日'].mean(), 2)} | {pc((x['20日'].dropna() > 0).mean(), 1, False)} | {tt(x['20日']):.1f} |")
    F['yoy_rows'] = '\n'.join(rows)
    yr = T_.groupby(X.D[T_['t0'].to_numpy()].year)['20日'].mean()
    F['turn_years'] = '、'.join(f'{y} 年 {pc(v, 2)}' for y, v in yr.items())
    F['turn_pos_years'], F['n_years'] = int((yr > 0).sum()), len(yr)
    # 事件研究：公告前 10 日到公告後 20 日的累積超額報酬(市值加權市場，不扣成本)
    ret = np.vstack([np.full(X.C.shape[1], np.nan), X.C[1:] / X.C[:-1] - 1])
    w = np.where((X.A10 >= LIQ) & np.isfinite(X.mcap), X.mcap, 0.0)
    w[:, X.jx[E.BENCH]] = 0
    wp = np.vstack([np.zeros(w.shape[1]), w[:-1]])
    mkt = (wp * np.nan_to_num(ret)).sum(1) / np.where(wp.sum(1) > 0, wp.sum(1), np.nan)
    ex = ret - mkt[:, None]
    m = t0 + POST < X.nd
    path = np.array([ex[t0[m] + k, j[m]] for k in range(-PRE + 1, POST + 1)])      # 第 -9 ～ +20 日
    good = np.isfinite(path).all(0)
    path, gg = path[:, good], R['g'].to_numpy()[m][good]
    cum = np.vstack([np.zeros(path.shape[1]), np.cumsum(path, 0)])                   # 第 -10 日 = 0
    car = {'x': list(range(-PRE, POST + 1)), 'series': {}}
    rows = []
    for g in TURN:
        k = gg == g
        car['series'][g] = [round(float(v) * 100, 3) for v in cum[:, k].mean(1)]
        win = {'pre': cum[PRE, k], 'react': cum[PRE + 1, k] - cum[PRE, k], 'p5': cum[PRE + 6, k] - cum[PRE + 1, k], 'p20': cum[PRE + POST, k] - cum[PRE + 1, k]}
        ts = {a: b.mean() / b.std(ddof=1) * np.sqrt(len(b)) for a, b in win.items()}
        rows.append(f"| {'**' + g + '**' if g == '由負轉正' else g} | {intc(k.sum())} | {pc(win['pre'].mean(), 2)} | {pc(win['react'].mean(), 2)} | {ts['react']:.1f} | "
                    f"{pc(win['p5'].mean(), 2)} | {pc(win['p20'].mean(), 2)} | {ts['p20']:.1f} |")
        F[f'car_{g}'] = {a: pc(b.mean(), 2) for a, b in win.items()}
        F[f'car_{g}_t'] = {a: num(b, 1) for a, b in ts.items()}
    F['car_rows'] = '\n'.join(rows)
    # 策略：門檻敏感度，持有 5、10、20 日(資金規則同台股策略)
    COND = {'由負轉正': R['g'] == '由負轉正',
            '負成長 ≥ 3 個月後轉正': (R['g'] == '由負轉正') & (R['negm'] >= 3),
            '負成長 ≥ 6 個月後轉正': (R['g'] == '由負轉正') & (R['negm'] >= 6),
            '轉正且年增 > 10%': (R['g'] == '由負轉正') & (R['yoy'] > 10),
            '轉正且年增 > 30%': (R['g'] == '由負轉正') & (R['yoy'] > 30),
            '持續成長（對照）': R['g'] == '持續成長'}
    i0 = int(t0.min())
    d = [x.strftime('%Y-%m-%d') for x in X.D[i0:]]
    strats, rows = [], []
    for h in ['20日', '10日', '5日']:
        n, x = HOLD_TURN[h]
        for g, mk in COND.items():
            mk = mk.to_numpy()
            T, skipped = E.backtest(X.W, sig_frame(X, zip(t0[mk], j[mk])), {'side': 'long', 'tp': None, 'sl': None, 'hold': n, 'exit': x})
            nav, npos, ts = run(X, T, i0, fails=len(skipped))
            strats.append({'key': f'{h}｜{g}', 'h': h, 'g': g, 'nav': navlist(nav), 'ts': ts, 'npos': npos.tolist()})
            xs = stats(nav)
            k = f'{h}｜{g}'
            F[k] = xs | {'ts': ts}
            F[k + '_ret'], F[k + '_cagr'], F[k + '_sharpe'] = pc(xs['ret'], 0), pc(xs['cagr']), num(xs['sharpe'])
            F[k + '_pos'], F[k + '_cap'] = num(ts['pos'], 0), f"{ts['cap'] * 100:.1f}%"
            rows.append(f"| {h.replace('日', ' 日')} | {'**' + g + '**' if g == '由負轉正' else g} | {pc(xs['ret'], 0)} | {pc(xs['cagr'])} | {pc(xs['vol'], 1, False)} | {num(xs['sharpe'])} | "
                        f"{num(xs['sortino'])} | {pc(xs['mdd'], 1, False)} | {intc(ts['n'])} | {pc(ts['mean'], 2)} | {intc(ts['nocash'])} |")
    S0 = stats(E.bench_nav(X.W, i0))
    rows.append(f"| – | 0050 買進持有 | {pc(S0['ret'], 0)} | {pc(S0['cagr'])} | {pc(S0['vol'], 1, False)} | {num(S0['sharpe'])} | {num(S0['sortino'])} | {pc(S0['mdd'], 1, False)} | – | – | – |")
    F['strat_rows'] = '\n'.join(rows)
    F['b_ret'], F['b_sharpe'] = pc(S0['ret'], 0), num(S0['sharpe'])
    sh20 = [F[f'20日｜{g}']['sharpe'] for g in COND if g != '持續成長（對照）']
    F['sh20_lo'], F['sh20_hi'] = num(min(sh20)), num(max(sh20))
    b = E.bench_nav(X.W, i0)
    yt, yc, yb = (yearly(d, s) for s in (strats[0]['nav'], strats[5]['nav'], b))
    F['beat_cont'], F['beat_0050'], F['n_yr'] = sum(yt[y] > yc[y] for y in yt), sum(yt[y] > yb[y] for y in yt), len(yt)
    F['start'], F['end'] = d[1], d[-1]
    out = {'d': d, 'asof': d[-1], 'b0050': navlist(b), 'strats': strats, 'car': car, 'groups': groups}
    out['report'] = report('rev_turn', F)
    return out, F


# ---------- 處置股策略 ----------
UTIL = 20                # 融資使用率門檻(%)：處置前一天收盤後已公布
UTILS = [None, 0, 10, 15, 20, 25, 30, 40]   # 敏感度(None = 不限，0 = 有融資餘額)
EXITS = {'open': '處置結束後一天開盤賣', 'close': '處置最後一天收盤賣'}
NEW_RULE = pd.Timestamp('2026-08-10')
SQL_DISP = '''
  SELECT "股票代號", "處置時間起"::date, "處置時間迄"::date, "處置措施", "處置內容" FROM cm.tw_disposition
  WHERE "股票代號" ~ '^[1-9][0-9]{3}$' '''


def disp_events(X):
    """處置事件(2016 起，上市櫃股票)：同一檔同一起日只留一筆；上櫃的處置措施欄是空的，內容提到「曾發布處置」就是再次處置。
    util = 處置前一天(d1 - 1)的融資使用率(%)，當晚和處置公告一起可以知道"""
    with pg_connect() as c:
        rows = c.execute(SQL_DISP).fetchall()
        util = c.execute('SELECT "日期", "股票代號", "資使用率" FROM cm.tw_daily WHERE "股票代號" = ANY(%s) AND "資使用率" IS NOT NULL',
                         (sorted({r[0] for r in rows}),)).fetchall()
    U = {(s, pd.Timestamp(d)): float(v) for d, s, v in util}
    ev = {}
    for code, st, en, kind, body in rows:
        j = X.jx.get(code)
        d1 = int(np.searchsorted(X.D.values, np.datetime64(st)))
        last = int(np.searchsorted(X.D.values, np.datetime64(en), side='right')) - 1
        if j is None or code == E.BENCH or d1 < 1 or d1 >= X.nd or last < d1:
            continue
        kind = kind or ('再次處置' if '曾發布處置' in (body or '') else '第一次處置')
        ev[(code, st)] = {'j': j, 'code': code, 'start': pd.Timestamp(st), 'end': pd.Timestamp(en), 'd1': d1, 'last': last, 'kind': kind,
                          'util': U.get((code, X.D[d1 - 1]), np.nan)}
    return sorted(ev.values(), key=lambda e: (e['start'], e['code']))


def disp_trades(X, evs, when):
    """處置第一天收盤買進(收盤漲停或沒有成交延到隔天收盤，仍買不到就放棄；第二天已經出關也放棄)；
    when='close'：處置最後一天收盤賣、'open'：處置結束後第一個交易日開盤賣(跌停或沒有成交往後延，下市櫃以最後收盤價轉現金)。
    同一檔同時只持有一筆。格式同 events.backtest 的交易(第 2 個欄位換成事件的位置)"""
    out, fails, free = [], 0, {}
    for k, ev in enumerate(evs):
        j, d1, last = ev['j'], ev['d1'], ev['last']
        e = next((t for t in (d1, d1 + 1) if t <= last and t < X.nd and X.TR[t, j] and X.RC[t, j] < X.LU[t, j] - E.EPS), None)
        if e is None:
            fails += d1 + 1 < X.nd
            continue
        if e < free.get(j, -1):
            continue
        x0, R = (max(last, e + 1), X.RC) if when == 'close' else (last + 1, X.RO)
        t = x0
        while t < X.nd and t <= X.LAST[j] and (not X.TR[t, j] or R[t, j] <= X.LD[t, j] + E.EPS):
            t += 1
        if t > X.LAST[j] and X.LAST[j] < X.nd - 1:
            tr = (j, k, e, int(X.LAST[j]), X.C[e, j], X.C[X.LAST[j], j], 'delist', 0, e - d1, 'close')
        elif t >= X.nd:
            tr = (j, k, e, None, X.C[e, j], None, 'open', 0, e - d1, when)
        else:
            tr = (j, k, e, t, X.C[e, j], (X.C if when == 'close' else X.O)[t, j], 'time', t - x0, e - d1, when)
        out.append(tr)
        free[j] = X.nd if tr[3] is None else tr[3] + (when == 'close')
    return out, fails


def disp_simulate(X, trades, i0):
    """收盤進場的資金模擬(處置股策略的資金規則，使用者指定)：有新股票進場的那天收盤，先處理當天的出場，
    再把總資產平均分散到所有持股：每檔目標 = 前一天收盤總資產 ÷ 持有檔數(含新進場的，不另設上限)；
    先減碼、再買進新股票(現金不夠就平分剩下的現金)、最後補足，都以一股的價格無條件捨去到整數股；收盤漲跌停或沒有成交的部位不調整。
    沒有新股票進場的日子不調整。回傳 (淨值, 每天收盤的持有檔數, 每筆報酬)"""
    C, Craw, O, RC, RO, LU, LD, TR, nd = X.C, X.Craw, X.O, X.RC, X.RO, X.LU, X.LD, X.TR, X.nd
    ins, outs = {}, {}
    for k, tr in enumerate(trades):
        ins.setdefault(tr[2], []).append(k)
        if tr[3] is not None:
            outs.setdefault(tr[3], []).append(k)
    cash, pos, res = float(E.CAPITAL), {}, {}                   # pos[k] = [還原股價計的單位數, 投入金額, 收回金額]
    nav, npos = np.ones(nd), np.zeros(nd, int)

    def trade(k, t, sh, buy):
        nonlocal cash
        j = trades[k][0]
        px = E.fill(RC[t, j], buy, LU[t, j], LD[t, j])
        amt = sh * px
        u = amt / (Craw[t, j] * px / RC[t, j])
        p = pos.setdefault(k, [0.0, 0.0, 0.0])
        if buy:
            cash -= amt * (1 + E.FEE)
            p[0] += u
            p[1] += amt * (1 + E.FEE)
        else:
            got = amt * (1 - E.FEE - E.TAX)
            cash += got
            p[0] -= min(u, p[0])
            p[2] += got

    def close_out(k, t):
        nonlocal cash
        j, px, why, when = trades[k][0], trades[k][5], trades[k][6], trades[k][9]
        u, paid, got = pos.pop(k)
        if why == 'delist':
            out = u * px                                          # 下市櫃：以最後收盤價轉為現金，不計成本
        else:
            raw = RO[t, j] if when == 'open' else RC[t, j]
            out = u * px * E.fill(raw, False, LU[t, j], LD[t, j]) / raw * (1 - E.FEE - E.TAX)
        cash += out
        res[k] = (got + out) / paid - 1

    for t in range(i0 + 1, nd):
        eq = cash + sum(pos[k][0] * C[t - 1, trades[k][0]] for k in pos)
        for k in sorted((k for k in outs.get(t, []) if k in pos), key=lambda k: trades[k][9] != 'open'):
            close_out(k, t)
        new = sorted(ins.get(t, []), key=lambda k: trades[k][0])
        if new:
            keep = list(pos)
            target = eq / (len(keep) + len(new))
            for k in keep:                                        # 先減碼
                j = trades[k][0]
                if TR[t, j] and RC[t, j] > LD[t, j] + E.EPS:
                    sh = int((pos[k][0] * Craw[t, j] - target) / RC[t, j])
                    if sh > 0:
                        trade(k, t, sh, False)
            for i, k in enumerate(new):                           # 再進場：現金不夠就平分剩下的現金
                j = trades[k][0]
                sh = int(max(0.0, min(target, cash / (len(new) - i))) / (E.fill(RC[t, j], True, LU[t, j], LD[t, j]) * (1 + E.FEE)))
                if sh > 0:
                    trade(k, t, sh, True)
            for k in keep:                                        # 最後補足
                j = trades[k][0]
                if TR[t, j] and RC[t, j] < LU[t, j] - E.EPS:
                    sh = int(max(0.0, min(target - pos[k][0] * Craw[t, j], cash)) / (E.fill(RC[t, j], True, LU[t, j], LD[t, j]) * (1 + E.FEE)))
                    if sh > 0:
                        trade(k, t, sh, True)
        npos[t] = len(pos)
        nav[t] = (cash + sum(pos[k][0] * C[t, trades[k][0]] for k in pos)) / E.CAPITAL
    for k in pos:                                                 # 持有中：以最新收盤價計(已扣進場成本)
        res[k] = (pos[k][2] + pos[k][0] * C[-1, trades[k][0]]) / pos[k][1] - 1
    return nav, npos, res


def disp(X):
    """主策略只回測新制(2026/8/10 起開始的處置)；門檻與出場的依據用 2016 年起的全部處置事件(新舊制，資金規則相同)"""
    evs = disp_events(X)
    sel = {u: [e for e in evs if u is None or (np.isfinite(e['util']) and (e['util'] > 0 if u == 0 else e['util'] >= u))] for u in UTILS}
    fmt = lambda t: X.D[t].strftime('%Y-%m-%d')  # noqa: E731
    short = lambda u: '不限' if u is None else '有融資餘額' if u == 0 else f'≥ {u}%'  # noqa: E731
    lab = lambda u: '不限融資' if u is None else '有融資餘額' if u == 0 else f'融資使用率 ≥ {u}%'  # noqa: E731

    def sim(E_, when, i0):
        T, fails = disp_trades(X, E_, when)
        nav, npos, res = disp_simulate(X, T, i0)
        nav, npos = nav[i0:], npos[i0:]
        done = [k for k in res if T[k][3] is not None]
        r = np.array([res[k] for k in done])
        hd = npos > 0
        ts = {'n': len(r), 'win': rnd((r > 0).mean()) if len(r) else None, 'mean': rnd(r.mean()) if len(r) else None,
              'median': rnd(np.median(r)) if len(r) else None, 'pos': rnd(npos[hd].mean()),
              'days': rnd(np.mean([T[k][3] - T[k][2] for k in done])) if done else None, 'heldPct': rnd(hd[1:].mean()), 'nocash': len(T) - len(res),
              'fail': fails, 'delist': sum(T[k][6] == 'delist' for k in done)}
        return nav, npos, res, ts, T

    def cells(F, nm, x, ts):
        F[nm + '_ret'], F[nm + '_cagr'], F[nm + '_sharpe'], F[nm + '_sortino'] = pc(x['ret'], 1), pc(x['cagr']), num(x['sharpe']), num(x['sortino'])
        F[nm + '_mdd'], F[nm + '_vol'], F[nm + '_n'], F[nm + '_win'], F[nm + '_mean'] = pc(x['mdd'], 1, False), pc(x['vol'], 1, False), intc(ts['n']), pc(ts['win'], 1, False), pc(ts['mean'], 2)
        F[nm + '_row'] = perf_cells(x, ts['mean'], ts['win']).replace(pc(x['ret'], 0), pc(x['ret'], 1), 1)

    F, sens = {}, []
    # 1. 主策略：新制上路後(處置起日 ≥ 2026/8/10)，期初 = 第一筆可進場日的前一天收盤
    new = [e for e in sel[UTIL] if e['start'] >= NEW_RULE]
    i0 = min(t[2] for t in disp_trades(X, new, 'open')[0]) - 1
    d = [x.strftime('%Y-%m-%d') for x in X.D[i0:]]
    b = E.bench_nav(X.W, i0)
    S0 = stats(b)
    nav, npos, res, ts, T = sim(new, 'open', i0)
    M = stats(nav)
    cells(F, 'm', M, ts)
    F['m_pos'], F['m_held'] = num(ts['pos'], 1), f"{ts['heldPct'] * 100:.0f}%"
    F['m_days'] = num(ts['days'], 1) if ts['days'] is not None else '–'
    # 交易明細：[代號, 名稱, 處置期間, 處置措施, 融資使用率, 進場日, 出場日, 報酬(持有中以最新收盤計)]
    strat = {'name': f'{lab(UTIL)}｜{EXITS["open"]}', 'nav': navlist(nav), 'ts': ts, 'npos': npos.tolist(),
             'trades': [[X.stocks[T[k][0]], X.names.get(X.stocks[T[k][0]], ('',))[0], f"{new[T[k][1]]['start']:%Y-%m-%d}～{new[T[k][1]]['end']:%Y-%m-%d}",
                         new[T[k][1]]['kind'], round(new[T[k][1]]['util'], 2), fmt(T[k][2]), fmt(T[k][3]) if T[k][3] is not None else None, rnd(res[k])]
                        for k in sorted(res, key=lambda k: (T[k][2], T[k][0]))]}
    navc, _, _, tsc, _ = sim(new, 'close', i0)
    cells(F, 'mc', stats(navc), tsc)
    navn, _, _, tsn, _ = sim([e for e in evs if e['start'] >= NEW_RULE], 'open', i0)
    cells(F, 'na', stats(navn), tsn)
    F['b0050'], F['b_ret'], F['b_cagr'], F['b_sharpe'], F['b_mdd'] = perf_cells(S0).replace(pc(S0['ret'], 0), pc(S0['ret'], 1), 1), pc(S0['ret'], 1), pc(S0['cagr']), num(S0['sharpe']), pc(S0['mdd'], 1, False)
    F['start'], F['end'], F['n_days'] = d[1], d[-1], len(d) - 1
    # 2. 依據：2016 年起全部處置事件(新舊制)，門檻敏感度 × 出場
    T0, _ = disp_trades(X, evs, 'close')
    j0 = min(t[2] for t in T0) - 1
    dl = [x.strftime('%Y-%m-%d') for x in X.D[j0:]]
    L0 = stats(E.bench_nav(X.W, j0))
    H = {}
    for u in UTILS:
        for when in ('open', 'close'):
            navl, _, resl, tsl, Tl = sim(sel[u], when, j0)
            xs = stats(navl)
            H[(u, when)] = xs
            if u is None and when == 'open':
                G = disp_groups(Tl, resl, evs)
            sens.append(f"| {'**' + short(u) + '**' if u == UTIL else short(u)} | {EXITS[when]} | {pc(xs['cagr'])} | {num(xs['sharpe'])} | {num(xs['sortino'])} | "
                        f"{pc(xs['mdd'], 1, False)} | {intc(tsl['n'])} | {pc(tsl['win'], 1, False)} | {pc(tsl['mean'], 2)} |")
    F['l_start'], F['l_end'] = dl[1], dl[-1]
    F['l_cagr'], F['l_sharpe'] = pc(H[(UTIL, 'open')]['cagr']), num(H[(UTIL, 'open')]['sharpe'])
    F['l_bcagr'], F['l_bsharpe'] = pc(L0['cagr']), num(L0['sharpe'])
    sh = [H[(u, 'open')]['sharpe'] for u in (10, 15, 20, 25, 30, 40)]
    F['sh_lo'], F['sh_hi'] = num(min(sh)), num(max(sh))
    F['open_wins'] = sum(H[(u, 'open')]['sharpe'] > H[(u, 'close')]['sharpe'] for u in UTILS[1:])
    F['n_utils'] = len(UTILS) - 1
    F['sens_rows'] = '\n'.join(sens)
    F['n_events'], F['n_new'] = intc(len(evs)), intc(sum(e['start'] >= NEW_RULE for e in evs))
    F['group_rows'] = '\n'.join(f"| {g['g']} | {g['k']} | {intc(g['n'])} | {pc(g['mean'], 2)} | {pc(g['median'], 2)} | {pc(g['win'], 1, False)} |" for g in G)
    gq = {g['k']: g for g in G if g['g'] == '融資使用率'}
    F['util_lo'], F['util_hi'] = pc(gq['< 10%']['mean'], 2), pc(gq['≥ 40%']['mean'], 2)
    out = {'d': d, 'asof': d[-1], 'b0050': navlist(b), 'util': UTIL, 'newRule': NEW_RULE.strftime('%Y-%m-%d'), 'strat': strat, 'groups': G, 'report': report('disp', F)}
    return out, F


def disp_groups(T, res, evs):
    """全部處置事件(不限融資使用率、隔天開盤賣)的每筆報酬，依融資使用率、處置措施、新舊制分組"""
    df = pd.DataFrame([{'r': res[k], 'util': evs[T[k][1]]['util'], 'kind': evs[T[k][1]]['kind'], 'new': evs[T[k][1]]['start'] >= NEW_RULE}
                       for k in res if T[k][3] is not None])
    u = df['util']
    spec = [('融資使用率', [('沒有融資餘額', ~(u > 0)), ('< 10%', (u > 0) & (u < 10)), ('10% ～ 20%', (u >= 10) & (u < 20)),
                       ('20% ～ 40%', (u >= 20) & (u < 40)), ('≥ 40%', u >= 40)]),
            ('處置措施', [(k, df['kind'] == k) for k in ('第一次處置', '再次處置', '第二次處置', '人工管制撮合')]),
            ('新舊制', [('舊制', ~df['new']), ('新制(2026/8/10 起)', df['new'])])]
    out = []
    for g, items in spec:
        for k, m in items:
            r = df.loc[m, 'r']
            if len(r):
                out.append({'g': g, 'k': k, 'n': len(r), 'mean': rnd(r.mean()), 'median': rnd(r.median()), 'win': rnd((r > 0).mean())})
    return out


STUDIES = {'rev_pre': rev_pre, 'rev_growth': rev_growth, 'rev_drop': rev_drop, 'rev_turn': rev_turn, 'disp': disp}



def main(keys=None, data=None, write=True):
    X = Data(data)
    out = dataset_dir(NAME, clean=False)
    res = {}
    for key, fn in STUDIES.items():
        if keys and key not in keys:
            continue
        res[key] = fn(X)
        if write:
            write_json(out / f'{key}.json', res[key][0])
            print(f'{key}.json：{(out / f"{key}.json").stat().st_size / 1024:.0f} KB')
    if write:
        write_meta(NAME, '台股日資料、月營收(本機計算)', '', '不定期(研究更新時手動執行)')
    return res


if __name__ == '__main__':
    main(sys.argv[1:] or None)
