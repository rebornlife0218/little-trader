"""
加權指數(股票查詢的 TSE)的大盤融資融券與三大法人：臺灣證券交易所每日統計 → 本機快取 ~/.cache/little-trader/twse_market.json
  MI_MARGN(信用交易統計)：融資金額今日餘額(仟元)、融資與融券今日餘額(交易單位 = 張)
  BFI82U(三大法人買賣金額統計表)：外資及陸資(不含外資自營商)、投信、自營商(自行買賣＋避險)的買賣差額(元)
快取：{日期: {mamt 融資金額(仟元), mlot 融資張數, slot 融券張數, f 外資, t 投信, p 自營商(元)}}；證交所當天沒有資料時存 {}。
每個交易日 2 次請求、間隔 3 秒(證交所有頻率限制)，只下載快取沒有的日子(最近 7 天沒有資料的會再試)。
sync.py 每次最多補 MAX_PER_RUN 天，避免排程卡住；第一次或快取不見時先手動回補(約 2,650 個交易日、4～5 小時)：
  python pipeline/price_query/twse_market.py        (補 2016 年起所有缺的交易日，交易日用 data 分支的 indices/TAIEX.json)
"""
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

START = '2016-01-01'          # 股票查詢頁最早可查 2016 年
CACHE = Path.home() / '.cache' / 'little-trader' / 'twse_market.json'
MARGN = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN'
BFI = 'https://www.twse.com.tw/rwd/zh/fund/BFI82U'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'}
PAUSE = 3.0
MAX_PER_RUN = 30
RETRY_DAYS = 7


def load():
    return json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}


def save(cache):
    """先併入檔案裡現有的(回補和每天的 sync.py 可能同時在跑)，再寫回"""
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    try:
        merged = {**load(), **{d: v for d, v in cache.items() if v}}
    except Exception:  # noqa: BLE001
        merged = {}
    for d, v in cache.items():
        merged.setdefault(d, v)
    cache.update(merged)
    tmp = CACHE.with_suffix(f'.{id(cache)}.tmp')
    tmp.write_text(json.dumps(dict(sorted(merged.items())), separators=(',', ':')), encoding='utf-8')
    tmp.replace(CACHE)


def num(s):
    return float(str(s).replace(',', ''))


def get(url, params):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            print(f'證交所下載失敗({i + 1}/3)：{url.rsplit("/", 1)[-1]} {params}：{e!r}', file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise RuntimeError(f'無法下載證交所資料：{url}')


def fetch_day(d):
    """d = 'YYYY-MM-DD' → 當天的大盤融資融券與三大法人(沒有資料的欄位就不放)"""
    ymd = d.replace('-', '')
    m = get(MARGN, {'date': ymd, 'selectType': 'MS', 'response': 'json'})
    time.sleep(PAUSE)
    b = get(BFI, {'type': 'day', 'dayDate': ymd, 'response': 'json'})
    time.sleep(PAUSE)
    out = {}
    if m.get('stat') == 'OK' and m.get('tables') and m['tables'][0].get('data'):
        rows = {r[0]: r for r in m['tables'][0]['data']}
        if '融資金額(仟元)' in rows:
            out['mamt'] = num(rows['融資金額(仟元)'][5])
        if '融資(交易單位)' in rows:
            out['mlot'] = num(rows['融資(交易單位)'][5])
        if '融券(交易單位)' in rows:
            out['slot'] = num(rows['融券(交易單位)'][5])
    if b.get('stat') == 'OK' and b.get('data'):
        rows = {r[0]: r for r in b['data']}
        f = [v for k, v in rows.items() if k.startswith('外資及陸資')]      # 2017 年底起另列外資自營商，不算在內
        if f:
            out['f'] = num(f[0][3])
        if '投信' in rows:
            out['t'] = num(rows['投信'][3])
        p = [v for k, v in rows.items() if k.startswith('自營商')]          # 自行買賣＋避險(早年只有一列「自營商」)
        if p:
            out['p'] = sum(num(v[3]) for v in p)
    return out


def update(days, limit=None):
    """補齊 days(交易日 'YYYY-MM-DD'，只取 START 之後)裡快取沒有的日子；limit = 這次最多補幾天。回傳快取"""
    cache = load()
    recent = (date.today() - timedelta(days=RETRY_DAYS)).isoformat()
    todo = [d for d in sorted(set(days)) if d >= START and (d not in cache or (not cache[d] and d >= recent))]
    if limit is not None and len(todo) > limit:
        print(f'大盤融資與法人：缺 {len(todo)} 天，這次先補最近的 {limit} 天(其餘請手動執行 twse_market.py 回補)', file=sys.stderr)
        todo = todo[len(todo) - limit:]
    for i, d in enumerate(todo, 1):
        cache[d] = fetch_day(d)
        if i % 20 == 0 or i == len(todo):
            save(cache)
            print(f'  大盤融資與法人：{i}/{len(todo)}，到 {d}', flush=True)
    return cache


def trading_days():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from common import REPO
    j = requests.get(f'https://raw.githubusercontent.com/{REPO}/data/indices/TAIEX.json', timeout=60).json()
    return [d for d in j['d'] if d >= START]


if __name__ == '__main__':
    days = trading_days()
    c = update(days)
    have = [d for d in days if c.get(d)]
    print(f'完成：{len(have)}/{len(days)} 個交易日有資料({have[0] if have else "—"} ~ {have[-1] if have else "—"})')
