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
另外成一個資料集(不放 tw_research)：tw_research 由排程每天發佈整個資料夾，放在裡面會被覆蓋。
研究資料夾預設為 ~/Desktop/ETF_PANEL/CLAUDE/其他策略/大跌反彈訊號/抄底選股，可用環境變數 DIP_DIR 指定。
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

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


def main():
    out = dataset_dir(NAME)
    B = dip()
    write_json(out / 'dip.json', B)
    write_meta(NAME, '台股日資料與月營收(本機計算)', '', '不定期(研究更新時手動執行)', asof=B['asof'])
    T = B['strats'][0]
    print(f"dip：{len(B['signals'])} 次訊號，{T['name']} {T['ts']['n']} 筆，即將進場 {len(T['upcoming'])} 檔，資料到 {B['asof']}")


if __name__ == '__main__':
    main()
