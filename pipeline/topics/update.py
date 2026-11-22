"""
資料集 topics：其他 › 近期話題的研究報告 → web/data/topics/<話題>.json
  nsf10.json  國安基金第 10 次護盤買了什麼：八大行庫總公司每天的淨買金額(臺銀證券總公司／其他七家總公司)、
              事件期(決議後)累計淨買前 10 大，以及報告 reports/nsf10.md

研究在本機的研究資料夾計算(預設 ~/Desktop/ETF_PANEL/CLAUDE/其他策略/國安基金第10次護盤，環境變數 NSF10_DIR 可改)：
  程式/抓資料.py 在 CM 伺服器直接撈八大行庫的每週累計前 10 大、區間累計前 20 大、每日合計，程式/分析.py 輸出 每日淨買.csv、區間前20大.csv 等。
這裡只把研究輸出轉成網頁用的 JSON，不發佈 csv、png 與分點明細。
報告 reports/nsf10.md 是研究資料夾 README 的網頁版(圖片寫成 nsf10/檔名.png，由網頁依 JSON 重畫，other/topics.js)，
內文數字與表格都是手寫的，研究數字改變時要同步更新。
不是回測，沒有淨值。2026 年底前每天更新(run_local.py 的 topics:daily，DAILY_UNTIL 為止)：
  依序重跑研究資料夾的 程式/抓資料.py、程式/分析.py，再轉檔、發佈到 data 分支並重新部署；
  研究資料夾不在這台電腦時，run_local.py 直接略過(不發佈、不算失敗)。
  報告文字(reports/nsf10.md)是手寫的，每日更新只改圖表、決議後累計前 10 大與資料日期。
手動更新：python pipeline/run_local.py topics
研究資料夾不在(例如其他電腦)時，圖表資料沿用上一次發佈的 nsf10.json，報告文字仍用 repo 裡最新的 nsf10.md。
"""
import os
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import dataset_dir, load_published, write_json, write_meta  # noqa: E402

NAME = 'topics'
NSF10_DIR = Path(os.environ.get('NSF10_DIR', Path.home() / 'Desktop/ETF_PANEL/CLAUDE/其他策略/國安基金第10次護盤'))
SHOW = '20261102'          # 每日淨買的圖從這天開始畫
EV0 = '20261109'           # 決議後第一個交易日
DAILY_UNTIL = '2026-12-31'  # 每日更新到這天為止(run_local.py 也用同一個日期判斷要不要跑)


def report():
    """reports/nsf10.md 去掉第一行標題"""
    md = (HERE / 'reports' / 'nsf10.md').read_text(encoding='utf-8')
    return re.sub(r'^# .*\n+', '', md, count=1)


def nsf10():
    """國安基金第 10 次護盤：每日淨買與事件期前 10 大；研究資料夾不在時回傳 None"""
    if not (NSF10_DIR / '每日淨買.csv').exists():
        return None
    d = pd.read_csv(NSF10_DIR / '每日淨買.csv', dtype={'日期': str}).set_index('日期').sort_index()
    d = d[d.index >= SHOW]
    r = pd.read_csv(NSF10_DIR / '區間前20大.csv', dtype={'股票代號': str, '起': str, '迄': str})
    t = r[(r['期間'] == '事件期') & (r['分點'] == '八大行庫')].sort_values('名次').head(10)   # 圖只畫前 10 大
    ymd = lambda s: f'{s[:4]}-{s[4:6]}-{s[6:]}'  # noqa: E731
    r1 = lambda v: round(float(v), 1)  # noqa: E731
    return {
        'asof': ymd(d.index[-1]), 'ev0': ymd(EV0),
        'd': [ymd(s) for s in d.index],
        'tw': [r1(v) for v in d['臺銀證券總公司']],                         # 臺銀證券總公司每日淨買(億)
        'other': [r1(v) for v in d['其他七家總公司']],                      # 其他七家總公司(億)
        'top': {'from': ymd(t['起'].iloc[0]), 'to': ymd(t['迄'].iloc[0]),
                'name': [f'{c} {n}' for c, n in zip(t['股票代號'], t['股票名稱'])], 'v': [r1(v) for v in t['淨買億']]},
        'report': report(),
    }


def rerun_research():
    """每日更新：依序重跑研究資料夾的 程式/抓資料.py、程式/分析.py(在 CM 伺服器撈八大行庫分點、輸出 csv)"""
    for f in ('抓資料.py', '分析.py'):
        p = subprocess.run([sys.executable, str(NSF10_DIR / '程式' / f)], cwd=NSF10_DIR / '程式', capture_output=True, text=True,
                           encoding='utf-8', errors='replace', env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        if p.returncode:
            sys.exit(f'nsf10：{f} 失敗({p.returncode})：{(p.stdout + p.stderr)[-800:]}')
        print(f'nsf10：{f} 完成')


def main():
    daily = 'daily' in sys.argv[1:]
    if daily:
        rerun_research()
    prev = load_published(NAME, 'nsf10.json')          # 先讀回上一次的檔(dataset_dir 會清空本機資料夾)
    out = dataset_dir(NAME)
    B = nsf10() or prev
    if not B:
        sys.exit('nsf10：找不到本機研究資料夾，也沒有上一次發佈的 nsf10.json')
    B['report'] = report()                              # 沿用上一次的圖表資料時，報告文字仍用 repo 裡最新的 nsf10.md
    write_json(out / 'nsf10.json', B)
    write_meta(NAME, '八大行庫分點進出(本機研究資料夾)', '', f'每天(本機排程，到 {DAILY_UNTIL})', asof=B['asof'])
    print(f"nsf10：{len(B['d'])} 天，資料到 {B['asof']}")


if __name__ == '__main__':
    main()
