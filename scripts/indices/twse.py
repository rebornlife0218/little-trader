"""
台灣加權指數(TAIEX)：開高低收與成交量全部改用臺灣證券交易所資料(Yahoo 的 ^TWII 成交量不正確)。
  - 開高低收：發行量加權股價指數歷史資料 MI_5MINS_HIST(證交所只提供 1999-01-05 起)
  - 成交量：每月市場成交資訊 FMTQIK 的「成交金額(元)」(台股習慣以成交值看大盤量)

證交所一次只能查一個月，且頻繁查詢會被暫時封鎖，因此：
  - 已發佈到 data 分支的 TAIEX.json 就是快取；
  - 下次更新先讀回舊檔(本機 data/ 或 data 分支)，只補缺少的月份與最近 2 個月。
"""
import json
import os
import sys
import time
from datetime import date

import requests

CACHE_FILE = 'TAIEX.json'  # 發佈出去的台灣加權資料本身就是快取
FIRST_DAY = '1999-01-05'  # MI_5MINS_HIST 最早的資料日
OHLC_API = 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST'
AMOUNT_API = 'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK'
HEADERS = {'User-Agent': 'Mozilla/5.0 (little-trader data bot)'}
SLEEP = 3  # 證交所建議每 5 秒不超過 3 次查詢


def _months(today):
    y, m = int(FIRST_DAY[:4]), int(FIRST_DAY[5:7])
    while (y, m) <= (today.year, today.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _load_cache(local_dir):
    """先找本機 data/indices/，再找 data 分支(GitHub Actions 每次都是全新環境)。"""
    p = local_dir / CACHE_FILE
    if p.exists():
        return json.loads(p.read_text(encoding='utf-8'))
    repo = os.environ.get('GITHUB_REPOSITORY', 'rebornlife0218/little-trader')
    url = f'https://raw.githubusercontent.com/{repo}/data/indices/{CACHE_FILE}'
    try:
        r = requests.get(url, timeout=30)
        if r.ok:
            return r.json()
    except Exception as e:  # noqa: BLE001
        print(f'讀取 data 分支的台灣加權快取失敗：{e!r}', file=sys.stderr)
    return {'d': [], 'o': [], 'h': [], 'l': [], 'c': [], 'v': []}


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


def load_taiex(local_dir, today=None):
    """回傳 {日期: (開, 高, 低, 收, 成交金額)}；下載失敗時保留已快取的部分，不中止整個更新。"""
    today = today or date.today()
    cache = _load_cache(local_dir)
    rows = {d: (o, h, l, c, v) for d, o, h, l, c, v in
            zip(cache['d'], cache['o'], cache['h'], cache['l'], cache['c'], cache['v'])}
    have = {d[:7] for d in rows}
    months = list(_months(today))
    recent = set(months[-2:])
    todo = [(y, m) for y, m in months if f'{y}-{m:02d}' not in have or (y, m) in recent]
    print(f'證交所台灣加權：快取 {len(rows)} 日，需下載 {len(todo)} 個月', flush=True)
    for i, (y, m) in enumerate(todo):
        try:
            ohlc = _get(OHLC_API, y, m)
            time.sleep(SLEEP)
            amount = _get(AMOUNT_API, y, m)  # 欄位：成交股數, 成交金額, 成交筆數, 指數, 漲跌點數
        except RuntimeError as e:
            print(f'{e}，其餘月份下次再補', file=sys.stderr)
            break
        for d, (o, h, l, c) in ohlc.items():
            if min(o, h, l, c) > 0:
                rows[d] = (o, h, l, c, int(amount[d][1]) if d in amount else 0)
        if (i + 1) % 24 == 0:
            print(f'  已下載到 {y}-{m:02d}', flush=True)
        if i < len(todo) - 1:
            time.sleep(SLEEP)
    return rows

