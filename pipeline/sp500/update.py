"""
資料集 sp500：S&P500 季度換股策略回測(使用當時真實的歷史成分股，降低倖存者偏差)

成分股名單：github.com/fja05680/sp500(1996 起每次成分股異動後的完整名單)
股價：Yahoo Finance(還原股價，含股息)；Yahoo 沒有的已下市/被併購公司改用 Tiingo(需要 TIINGO_API_KEY)
  Tiingo 的原始股價只存在本機快取 ~/.cache/little-trader/tiingo/，不發佈(資料授權不允許轉載)，網站只放回測結果。

每季最後一個交易日收盤，依「上一季」的表現挑選當時的成分股，持有一季：
  s1 上季贏家：報酬最好的 10 檔，等權重
  s2 上季輸家：報酬最差的 10 檔，等權重
  s3 上季高夏普＋最佳化：夏普值最好的 20 檔，以極大化夏普值決定權重(只做多)
  s4 上季贏家中低波動：報酬最好的 20 檔中，波動最小的 10 檔，等權重
  ew 全部成分股等權重(與 SPY 的市值加權對照)
持有期間股票下市(沒有股價)就以最後價格轉為現金；交易成本由網頁依換手率另外扣除。

執行方式
  python pipeline/sp500/update.py          增量：讀回已發佈的結果，只重算最近幾季(GitHub Actions 每週)
  python pipeline/sp500/update.py --full   從 2000 年完整重算(需要本機的 Tiingo 快取或 TIINGO_API_KEY)
  加上 --offline 只用本機快取，不向 Tiingo 下載

輸出 web/data/sp500/backtest.json：
  d 交易日、nav 各策略與 SPY 的每日淨值(未扣交易成本)、q 每季的成分股數、可用數、換手率、無風險利率、持股
"""
import io
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, load_published, write_json, write_meta  # noqa: E402

NAME = 'sp500'
MEMBERS_URL = 'https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes%20(Updated).csv'
START = '2000-01-01'                 # 第一次換股：1999 年最後一個交易日
STRATS = ['s1', 's2', 's3', 's4', 'ew']
CACHE = Path(os.path.expanduser('~/.cache/little-trader/tiingo'))
MIN_COVER = 0.8                      # 訊號季至少要有 80% 交易日有股價才列入
MIN_DOLLAR_VOL = 2e6                 # 成分股期間每日成交金額的中位數(美元)；太低代表代號已被別家小公司沿用(Yahoo、Tiingo 都會遇到)


def yahoo_sym(t):
    return t.replace('.', '-')


def load_members():
    r = requests.get(MEMBERS_URL, timeout=60)
    r.raise_for_status()
    m = pd.read_csv(io.StringIO(r.text))
    m['date'] = pd.to_datetime(m['date'])
    m['tickers'] = m['tickers'].map(lambda s: sorted(set(str(s).split(','))))
    return m.sort_values('date').reset_index(drop=True)


def members_at(M, day):
    row = M[M['date'] <= day]
    return row.iloc[-1]['tickers'] if len(row) else []


def yahoo_close(symbols, start, with_volume=False):
    """還原股價(含股息)；with_volume=True 另外回傳每日成交金額(未還原收盤價 × 成交量)"""
    df = yf.download(symbols, start=start, auto_adjust=False, progress=False, threads=True, group_by='column')
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return (df['Adj Close'], df['Close'] * df['Volume']) if with_volume else df['Adj Close']


def tiingo_series(t, key):
    """Tiingo 的還原股價與每日成交金額(未還原收盤價 × 成交量)；先查本機快取，沒有且有金鑰才下載(下載後寫回快取)。
    回傳 (還原股價, 成交金額或 None)；舊版快取沒有成交金額時第二項為 None"""
    f = CACHE / f'{yahoo_sym(t)}.json'
    if not f.exists() and key:
        CACHE.mkdir(parents=True, exist_ok=True)
        r = requests.get(f'https://api.tiingo.com/tiingo/daily/{t.lower()}/prices',
                         params={'startDate': '1995-01-01', 'token': key, 'columns': 'adjClose,close,volume'}, timeout=60)
        if r.status_code == 200 and r.text.startswith('['):
            rows = r.json()
            f.write_text(json.dumps({'d': [x['date'][:10] for x in rows], 'c': [x['adjClose'] for x in rows],
                                     'dv': [round((x.get('close') or 0) * (x.get('volume') or 0)) for x in rows]}))
        elif 'allocation' in r.text.lower() or r.status_code == 429:
            print(f'Tiingo 達到請求上限，略過 {t}', file=sys.stderr)
            return None, None
        else:
            f.write_text(json.dumps({'d': [], 'c': [], 'err': r.text[:200]}))
        time.sleep(1)
    if not f.exists():
        return None, None
    j = json.loads(f.read_text())
    if not j['d']:
        return None, None
    idx = pd.to_datetime(j['d'])
    adj = pd.Series(j['c'], index=idx, dtype=float)
    dv = pd.Series(j['dv'], index=idx, dtype=float) if 'dv' in j else None
    return adj, dv


def quarter_ends(days):
    """每季最後一個交易日"""
    s = pd.Series(days, index=days)
    return list(s.groupby(s.index.to_period('Q')).max())


def usable(s, a, b, days):
    """股價在 (a, b] 這一季的交易日覆蓋率夠高，且 b 當天有價格"""
    seg = s.loc[a:b]
    n = ((days > a) & (days <= b)).sum()
    return pd.notna(s.get(b)) and pd.notna(s.get(a)) and seg.iloc[1:].notna().sum() >= MIN_COVER * n


def max_sharpe(R, rf):
    """上一季日報酬 R(天數 × 檔數)，只做多、權重和為 1，極大化年化夏普值"""
    mu, cov = R.mean().values * 252, R.cov().values * 252
    n = len(mu)
    obj = lambda w: -(w @ mu - rf) / np.sqrt(max(w @ cov @ w, 1e-12))
    res = minimize(obj, np.full(n, 1 / n), method='SLSQP', bounds=[(0, 1)] * n,
                   constraints=[{'type': 'eq', 'fun': lambda w: w.sum() - 1}], options={'maxiter': 500})
    w = np.clip(res.x if res.success else np.full(n, 1 / n), 0, None)
    w[w < 1e-4] = 0
    return w / w.sum()


def run(P, M, days, qends, rf_q, k0):
    """從第 k0 個季末開始換股，回傳每日報酬、每季紀錄。P：交易日 × 股票的還原股價(已對齊 days)"""
    daily = {s: pd.Series(0.0, index=days) for s in STRATS}
    quarters, prev_end_w = [], {s: None for s in STRATS}
    for k in range(k0, len(qends)):
        a, R = qends[k - 1], qends[k]
        b = qends[k + 1] if k + 1 < len(qends) else days[-1]
        if b <= R:
            break
        mem = [t for t in members_at(M, R) if t in P.columns]
        ok = [t for t in mem if usable(P[t], a, R, days)]
        n_mem = len(members_at(M, R))
        seg = P.loc[a:R, ok]
        ret = seg.iloc[-1] / seg.iloc[0] - 1
        dr = seg.pct_change(fill_method=None).iloc[1:]
        vol = dr.std() * np.sqrt(252)
        shp = dr.mean() * 252 / vol.replace(0, np.nan)
        rf = rf_q.get(R, 0.0)
        picks = {}
        top20 = ret.nlargest(20).index
        picks['s1'] = pd.Series(0.1, index=ret.nlargest(10).index)
        picks['s2'] = pd.Series(0.1, index=ret.nsmallest(10).index)
        s3 = shp.dropna().nlargest(20).index
        picks['s3'] = pd.Series(max_sharpe(dr[s3].fillna(0), rf), index=s3)
        picks['s3'] = picks['s3'][picks['s3'] > 0]
        picks['s4'] = pd.Series(0.1, index=vol[top20].nsmallest(10).index)
        picks['ew'] = pd.Series(1 / len(ok), index=ok)
        hold = P.loc[R:b]
        rec = {'q': str(pd.Period(b, 'Q')), 'start': R.strftime('%Y-%m-%d'),
               'members': n_mem, 'usable': len(ok), 'rf': round(rf, 5), 'turn': {}, 'picks': {}, 'done': k + 1 < len(qends)}
        for s in STRATS:
            w = picks[s]
            px = hold[w.index].ffill()                        # 下市後沿用最後價格 = 轉為現金
            val = px / px.iloc[0] * w
            nav = val.sum(axis=1)
            daily[s].loc[nav.index[1:]] = nav.pct_change().iloc[1:].values
            # 換手率：新權重 vs 上一季期末漂移後的權重(現金部位不收費)
            old = prev_end_w[s]
            rec['turn'][s] = round(float(1.0 if old is None else w.subtract(old, fill_value=0).abs().sum()), 4)
            end = val.iloc[-1]
            prev_end_w[s] = end / end.sum()
            if s != 'ew':
                rec['picks'][s] = [[t, round(float(x), 4), round(float(ret[t]), 4)] for t, x in w.sort_values(ascending=False).items()]
        quarters.append(rec)
    return daily, quarters


def build_prices(M, days, start, tiingo_key):
    """所有在期間內當過成分股的股票：Yahoo 優先，Yahoo 沒有該段股價時改用 Tiingo。
    代號可能被別家公司沿用(例如 EP 原為 El Paso，現在是小型股 Empire Petroleum)，兩個來源都用
    「成分股期間每日成交金額的中位數 ≥ MIN_DOLLAR_VOL」確認股價真的屬於當時的成分股。"""
    tick = sorted({t for ts in M[M['date'] >= pd.Timestamp(start) - pd.Timedelta(days=120)]['tickers'] for t in ts})
    yc, dv = yahoo_close([yahoo_sym(t) for t in tick], start, with_volume=True)
    cols, src = {}, {'yahoo': 0, 'tiingo': 0, 'none': 0, 'reused': []}
    for t in tick:
        ys = yahoo_sym(t)
        y = yc[ys].reindex(days) if ys in yc.columns else None
        # 該股票當成分股的期間
        inmem = [d for d, ts in zip(M['date'], M['tickers']) if t in ts and d >= pd.Timestamp(start)]
        span = (min(inmem) if inmem else days[0], max(inmem) if inmem else days[-1])
        need = (days >= span[0]) & (days <= span[1])
        yahoo_reused = y is not None and y[need].notna().any() and dv[ys].reindex(days)[need].median() < MIN_DOLLAR_VOL
        if yahoo_reused:
            src['reused'].append(t + '(Yahoo)')
            y = None
        if y is not None and y[need].notna().mean() >= MIN_COVER:
            cols[t] = y; src['yahoo'] += 1; continue
        ti, tdv = tiingo_series(t, tiingo_key)
        # Yahoo 的代號已被沿用、Tiingo 的同一代號也還在交易到現在：多半是同一家新公司(例如 CCU 原為 Clear Channel，
        # 現在是智利啤酒商 Cervecerías Unidas)，不採用；真正下市的公司在 Tiingo 的股價會停在下市日
        if ti is not None and yahoo_reused and ti.index.max() >= days[-1] - pd.Timedelta(days=30):
            src['reused'].append(t + '(Tiingo)')
            ti = None
        if ti is not None:
            ti = ti[~ti.index.duplicated()].reindex(days)
            if ti[need].notna().mean() >= 0.5:
                if tdv is None or tdv[~tdv.index.duplicated()].reindex(days)[need].median() >= MIN_DOLLAR_VOL:
                    cols[t] = ti; src['tiingo'] += 1; continue
                src['reused'].append(t + '(Tiingo)')
        if y is not None and y.notna().any():
            cols[t] = y; src['yahoo'] += 1
        else:
            src['none'] += 1
    return pd.DataFrame(cols, index=days), src


def main():
    full = '--full' in sys.argv
    key = os.environ.get('TIINGO_API_KEY') or (Path(os.path.expanduser('~/.tiingo_key')).read_text().strip() if Path(os.path.expanduser('~/.tiingo_key')).exists() else '')
    if '--offline' in sys.argv:          # 只用本機快取，不向 Tiingo 下載
        key = ''
    M = load_members()
    old = None if full else load_published(NAME, 'backtest.json')
    if old is None and not full:
        print('沒有已發佈的回測結果，需要先在本機執行 --full', file=sys.stderr)
        sys.exit(1)

    # 增量：從已發佈的倒數第 3 季重算(前一季只用來取得期末權重，從倒數第 2 季開始覆蓋)
    if full:
        start = '1999-09-01'
    else:
        start = (pd.Timestamp(old['q'][-3]['start']) - pd.Timedelta(days=120)).strftime('%Y-%m-%d')
    bench = yahoo_close(['SPY', '^IRX'], start)
    days = pd.DatetimeIndex(bench['SPY'].dropna().index)
    qends = [q for q in quarter_ends(days)]
    irx = bench['^IRX'].reindex(days).ffill() / 100
    rf_q = {q: float(irx.loc[:q].iloc[-1]) if irx.loc[:q].notna().any() else 0.0 for q in qends}
    P, src = build_prices(M, days, start, key)
    print('股價來源', src)

    if full:
        k0 = next(i for i, q in enumerate(qends) if q >= pd.Timestamp(START) - pd.Timedelta(days=10))   # 1999 年最後一個交易日
        daily, quarters = run(P, M, days, qends, rf_q, k0)
        first = pd.Timestamp(quarters[0]['start'])
        d = days[days >= first]
        out_q = quarters
        base_d, base_nav = [], {}
        new_d = d
        new_ret = {s: daily[s].loc[d] for s in STRATS}
    else:
        oq = old['q']
        restart = pd.Timestamp(oq[-3]['start'])
        k0 = next(i for i, q in enumerate(qends) if q >= restart)
        daily, quarters = run(P, M, days, qends, rf_q, k0)
        quarters = quarters[1:]                              # 第一季只用來算期末權重
        cut = quarters[0]['start']
        keep = [i for i, x in enumerate(old['d']) if x <= cut]
        base_d = [old['d'][i] for i in keep]
        base_nav = {s: [old['nav'][s][i] for i in keep] for s in old['nav']}
        out_q = [x for x in oq if x['start'] < cut] + quarters
        new_d = days[days >= pd.Timestamp(cut)]
        new_ret = {s: daily[s].loc[new_d] for s in STRATS}

    # 合併每日淨值(SPY 用 Yahoo 還原股價)
    if full:
        dates = [x.strftime('%Y-%m-%d') for x in new_d]
        navs = {}
        for s in STRATS:
            r = new_ret[s].copy(); r.iloc[0] = 0
            navs[s] = list((1 + r).cumprod().round(6))
        for b in ['SPY']:
            px = bench[b].reindex(new_d)
            navs[b.lower()] = [None if pd.isna(v) else round(float(v), 6) for v in (px / px.loc[px.first_valid_index()])]
    else:
        dates = base_d + [x.strftime('%Y-%m-%d') for x in new_d[1:]]
        navs = {}
        for s in STRATS:
            r = new_ret[s].iloc[1:]
            navs[s] = base_nav[s] + list((base_nav[s][-1] * (1 + r).cumprod()).round(6))
        for b in ['SPY']:
            px = bench[b].reindex(new_d)
            base = base_nav[b.lower()][-1]
            navs[b.lower()] = base_nav[b.lower()] + [round(float(base * v), 6) for v in (px / px.iloc[0]).iloc[1:]]
    irx_out = irx.reindex(pd.to_datetime(dates)).ffill().fillna(0)

    out = dataset_dir(NAME)
    write_json(out / 'backtest.json', {
        'd': dates, 'nav': {k: v for k, v in navs.items() if k != 'rsp'}, 'q': out_q,
        'asof': dates[-1],
        'note': '每季最後一個交易日收盤換股；nav 為未扣交易成本的每日淨值；q[].turn 為換手率(新舊權重差的絕對值加總)',
    })
    write_meta(NAME, 'S&P500 歷史成分股(fja05680/sp500)、Yahoo Finance、Tiingo',
               'https://github.com/fja05680/sp500', '每週六更新(美股收盤後)',
               files=['backtest.json'], price_sources=src, rf_last=round(float(irx_out.iloc[-1]), 4))
    print('完成', dates[0], '~', dates[-1], len(out_q), '季')


if __name__ == '__main__':
    main()
