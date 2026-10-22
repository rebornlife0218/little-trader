"""
資料集 etf_research：ETF大禮包「ETF研究」裡需要資料檔的研究 → web/data/etf_research/

研究：
  etf_follow  A 系列 ETF 跟單：主動式 ETF 每天公布持股，經理人加碼、調整、新納入之後跟著買，有沒有超額報酬

研究本身在本機的研究資料夾計算(CM 的 ETF 持股明細、ETF 折溢價表與台股日資料；進出場、成本與資金模擬共用 tw_strategy/events.py)，
這裡只把研究輸出的結果(淨值、交易統計、報告用的統計表)與報告 Markdown 轉成網頁用的 JSON；不發佈 csv、png 與原始股價。
報告裡的圖片 ![說明](xxx.png) 由網頁依 JSON 重畫。研究結果不每日更新，研究改版後手動執行：
  python pipeline/run_local.py etf_research        (轉檔、發佈到 data 分支並重新部署)
研究資料夾預設為 ~/Desktop/ETF_PANEL/CLAUDE/A系列ETF跟單，可用環境變數 ETF_FOLLOW_DIR 指定。
"""
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

NAME = 'etf_research'
SRC = Path(os.environ.get('ETF_FOLLOW_DIR', Path.home() / 'Desktop' / 'ETF_PANEL' / 'CLAUDE' / 'A系列ETF跟單'))


def rnd(v, nd=5):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), nd)


def rows(df, cols):
    """DataFrame → [{欄位: 值}]，數字取 5 位小數，缺值為 null"""
    out = []
    for r in df[list(cols)].itertuples(index=False):
        out.append({k: (rnd(v) if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool) else v)
                    for k, v in zip(cols.values(), r)})
    return out


def csv(name):
    return pd.read_csv(SRC / 'output' / name, encoding='utf-8-sig', dtype={'ETF': str})


def report():
    """研究資料夾的 報告.md → 網頁版：去掉標題(網頁顯示)、圖片改成檔名(網頁依 JSON 畫圖)、拿掉程式與輸出檔的說明"""
    s = (SRC / '報告.md').read_text(encoding='utf-8')
    s = re.sub(r'^# .*\n+', '', s, count=1)
    s = s.replace('](output/', '](')
    s = re.sub(r'^\| 程式 \|.*\n', '', s, flags=re.M)
    s = re.sub(r'結果在 output/[^。]*。', '', s)
    s = re.sub(r'^各檔所有持有期.*\n\n?', '', s, flags=re.M)
    left = re.findall(r'[\w./-]+\.(?:py|csv|parquet)', s)
    if left:
        raise SystemExit(f'報告還有本機檔案名稱：{left}')
    return s


def follow():
    nav = pd.read_csv(SRC / 'output' / 'daily_nav.csv', index_col=0, parse_dates=True, encoding='utf-8-sig')
    detail = json.loads((SRC / 'output' / 'strategy_detail.json').read_text(encoding='utf-8'))
    d = nav.index
    b50 = [c for c in nav.columns if c.startswith('0050｜')]
    first = min(b50, key=lambda c: nav[c].first_valid_index())
    i00 = d.get_loc(nav[first].first_valid_index())
    d = d[i00:]
    b = nav[first].iloc[i00:]
    strats, b0050s = [], {}
    for k, v in detail.items():
        mode, group, hold = k.split('｜')
        s = nav[k].dropna()
        i0 = d.get_loc(s.index[0])
        bk = f'{mode}｜{group}'                                     # 同一組訊號的 0050(同一個期初：期初現金，隔天開盤買進)
        if bk not in b0050s:
            bb = nav[f'0050｜{bk}'].dropna()
            b0050s[bk] = [rnd(x) for x in bb / bb.iloc[0]]
        strats.append({'key': k, 'mode': mode, 'group': group, 'hold': hold, 'i0': int(i0), 'nav': [rnd(x) for x in s / s.iloc[0]],
                       'ts': {a: rnd(x) for a, x in v['ts'].items()}, 'npos': [int(x) for x in v['npos']]})
    by = csv('by_etf_mode.csv')
    cons = csv('consensus.csv')
    summ = json.loads((SRC / 'output' / 'summary.json').read_text(encoding='utf-8'))
    return {
        'asof': str(d[-1].date()), 'd': [str(x.date()) for x in d], 'b0050': [rnd(x) for x in b / b.iloc[0]],
        'strats': strats, 'b0050s': b0050s,   # b0050s：每組訊號(模式｜範圍)自己的 0050，期初和該組策略相同
        'etfs': [{'code': e, 'name': n, 'from': summ['持股期間'][e][0]} for e, n in summ['ETF'].items()],
        'holding': rows(by[by['ETF'] == '全部'], {'模式': 'mode', '持有': 'hold', '超額筆數': 'n', '超額平均': 'mean', '超額t': 't', '超額勝率': 'win'}),
        'by_etf': rows(by[by['ETF'] != '全部'], {'ETF': 'etf', '模式': 'mode', '持有': 'hold', '超額筆數': 'n', '超額平均': 'mean', '超額t': 't', '超額勝率': 'win'}),
        'consensus': rows(cons, {'分組': 'by', '模式': 'mode', '家數': 'k', '持有': 'hold', '超額筆數': 'n', '超額平均': 'mean', '超額t': 't', '超額勝率': 'win'}),
        'entry': rows(csv('extra_entry_delay.csv'), {'組別': 'group', '進場': 'entry', '跟單平均': 'mean', '跟單t': 't', '已減碼不進場': 'skip',
                                                     '20日平均': 'mean20', '20日t': 't20'}),
        'flow': rows(csv('extra_flow.csv'), {'分組依據': 'by', '模式': 'mode', '分組': 'bin', '跟單筆數': 'n', '跟單平均': 'mean', '跟單t': 't',
                                             '20日平均': 'mean20', '20日t': 't20'}),
        'ex81': rows(csv('extra_ex_00981A.csv'), {'範圍': 'scope', '模式': 'mode', '家數': 'k', '跟單平均': 'mean', '跟單t': 't', '20日平均': 'mean20', '20日t': 't20'}),
        'cexit': rows(csv('extra_consensus_exit.csv'), {'模式': 'mode', '家數': 'k', '出場規則': 'rule', '平均': 'mean', 't': 't'}),
        'report': report(),
    }


def main():
    out = dataset_dir(NAME)
    B = follow()
    write_json(out / 'etf_follow.json', B)
    write_meta(NAME, 'CM ETF持股明細、ETF折溢價、台股日資料(本機計算)', '', '不定期(研究更新時手動執行)', asof=B['asof'])
    print(f"etf_follow：{len(B['strats'])} 個策略、{len(B['d'])} 個交易日(至 {B['asof']})")


if __name__ == '__main__':
    main()
