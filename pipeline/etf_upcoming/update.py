"""
資料集 etf_upcoming：即將發行 ETF(MoneyDJ 新基金一覽表，只取基金名稱含「ETF」者) → web/data/etf_upcoming/
排程：.github/workflows/data-etf.yml；本機手動：python pipeline/etf_upcoming/update.py
"""
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

DATASET = 'etf_upcoming'
URL = 'https://www.moneydj.com/funddj/fundmarket.djhtm?a=broncho-1'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                         '(KHTML, like Gecko) Chrome/130.0 Safari/537.36'}
# 表格欄位順序：基金名稱、基金型態、經理人、目前規模、募集期間、申請日、核准日期、申請金額
COLS = ['name', 'type', 'manager', 'size', 'period', 'apply_date', 'approve_date', 'amount']


def fetch_html(retries=3):
    last = None
    for i in range(1, retries + 1):
        try:
            r = requests.get(URL, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return r.content.decode('big5', errors='replace')  # MoneyDJ 為 Big5 編碼
        except Exception as e:  # noqa: BLE001
            last = e
            print(f'第 {i} 次下載失敗：{e!r}', file=sys.stderr)
            time.sleep(10 * i)
    raise RuntimeError(f'下載失敗：{last!r}')


def clean(text):
    t = re.sub(r'\s+', ' ', text).strip()
    return '' if t in ('-', '－') else t


def parse_rows(html):
    """展開 rowspan：同一檔基金跨列合併的欄位(如募集期間)會補到每一列。"""
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', class_='FDJ-1_TB')
    if table is None:
        raise RuntimeError('找不到基金表格，網頁結構可能已變更')
    title = clean(table.find('tr').get_text(' '))
    rows, pending = [], {}  # pending: 欄位 -> [剩餘列數, 文字]
    for tr in table.find_all('tr')[2:]:  # 跳過標題列與欄位名稱列
        cells = tr.find_all('td', recursive=False)
        row, ci = {}, 0
        for col in range(len(COLS)):
            if col in pending:
                remain, text = pending[col]
                row[col] = text
                pending[col][0] -= 1
                if pending[col][0] <= 0:
                    del pending[col]
                continue
            if ci >= len(cells):
                break
            td = cells[ci]
            ci += 1
            text = clean(td.get_text(' '))
            row[col] = text
            span = int(td.get('rowspan', 1) or 1)
            if span > 1:
                pending[col] = [span - 1, text]
        if len(row) == len(COLS):
            rows.append(dict(zip(COLS, (row[i] for i in range(len(COLS))))))
    return title, rows


def main():
    title, rows = parse_rows(fetch_html())
    # 合併同一檔基金的多列(例如申請金額分台幣/外幣兩列)
    funds = {}
    for r in rows:
        f = funds.setdefault(r['name'], {**r, 'amount': []})
        if r['amount'] and r['amount'] not in f['amount']:
            f['amount'].append(r['amount'])
    etfs = [{
        'name': f['name'],
        'manager': f['manager'],
        'period': f['period'],
        'amount': ' / '.join(f['amount']),
    } for f in funds.values() if 'ETF' in f['name'].upper()]
    if not rows:
        raise RuntimeError('沒有解析到任何基金資料，中止更新')

    out = dataset_dir(DATASET)
    write_json(out / 'upcoming.json', {'title': title, 'items': etfs})
    meta = write_meta(DATASET, 'MoneyDJ 理財網 · 新基金一覽表', URL, '每個工作日 08:30、17:30',
                      count=len(etfs), page_title=title)
    print(f"{title}：共 {len(rows)} 列，ETF {len(etfs)} 檔，更新時間 {meta['updated_at']}")
    for e in etfs:
        print(f"  {e['name']} | {e['manager'] or '-'} | {e['period'] or '-'} | {e['amount'] or '-'}")


if __name__ == '__main__':
    main()
