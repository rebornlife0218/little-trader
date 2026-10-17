"""
資料集 disposition：台股處置股(上市 + 上櫃)與處置前後的股價表現

處置公告：臺灣證券交易所「處置有價證券」(上市)、櫃買中心「上櫃處置有價證券」
股價：本機 PostgreSQL 的 cm.tw_daily(CMoney 日資料；開收用原始價格判斷 K 棒，報酬用還原股價)
大盤：加權指數用 data 分支已發佈的 indices/TAIEX.json(證交所)，櫃買指數用櫃買中心資料
資料庫在本機，GitHub Actions 連不到，只在本機執行：python pipeline/run_local.py(Windows 排程呼叫)
新制：2026-08-10 起處置期間由 10 個營業日縮短為 5 個營業日(當沖過熱 12 → 7)，撮合改為約每 2 分鐘一次。

每個處置事件記錄：
  rule  new(2026-08-10 以後開始，網頁只統計這些)、old(新制前就結束)、mix(跨越新制實施日，依過渡規定縮短)
  d1    處置第一天的開盤、收盤與前一日收盤(判斷黑 K / 紅 K)
  pre5  處置前 5 個交易日的報酬(被處置前的漲幅)
  ret   處置期間報酬：處置前一日收盤 → 處置最後一天收盤
  post5 出關後 5 個交易日的報酬
  mkt   同期間大盤(上市用加權指數、上櫃用櫃買指數)的報酬
"""
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import REPO, dataset_dir, pg_connect, write_json, write_meta  # noqa: E402

NAME = 'disposition'
START = date(2026, 7, 1)            # 新制(2026-08-10)前一個多月起，涵蓋跨越實施日的處置
NEW_RULE = '2026-08-10'
HEADERS = {'User-Agent': 'Mozilla/5.0 (little-trader data bot)'}
TWSE_API = 'https://www.twse.com.tw/rwd/zh/announcement/punish'
TPEX_API = 'https://www.tpex.org.tw/www/zh-tw/bulletin/disposal'
OTC_API = 'https://www.tpex.org.tw/www/zh-tw/indexInfo/inx'   # 櫃買指數(月查詢)
TAIEX_URL = f'https://raw.githubusercontent.com/{REPO}/data/indices/TAIEX.json'


def roc(s):
    """民國日期 115/08/10 → 2026-08-10"""
    y, m, d = (int(x) for x in s.strip().split('/'))
    return f'{y + 1911}-{m:02d}-{d:02d}'


def get_json(url, params):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            print(f'{url} 下載失敗({i + 1}/3)：{e!r}', file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError(f'無法下載 {url}')


def parse_rows(rows, market, idx):
    """idx：(公布日期, 代號, 名稱, 起訖, 措施, 原因) 在該表的欄位位置"""
    out = []
    for r in rows:
        code = str(r[idx[1]]).strip()
        if not re.fullmatch(r'[1-9]\d{3}', code):      # 只看股票(排除權證、ETF、ETN)
            continue
        span = re.split(r'[~～]', str(r[idx[3]]))
        if len(span) != 2:
            continue
        out.append({'code': code, 'name': re.sub(r'\(.*$', '', str(r[idx[2]])).strip(), 'market': market,
                    'announced': roc(r[idx[0]]), 'start': roc(span[0]), 'end': roc(span[1]),
                    'kind': str(r[idx[4]]).strip(), 'reason': str(r[idx[5]]).strip()})
    return out


def fetch_events(today):
    events = []
    # 一次查一年，避免超過查詢範圍
    y = START.year
    while y <= today.year:
        a, b = date(y, 1, 1) if y > START.year else START, min(date(y, 12, 31), today)
        tw = get_json(TWSE_API, {'startDate': a.strftime('%Y%m%d'), 'endDate': b.strftime('%Y%m%d'), 'response': 'json'})
        # 欄位：編號, 公布日期, 證券代號, 證券名稱, 累計, 處置條件, 處置起迄時間, 處置措施, 處置內容, 備註
        events += parse_rows(tw.get('data') or [], 'TWSE', (1, 2, 3, 6, 7, 5))
        time.sleep(3)
        tp = get_json(TPEX_API, {'startDate': a.strftime('%Y/%m/%d'), 'endDate': b.strftime('%Y/%m/%d'), 'response': 'json'})
        # 欄位：編號, 公布日期, 證券代號, 證券名稱, 累計, 處置起訖時間, 處置原因, 處置措施, ...
        rows = tp['tables'][0]['data'] if tp.get('tables') else []
        events += parse_rows(rows, 'TPEx', (1, 2, 3, 5, 7, 6))
        time.sleep(3)
        y += 1
    # 同一檔同一起日只留一筆
    uniq = {(e['code'], e['start']): e for e in events}
    return sorted(uniq.values(), key=lambda e: (e['start'], e['code']))


def fetch_otc(start, today):
    """櫃買指數每日收盤：{日期: 收盤}，一次查一個月"""
    out, y, m = {}, start.year, start.month
    while (y, m) <= (today.year, today.month):
        j = get_json(OTC_API, {'date': f'{y}/{m:02d}/01', 'response': 'json'})
        for r in (j.get('tables') or [{}])[0].get('data') or []:
            out[r[0].replace('/', '-')] = float(r[4].replace(',', ''))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        time.sleep(3)
    return pd.Series(out, dtype=float).sort_index().rename(index=pd.Timestamp)


def fetch_taiex():
    """加權指數每日收盤(indices 資料集，證交所資料)"""
    j = get_json(TAIEX_URL, {})
    return pd.Series(j['c'], index=pd.to_datetime(j['d']), dtype=float)


def load_prices(codes, start):
    """cm.tw_daily 的開盤、收盤(原始價格)與還原收盤價，各為 日期 × 代號"""
    with pg_connect() as conn:
        rows = conn.execute('SELECT "日期", "股票代號", "開盤價", "收盤價", "還原收盤價" FROM cm.tw_daily '
                            'WHERE "股票代號" = ANY(%s) AND "日期" >= %s AND "收盤價" IS NOT NULL',
                            (codes, start)).fetchall()
        last = conn.execute('SELECT max("日期") FROM cm.tw_daily').fetchone()[0]
    df = pd.DataFrame(rows, columns=['d', 's', 'o', 'c', 'a'])
    df['d'] = pd.to_datetime(df['d'])
    piv = {k: df.pivot(index='d', columns='s', values=k).sort_index() for k in ('o', 'c', 'a')}
    return piv['o'], piv['c'], piv['a'], pd.Timestamp(last)


def main():
    today = date.today()
    events = fetch_events(today)
    print(f'處置事件 {len(events)} 筆(上市 {sum(e["market"] == "TWSE" for e in events)}、上櫃 {sum(e["market"] == "TPEx" for e in events)})')
    first = pd.Timestamp(min(e['start'] for e in events)) - pd.Timedelta(days=20)
    O, C, A, last_day = load_prices(sorted({e['code'] for e in events}), first.date())
    A = A.copy()
    A['^TWII'] = fetch_taiex().reindex(A.index)
    A['^TWOII'] = fetch_otc(first.date(), today).reindex(A.index)
    print(f'股價(cm.tw_daily)到 {last_day.date()}')

    def ret(s, a, b):
        return None if a is None or b is None or pd.isna(s.get(a)) or pd.isna(s.get(b)) else round(float(s[b] / s[a] - 1), 5)

    out = []
    for e in events:
        s = e['code']
        if s not in C.columns:
            continue
        days = A[s].dropna().index
        st, en = pd.Timestamp(e['start']), pd.Timestamp(e['end'])
        inside = days[(days >= st) & (days <= en)]
        if not len(inside):
            continue                                        # 尚未開始或沒有股價
        d1, last = inside[0], inside[-1]
        before = days[days < d1]
        after = days[days > en]
        prev = before[-1] if len(before) else None
        done = en <= days[-1]
        mk = '^TWII' if e['market'] == 'TWSE' else '^TWOII'
        mdays = A[mk].dropna().index
        rule = 'new' if e['start'] >= NEW_RULE else 'old' if e['end'] < NEW_RULE else 'mix'
        out.append({**e, 'rule': rule, 'ndays': len(inside), 'done': bool(done),
                    'd1': {'date': d1.strftime('%Y-%m-%d'), 'o': round(float(O[s][d1]), 2), 'c': round(float(C[s][d1]), 2),
                           'prev': round(float(C[s][prev]), 2) if prev is not None else None},
                    'pre5': ret(A[s], before[-6] if len(before) >= 6 else None, prev),
                    'ret': ret(A[s], prev, last),
                    'post5': ret(A[s], last, after[4]) if len(after) >= 5 else None,
                    'mkt': ret(A[mk], mdays[mdays < d1][-1] if (mdays < d1).any() else None,
                               mdays[mdays <= last][-1] if (mdays <= last).any() else None)})
    d = dataset_dir(NAME)
    write_json(d / 'events.json', {'asof': last_day.strftime('%Y-%m-%d'), 'new_rule': NEW_RULE, 'events': out})
    write_meta(NAME, '臺灣證券交易所、櫃買中心 處置有價證券公告；股價 PostgreSQL', 'https://www.twse.com.tw/zh/announcement/punish.html',
               '週一~五 23:45、週二~六 12:15(本機排程)', files=['events.json'], events=len(out))
    print(f'完成：{len(out)} 筆有股價的處置事件，新制 {sum(x["rule"] == "new" for x in out)} 筆')


if __name__ == '__main__':
    main()
