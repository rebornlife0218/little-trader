"""
資料集 tw_strategy：台股低波動策略回測(資料來自本機 PostgreSQL 的 cm schema) → web/data/tw_strategy/
原始版本：rebornlife0218/Trading_Strategy 的 LowVolatility_TW.py(已整合到這裡並從該 repo 刪除，最後版本在 commit cf78ce9)，這裡修正它的偏誤：
  - 前視偏誤：原版用「當天收盤」選股，同一天的報酬就算進組合。這裡在每月最後一個交易日收盤後選股，
    隔一個交易日以開盤價進場，持有到下個月第一個交易日開盤換股。
  - 倖存者偏差：原版用「現在」的上市櫃代號清單；cm.tw_daily 含已下市櫃股票，每月只從當時有交易的股票挑選。
  - 不公平的比較基準：原版個股用還原股價(含股息)、大盤用加權指數(不含股息)；這裡改用 0050 的還原股價。
  - 流動性：沒有成交的日子 cm 仍有一筆(價格不變、成交量 0)，這種股票的波動看起來很低，
    原版會優先選到；這裡要求過去半年幾乎每天有成交、成交金額中位數至少 500 萬元。
策略(每月換股，本金 100 萬，每檔目標金額 = 換股前一天收盤總資產 ÷ 選到的檔數)：
  lv10   低波動 10 檔：過去 120 個交易日波動最小的 10 檔(原版 README 的說法)
  lv10p  低波動 10%：波動最小的 10%(原版程式實際的作法，約一百多檔)
  ew     全部合格股票等權重(對照組：看低波動本身的效果，扣掉「等權重」的效果)
  b0050  0050 還原股價買進持有(股息再投入)
波動 = 過去 120 個交易日的 5 日報酬標準差(原版用 5 日報酬；cm 從 2016 年開始，回看期間從原版的 10 年改為半年)
進出場(和 events.py 同一套規則與成本)：換股日開盤先賣後買；整數股(無條件捨去)，含手續費、交易稅與一個升降單位的滑價。
  - 賣出：開盤跌停或沒有成交就賣不掉，延到下一個交易日開盤再賣(可能連續延後)；持有期間下市櫃，以最後收盤價轉為現金
  - 買進：開盤漲停或沒有成交就買不到，延後一天，隔天仍買不到就放棄(這個月少一檔，資金留在現金)
  - 續抱的股票調整到目標金額(多的賣掉、少的補買)；當天賣不掉或買不到就不調整

同一個資料集也產生事件型策略(events.py → margin.json、against.json…)，這裡最後會呼叫它。

只能在本機執行(GitHub Actions 連不到本機資料庫)：
  python pipeline/tw_strategy/update.py
  python pipeline/run_local.py    # 本機資料集一起更新 + 發佈到 data 分支 + 重新部署(Windows 排程呼叫這個)
資料庫連線見 common.pg_connect()。
"""
import sys
import warnings
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import events  # noqa: E402
from events import CAPITAL, EPS, FEE, TAX, fill  # noqa: E402

DATASET = 'tw_strategy'
LOOKBACK = 120          # 回看交易日數(約半年)
MIN_TRADED = 0.9        # 回看期間有成交的天數比例下限
MIN_VALUE = 5000        # 回看期間每日成交金額中位數下限(千元) = 500 萬元
TOP_N = 10
TOP_PCT = 0.1
BENCH = '0050'
KEYS = ['lv10', 'lv10p', 'ew']


def simulate(W, sig, select, i0):
    """每月換股的逐日資金模擬：回傳 {key: (淨值, 每日持有檔數, 每月換手率(買賣合計), 每筆交易[(代號位置, 進場日, 出場日, 報酬)])}"""
    O, CF = W['o'].to_numpy(), W['c'].ffill().to_numpy()
    RO = W['open'].to_numpy()
    LU, LD = events.limits(W)
    TR, LAST = events.traded(W), events.last_day(W)
    nd, ns = CF.shape
    reb = {s + 1: s for s in sig if s + 1 < nd}                  # 換股日(進場日) → 選股日
    ok = lambda t, j: TR[t, j] and np.isfinite(RO[t, j])  # noqa: E731
    out = {}
    for key in KEYS:
        cash, units = float(CAPITAL), np.zeros(ns)               # units：還原股價計的單位數，市值 = units × 還原收盤價
        span = {}                                                # 持有中的一筆：j → [進場日, 投入金額, 收回金額]
        trades, turn, sells, buys = [], {}, set(), {}
        nav, npos = np.ones(nd), np.zeros(nd, int)

        def trade(j, t, sh, buy):                                # 以 t 開盤成交 sh 股(含滑價、手續費、交易稅)；回傳成交金額
            nonlocal cash
            raw = RO[t, j]
            amt = sh * fill(raw, buy, LU[t, j], LD[t, j])
            u = sh * raw / O[t, j]
            if buy:
                cash -= amt * (1 + FEE)
                units[j] += u
                span.setdefault(j, [t, 0.0, 0.0])[1] += amt * (1 + FEE)
            else:
                cash += amt * (1 - FEE - TAX)
                units[j] = max(0.0, units[j] - u)
                span[j][2] += amt * (1 - FEE - TAX)
            return amt

        def close_span(j, t):
            e, cost, got = span.pop(j)
            trades.append((j, e, t, got / cost - 1))

        for t in range(i0 + 1, nd):
            traded_amt = 0.0
            for j in np.where((units > 0) & (LAST < t))[0]:      # 下市櫃：以最後收盤價轉為現金
                span[j][2] += units[j] * CF[LAST[j], j]
                cash += units[j] * CF[LAST[j], j]
                units[j] = 0
                close_span(j, LAST[j])
                sells.discard(j)
            eq = cash + float(np.nansum(units * CF[t - 1]))
            if t in reb:
                picks = set(select(reb[t])[key].tolist())
                per = eq / len(picks)
                sells = {j for j in np.where(units > 0)[0] if j not in picks}
                buys = {}
                for j in sorted(picks):
                    if units[j] <= 0:
                        buys[j] = [0, per]
                    elif ok(t, j):                               # 續抱：調整到目標金額，賣不掉或買不到就不調整
                        diff = per - units[j] * O[t, j]          # 以開盤價計的差額
                        sh = np.floor(abs(diff) / RO[t, j])
                        if sh >= 1 and diff < 0 and RO[t, j] > LD[t, j] + EPS:
                            traded_amt += trade(j, t, sh, False)
                        elif sh >= 1 and diff > 0 and RO[t, j] < LU[t, j] - EPS:
                            buys[j] = [1, diff]                  # 補買只試當天
            for j in sorted(sells):                              # 先賣：開盤跌停或沒有成交就延到下一個交易日
                if ok(t, j) and RO[t, j] > LD[t, j] + EPS:
                    traded_amt += trade(j, t, units[j] * O[t, j] / RO[t, j], False)
                    units[j] = 0
                    close_span(j, t)
                    sells.discard(j)
            for j in sorted(buys):                               # 再買：開盤漲停或沒有成交延後一天，隔天仍買不到就放棄
                tries, amt = buys[j]
                if ok(t, j) and RO[t, j] < LU[t, j] - EPS:
                    px = fill(RO[t, j], True, LU[t, j], LD[t, j])
                    sh = np.floor(min(amt, cash) / (px * (1 + FEE)))
                    if sh >= 1:
                        traded_amt += trade(j, t, sh, True)
                    del buys[j]
                elif tries >= 1:
                    del buys[j]
                else:
                    buys[j][0] += 1
            if traded_amt:
                m = W['c'].index[t].strftime('%Y-%m')
                turn[m] = turn.get(m, 0) + traded_amt / eq
            nav[t] = (cash + float(np.nansum(units * CF[t]))) / CAPITAL
            npos[t] = int((units > 0).sum())
        for j in list(span):                                     # 持有中：以最新收盤價計
            e, cost, got = span.pop(j)
            trades.append((j, e, None, (got + units[j] * CF[-1, j]) / cost - 1))
        out[key] = (nav, npos, turn, trades)
    return out


def main(dry=False):
    W, names = events.load()
    C = W['c']
    dates = C.index
    print(f'cm.tw_daily：{dates[0].date()} ~ {dates[-1].date()}，{C.shape[1]} 檔')
    cf = C.ffill().to_numpy()
    tr = events.traded(W) & np.isfinite(C.to_numpy())
    val = W['val'].fillna(0).to_numpy()
    bench = list(C.columns).index(BENCH)

    # 每月最後一個交易日 = 選股日；隔一個交易日開盤進場
    month = dates.to_period('M')
    sig = [i for i in range(len(dates)) if i + 1 < len(dates) and month[i + 1] != month[i] and i + 1 >= LOOKBACK]

    def select(i):
        w = slice(i - LOOKBACK + 1, i + 1)
        ok = tr[i] & (tr[w].mean(axis=0) >= MIN_TRADED) & (np.median(val[w], axis=0) >= MIN_VALUE)
        ok[bench] = False
        p = cf[w]
        with np.errstate(invalid='ignore', divide='ignore'):
            r5 = p[5:] / p[:-5] - 1
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)   # 還沒上市或已下市的股票整欄都是缺值
            vol = np.nanstd(r5, axis=0, ddof=1)
        idx = np.where(ok & np.isfinite(vol))[0]
        idx = idx[np.argsort(vol[idx], kind='stable')]
        k = max(TOP_N, round(len(idx) * TOP_PCT))
        return {'lv10': idx[:TOP_N], 'lv10p': idx[:k], 'ew': idx}, vol

    i0 = sig[0]
    sim = simulate(W, sig, lambda i: select(i)[0], i0)
    stocks = list(C.columns)
    fmt = lambda t: dates[t].strftime('%Y-%m-%d')  # noqa: E731
    months = [{'m': str(month[s + 1]), 'start': fmt(s + 1), 'n': int(len(select(s)[0]['ew'])),
               'turn': {k: round(sim[k][2].get(str(month[s + 1]), 0), 4) for k in KEYS}} for s in sig if s + 1 < len(dates)]

    def tstat(T):
        """已出場的交易：筆數、勝率、平均與中位數報酬(扣成本)、平均持有天數(交易日)"""
        T = [t for t in T if t[2] is not None]
        r = np.array([t[3] for t in T])
        return {'n': len(T), 'win': round(float((r > 0).mean()), 4), 'mean': round(float(r.mean()), 5),
                'median': round(float(np.median(r)), 5), 'days': round(float(np.mean([t[2] - t[1] for t in T])), 2)}

    # 最新一次選股(最後一個月底；資料若剛好到月底，這就是下個月要進場的持股)
    last = sig[-1]
    picks, vol = select(last)
    ann = np.sqrt(252 / 5)
    w = slice(last - LOOKBACK + 1, last + 1)
    med = np.median(val[w], axis=0)

    def pick_rows(idx):
        return [[stocks[i], *(names.get(stocks[i], ('', ''))), round(float(vol[i] * ann), 4), round(float(med[i] / 1e5), 2)]
                for i in idx]

    out = {
        'asof': fmt(len(dates) - 1),
        'd': [x.strftime('%Y-%m-%d') for x in dates[i0:]],
        'nav': {**{k: [round(float(x), 6) for x in sim[k][0][i0:]] for k in KEYS},
                'b0050': [round(float(x), 6) for x in events.bench_nav(W, i0)]},
        'npos': {k: sim[k][1][i0:].tolist() for k in KEYS},
        'tstat': {k: tstat(sim[k][3]) for k in KEYS},
        'm': months,
        'picks': {'signal': fmt(last), 'entered': last + 1 < len(dates), 'n': int(len(picks['ew'])),
                  'lv10': pick_rows(picks['lv10']), 'lv10p': pick_rows(picks['lv10p'])},
        'params': {'lookback': LOOKBACK, 'min_traded': MIN_TRADED, 'min_value': MIN_VALUE, 'top_n': TOP_N, 'top_pct': TOP_PCT,
                   'capital': CAPITAL, 'fee': FEE, 'tax': TAX},
    }
    for k in [*KEYS, 'b0050']:
        v = out['nav'][k]
        yrs = (len(v) - 1) / 252
        print(f"{k:6s} 資產 {v[-1]:.2f} 倍，年化 {v[-1] ** (1 / yrs) - 1:+.2%}" + (f"，{out['tstat'][k]}" if k in KEYS else ''))
    print(f"{len(months)} 個月，最新選股 {out['picks']['signal']}，合格 {out['picks']['n']} 檔")
    if dry:
        return out
    write_json(dataset_dir(DATASET) / 'backtest.json', out)
    write_meta(DATASET, 'PostgreSQL', '',
               '週一~五 23:45、週二~六 12:15(本機排程)', asof=out['asof'])
    events.main(data=(W, names))   # dataset_dir 會清空資料夾，所以在 backtest.json 之後才寫各事件型策略的 JSON


if __name__ == '__main__':
    main()
