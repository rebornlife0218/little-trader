"""
資料集 tw_dip：台股其他研究「大跌後抄底選股」 → web/data/tw_dip/dip.json

延續大盤漲跌分析的「大跌反彈和融資的關係」：融資大減訊號出現時，依「20 日乖離(跌幅)」、「近 3 個月營收年增率平均」、「投信持股比率」、
「5 個交易日前的融資使用率」四個因子的百分位平均排名，買進最前面 10% 的股票，持有 60(或 20)個交易日。
研究本身在本機的研究資料夾計算(個股資料、十分位分組、資金回測)；資金回測(研究資料夾的 程式/回測.py)的出場、成本與資金分配
用 pipeline/tw_strategy/events.py 的 simulate(規則同 CLAUDE.md：本金 100 萬、複利、1 ÷ 平均一天持有檔數的上限)，和 0050 買進持有比較；
進場是使用者指定的例外：隔天開盤一律當作買得到(開盤漲停也買)，只有隔天開盤跌停不買。
這裡只把研究輸出(output/回測.json 與十分位的 csv)轉成網頁用的 JSON，不發佈 csv、png 與原始股價。
報告 reports/dip.md 是研究資料夾 README 的網頁版(圖片路徑改成 dip/檔名.png，由網頁依 JSON 重畫，tw-research.js 的 dip)，
內文數字都是手寫的，研究數字改變時要同步更新。
研究結果不每日更新，研究改版或出現新的融資大減訊號時，先在研究資料夾重跑，再手動執行：
  python pipeline/run_local.py tw_dip        (轉檔、發佈到 data 分支並重新部署)
近期明細的報酬每天更新(live)：本機排程執行 update.py live(run_local.py 的 tw_dip:live)，讀 data 分支上最新的 dip.json，
從本機 PostgreSQL 的 cm.tw_daily 取最新一次訊號選出的股票與持有中交易的股價，算進場、出場與持有中的報酬，寫進各版本的 live；
研究的淨值、交易統計不動(到研究的 asof 為止)。live 的規則同研究的單筆交易：訊號隔天開盤買(開盤跌停或沒有成交不買)，
第 h 個交易日(進場日算第 1 日)收盤賣，收盤跌停或沒有成交延到下一個交易日收盤；手續費、交易稅、滑價同 tw_strategy/events.py，
持有中的報酬以最新收盤價扣賣出成本計；不含資金回測的加減碼(研究的交易明細含加減碼，所以和 live 的報酬可能略有不同)。
另外成一個資料集(不放 tw_research)：tw_research 由排程每天發佈整個資料夾，放在裡面會被覆蓋。
研究資料夾預設為 ~/Desktop/ETF_PANEL/CLAUDE/其他策略/大跌反彈訊號/抄底選股，可用環境變數 DIP_DIR 指定。
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import REPO, dataset_dir, load_published, write_json, write_meta  # noqa: E402

NAME = 'tw_dip'
SRC = Path(os.environ.get('DIP_DIR', Path.home() / 'Desktop' / 'ETF_PANEL' / 'CLAUDE' / '其他策略' / '大跌反彈訊號' / '抄底選股'))
NAMES = ['跌幅', '基本面', '投信', '融資', '跌幅＋基本面', '跌幅＋投信', '三者', '跌幅＋基本面＋投信＋融資']
H = [5, 20, 60, 120]


def rnd(v, nd=5):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def read(name, idx=None):
    return pd.read_csv(SRC / f'{name}.csv', index_col=idx, encoding='utf-8-sig')


def per_signal(B, T):
    """每次大跌：[訊號日, 實際買進檔數, 勝率, 每筆平均, 最好, 最差, 0050(同樣進出場、扣成本、含股息)]"""
    t = pd.DataFrame(T['trades'], columns=['s', 'n', 'sig', 'in', 'out', 'rank', 'r', 'why', 'k', 'score'])
    rows = []
    for sig, g in t.groupby('sig'):
        r = g['r'].dropna()
        rows.append([sig, len(r), rnd((r > 0).mean()), rnd(r.mean()), rnd(r.max()), rnd(r.min()), B['bench'][sig][str(T['h'])]])
    return rows


def dip():
    B = json.loads((SRC / 'output' / '回測.json').read_text(encoding='utf-8'))
    for s in B['strats']:
        s['sig'] = per_signal(B, s)
        # 網頁的交易明細：[代號, 名稱, 訊號日, 進場日, 出場日, 報酬, 出場原因]
        s['trades'] = [[r[0], r[1], r[2], r[3], r[4], r[6], r[7]] for r in s['trades'] if r[6] is not None]
        s['ts'] = {k: s['ts'][k] for k in ('n', 'win', 'mean', 'median', 'pos', 'days', 'heldPct', 'nocash', 'fail', 'delist')}
        del s['npos']
    dec = {h: read(f'十分位_{h}日', 0) for h in (20, 60)}
    sp = read('十分位_10減1')
    sp = sp[sp['事件組'] == '訊號'].set_index('條件')
    ctl = read('十分位_60日_只看指數跌深', 0)
    out = {k: B[k] for k in ('asof', 'd', 'b0050', 'signals', 'current', 'strats')}
    out['names'] = NAMES
    out['dec'] = {str(h): {n: [rnd(v) for v in dec[h][n]] for n in NAMES} for h in dec}             # 訊號後第 1～10 組的超額
    out['top'] = {str(h): [rnd(sp.at[n, f'{h}日第10組']) for n in NAMES] for h in H}               # 各條件第 10 組的超額
    out['ctl'] = {n: [rnd(v) for v in ctl[n]] for n in NAMES}                                        # 只看指數跌深 60 日
    out['report'] = (HERE / 'reports' / 'dip.md').read_text(encoding='utf-8').split('\n', 1)[1].lstrip()   # 第一行標題由網頁顯示
    return out


LIVE_SQL = '''SELECT "日期", "股票代號", "開盤價", "收盤價", "成交量", "還原開盤價", "還原收盤價" FROM cm.tw_daily
  WHERE "股票代號" = ANY(%s) AND "日期" >= %s ORDER BY "日期"'''


def live_prices(codes, start):
    """持有中與最新訊號股票的日資料：{欄位: 日期 × 代號}，欄位 open、close、vol(原始)與 o、c(還原)"""
    from common import pg_connect
    with pg_connect() as conn:
        rows = conn.execute(LIVE_SQL, (sorted(codes), start)).fetchall()
    df = pd.DataFrame(rows, columns=['d', 's', 'open', 'close', 'vol', 'o', 'c'])
    df['d'] = pd.to_datetime(df['d'])
    return {k: df.pivot(index='d', columns='s', values=k).astype(float).sort_index() for k in ('open', 'close', 'vol', 'o', 'c')}


def live_trade(P, s, e, h):
    """一筆交易從進場日 e(交易日的位置)開始：回傳 (進場日, 出場日, 報酬, 狀態)；
    狀態 wait = 還沒到進場日、fail = 進場日開盤跌停或沒有成交(不買)、hold = 持有中、sell = 下個交易日收盤要賣(到期或跌停延後中)、done = 已出場"""
    from tw_strategy.events import FEE, TAX, fill, tick
    D = P['c'].index
    if e >= len(D):
        return None, None, None, 'wait'
    RO, RC, V, O, C = (P[k][s].to_numpy() if s in P[k] else np.full(len(D), np.nan) for k in ('open', 'close', 'vol', 'o', 'c'))
    prev = pd.Series(RC).ffill().shift(1).to_numpy()

    def lim(t):     # 漲停價、跌停價(前一個交易日收盤 × 1.1 無條件捨去、× 0.9 無條件進位到升降單位)
        up, dn = prev[t] * 1.1, prev[t] * 0.9
        return np.floor(round(up / tick(up), 6)) * tick(up), np.ceil(round(dn / tick(dn), 6)) * tick(dn)

    lu, ld = lim(e)
    if not (V[e] > 0) or not np.isfinite(RO[e]) or RO[e] <= ld + 1e-9:
        return None, None, None, 'fail'
    cost = fill(RO[e], True, lu, ld) * O[e] / RO[e] * (1 + FEE)          # 還原價計的買進成本(含滑價、手續費)
    din = D[e].strftime('%Y-%m-%d')
    for t in range(e + h - 1, len(D)):                                   # 第 h 個交易日收盤賣，跌停或沒有成交就延後
        lu, ld = lim(t)
        if V[t] > 0 and np.isfinite(RC[t]) and RC[t] > ld + 1e-9:
            got = fill(RC[t], False, lu, ld) * C[t] / RC[t] * (1 - FEE - TAX)
            return din, D[t].strftime('%Y-%m-%d'), round(float(got / cost - 1), 5), 'done'
    t = int(np.flatnonzero(np.isfinite(RC))[-1])                         # 持有中：最新收盤價扣賣出成本
    lu, ld = lim(t)
    got = fill(RC[t], False, lu, ld) * C[t] / RC[t] * (1 - FEE - TAX)
    return din, None, round(float(got / cost - 1), 5), 'sell' if e + h - 1 <= len(D) else 'hold'


def live(B, prices=live_prices):
    """各版本的 live：[代號, 名稱, 訊號日, 進場日, 出場日, 報酬, 狀態]，包含最新一次訊號選出的股票(upcoming)與研究裡持有中的交易"""
    todo = {}
    for T in B['strats']:
        todo[T['key']] = [(u[0], u[1], u[2], None) for u in T['upcoming']] + [(r[0], r[1], r[2], r[3]) for r in T['trades'] if r[4] is None]
    items = [x for v in todo.values() for x in v]
    if not items:
        return None
    P = prices({x[0] for x in items}, min(x[2] for x in items))
    D = P['c'].index
    for T in B['strats']:
        rows = []
        for s, n, sig, din in todo[T['key']]:
            e = D.searchsorted(pd.Timestamp(din)) if din else D.searchsorted(pd.Timestamp(sig), side='right')
            rows.append([s, n, sig, *live_trade(P, s, e, T['h'])])
        T['live'] = rows
    return D[-1].strftime('%Y-%m-%d')


def main():
    if sys.argv[1:] == ['live']:
        # 每天：讀 data 分支上最新的 dip.json(研究由另一台電腦發佈，本機 web/data 可能是舊的)，只更新 live
        try:
            B = requests.get(f'https://raw.githubusercontent.com/{REPO}/data/{NAME}/dip.json', timeout=60).json()
        except Exception:  # noqa: BLE001
            B = load_published(NAME, 'dip.json')
        if not B:
            raise RuntimeError('讀不到 data 分支或本機的 tw_dip/dip.json')
        B['live_asof'] = live(B)
        out = dataset_dir(NAME)
        write_json(out / 'dip.json', B)
        write_meta(NAME, '台股日資料與月營收(本機計算)', '', '研究不定期更新，近期明細的報酬每天更新', asof=B['asof'], live_asof=B['live_asof'])
        T = B['strats'][0]
        st = pd.Series([r[6] for r in T.get('live', [])]).value_counts().to_dict()
        print(f"dip live：股價到 {B['live_asof']}，{T['name']} {st}")
        return
    B = dip()
    out = dataset_dir(NAME)
    write_json(out / 'dip.json', B)
    write_meta(NAME, '台股日資料與月營收(本機計算)', '', '不定期(研究更新時手動執行)', asof=B['asof'])
    T = B['strats'][0]
    print(f"dip：{len(B['signals'])} 次訊號，{T['name']} {T['ts']['n']} 筆，即將進場 {len(T['upcoming'])} 檔，資料到 {B['asof']}")


if __name__ == '__main__':
    main()
