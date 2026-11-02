"""
發行量加權股價報酬指數(含現金股利再投入，證交所 2003-01-02 起)，存成 TAIEX_TR.json {d, c}，給 ETF大禮包的長期回測使用。
台灣加權指數本身的開高低收量在 update.py，不在這裡。

證交所一次只能查一個月，且頻繁查詢會被暫時封鎖，因此：
  - 已發佈到 data 分支的 TAIEX_TR.json 就是快取；
  - 下次更新先讀回舊檔(本機 web/data/ 或 data 分支)，只補缺少的月份與最近 2 個月。
"""
import sys
import time
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import load_published  # noqa: E402

HEADERS = {'User-Agent': 'Mozilla/5.0 (little-trader data bot)'}
SLEEP = 3  # 證交所建議每 5 秒不超過 3 次查詢
TR_FILE = 'TAIEX_TR.json'
TR_FIRST = '2003-01'
TR_API = 'https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U'


def _get(api, y, m, retries=3):
    """查詢某月資料，回傳 {西元日期: 該列欄位}。"""
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(api, params={'date': f'{y}{m:02d}01', 'response': 'json'},
                             headers=HEADERS, timeout=30)
            j = r.json()
            if j.get('stat') == 'OK':
                out = {}
                for row in j.get('data', []):
                    ry, rm, rd = (int(x) for x in row[0].strip().split('/'))
                    out[f'{ry + 1911}-{rm:02d}-{rd:02d}'] = [float(x.replace(',', '')) for x in row[1:]]
                return out
            if '沒有符合' in str(j.get('stat')):
                return {}
            err = j.get('stat')
        except Exception as e:  # noqa: BLE001
            err = repr(e)
        print(f'  {y}-{m:02d} 第 {attempt} 次失敗：{err}', file=sys.stderr)
        time.sleep(SLEEP * 5 * attempt)
    raise RuntimeError(f'證交所 {y}-{m:02d} 資料下載失敗')


def load_taiex_tr(today=None):
    """發行量加權股價報酬指數：回傳 {日期: 收盤}；同樣以已發佈的 TAIEX_TR.json 為快取，只補缺少的月份與最近 2 個月。"""
    today = today or date.today()
    cache = load_published('indices', TR_FILE) or {'d': [], 'c': []}
    rows = dict(zip(cache['d'], cache['c']))
    have = {d[:7] for d in rows}
    y, m, months = int(TR_FIRST[:4]), int(TR_FIRST[5:]), []
    while (y, m) <= (today.year, today.month):
        months.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    recent = set(months[-2:])
    todo = [(y, m) for y, m in months if f'{y}-{m:02d}' not in have or (y, m) in recent]
    print(f'證交所報酬指數：快取 {len(rows)} 日，需下載 {len(todo)} 個月', flush=True)
    for i, (y, m) in enumerate(todo):
        try:
            got = _get(TR_API, y, m)
        except RuntimeError as e:
            print(f'{e}，其餘月份下次再補', file=sys.stderr)
            break
        rows.update({d: v[0] for d, v in got.items() if v[0] > 0})
        if i < len(todo) - 1:
            time.sleep(SLEEP)
    return rows
