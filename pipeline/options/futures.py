"""
臺股期貨(TX，台指期)：由 options/update.py 一併更新，輸出 web/data/options/futures.json
  - 每日近月契約的開高低收、結算價，全部契約的成交量(一般＋盤後)與未平倉量
  - 三大法人(外資及陸資、投信、自營商)的臺股期貨多空未平倉淨額(口)
  - 最新交易日各月份契約(期限結構)
來源：臺灣期貨交易所「期貨每日交易行情下載」「三大法人-區分各期貨契約」(一次最多查一個月)

近月契約：到期日(第 3 個週三)在交易日之後、最早到期的月契約；到期當天改用下一個月份，
避免結算日的特殊價格造成連續走勢跳動。
"""
import io
import sys
import time
from datetime import date, timedelta

import pandas as pd
import requests

QUOTE_URL = 'https://www.taifex.com.tw/cht/3/dlFutDataDown'
INST_URL = 'https://www.taifex.com.tw/cht/3/futContractsDateDown'
HEADERS = {'User-Agent': 'Mozilla/5.0 (little-trader data bot)'}
KEYS = ['d', 'code', 'o', 'h', 'l', 'c', 's', 'vol', 'oi', 'fi', 'it', 'dl']
INST = {'外資及陸資': 'fi', '投信': 'it', '自營商': 'dl'}


def _post(url, form, retries=3):
    for i in range(retries):
        try:
            r = requests.post(url, data=form, headers=HEADERS, timeout=120)
            r.raise_for_status()
            text = r.content.decode('cp950', errors='replace')
            if '<html' in text[:500].lower():
                return pd.DataFrame()   # 查無資料(假日)時回傳 HTML 頁面
            df = pd.read_csv(io.StringIO(text), index_col=False, dtype=str)
            df.columns = [c.strip() for c in df.columns]
            return df.apply(lambda col: col.str.strip())
        except Exception as e:  # noqa: BLE001
            print(f'下載失敗({i + 1}/{retries})：{e!r}', file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError(f'無法下載 {url} {form}')


def _months(start, end):
    s = start
    while s <= end:
        e = min(end, (s.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1))
        yield s, e
        s = e + timedelta(days=1)


def _expiry(code):
    """月契約 202610 → 第 3 個週三。"""
    first = date(int(code[:4]), int(code[4:6]), 1)
    return first + timedelta(days=(2 - first.weekday()) % 7 + 14)


def download(start: date, end: date):
    quotes, inst = [], []
    for s, e in _months(start, end):
        fmt = lambda d: d.strftime('%Y/%m/%d')  # noqa: E731
        print(f'下載 TX {s} ~ {e}')
        quotes.append(_post(QUOTE_URL, {'down_type': '1', 'commodity_id': 'TX', 'commodity_id2': '',
                                        'queryStartDate': fmt(s), 'queryEndDate': fmt(e)}))
        time.sleep(3)
        # 三大法人：結束日是假日時期交所會回傳空白，往前一天再查(最多退 7 天)
        end = e
        while True:
            df = _post(INST_URL, {'queryStartDate': fmt(s), 'queryEndDate': fmt(end), 'commodityId': 'TXF'})
            time.sleep(3)
            if not df.empty or end <= s or (e - end).days >= 7:
                break
            end -= timedelta(days=1)
        inst.append(df)
    q = pd.concat([x for x in quotes if not x.empty], ignore_index=True) if any(not x.empty for x in quotes) else pd.DataFrame()
    i = pd.concat([x for x in inst if not x.empty], ignore_index=True) if any(not x.empty for x in inst) else pd.DataFrame()
    return q, i


def _num(s):
    return pd.to_numeric(s.replace('-', None), errors='coerce')


def summarize(q, inst):
    """回傳 {日期: 一日的資料列}，以及最新交易日的期限結構。"""
    if q.empty:
        return {}, None
    q = q[(q['契約'] == 'TX') & q['到期月份(週別)'].str.fullmatch(r'\d{6}')].copy()   # 排除價差委託
    q['date'] = pd.to_datetime(q['交易日期']).dt.date
    for col, src in [('o', '開盤價'), ('h', '最高價'), ('l', '最低價'), ('c', '收盤價'), ('s', '結算價'), ('chg', '漲跌價'), ('oi', '未沖銷契約數')]:
        q[col] = _num(q[src])
    q['vol'] = _num(q['成交量']).fillna(0).astype(int)
    net = {}
    if not inst.empty:
        inst = inst[inst['商品名稱'] == '臺股期貨']
        for _, r in inst.iterrows():
            key = INST.get(r['身份別'])
            if key:
                net.setdefault(pd.to_datetime(r['日期']).date(), {})[key] = int(float(r['多空未平倉口數淨額']))
    rows, curve = {}, None
    for d, g in q.groupby('date'):
        reg = g[g['交易時段'] == '一般']
        live = reg[reg['到期月份(週別)'].map(_expiry) > d].sort_values('到期月份(週別)')
        if live.empty:
            continue
        n = live.iloc[0]
        r = {'d': d.isoformat(), 'code': n['到期月份(週別)'],
             **{k: (float(n[k]) if pd.notna(n[k]) else None) for k in ['o', 'h', 'l', 'c', 's']},
             'vol': int(g['vol'].sum()),
             'oi': int(reg[reg['到期月份(週別)'].map(_expiry) != d]['oi'].fillna(0).sum()),
             **{k: net.get(d, {}).get(k) for k in INST.values()}}
        rows[r['d']] = r
        vol = g.groupby('到期月份(週別)')['vol'].sum()
        curve = {'date': d.isoformat(), 'contracts': [
            {'code': x['到期月份(週別)'], 'expiry': _expiry(x['到期月份(週別)']).isoformat(),
             'c': x['c'] if pd.notna(x['c']) else None, 's': x['s'] if pd.notna(x['s']) else None,
             'chg': x['chg'] if pd.notna(x['chg']) else None,
             'vol': int(vol.get(x['到期月份(週別)'], 0)), 'oi': int(x['oi']) if pd.notna(x['oi']) else 0}
            for _, x in reg.sort_values('到期月份(週別)').iterrows()]}
    return rows, curve


def update(cache, today, backfill_days):
    """cache 為上次發佈的 futures.json(或 None)，回傳新的 futures.json 內容。"""
    old = cache or {'series': {k: [] for k in KEYS}, 'curve': None}
    ser = old['series']
    rows = {d: {k: ser[k][i] for k in KEYS} for i, d in enumerate(ser['d'])}
    start = (date.fromisoformat(ser['d'][-1]) - timedelta(days=7)) if ser['d'] else today - timedelta(days=backfill_days)
    q, inst = download(start, today)
    new, curve = summarize(q, inst)
    rows.update(new)
    hist = sorted(rows.values(), key=lambda r: r['d'])
    if not hist:
        raise RuntimeError('沒有下載到任何台指期資料')
    last = hist[-1]
    print(f"台指期：{len(hist)} 個交易日，最新 {last['d']} 近月 {last['code']} 收 {last['c']}，外資淨未平倉 {last['fi']}")
    return {'series': {k: [r[k] for r in hist] for k in KEYS}, 'curve': curve or old['curve']}
