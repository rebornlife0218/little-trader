"""
股價查詢(網頁「股票 › 台股 › 股價查詢」)的資料：本機 PostgreSQL 的 cm.tw_daily → Cloudflare D1
  每檔每年一筆(price_chunks)，data = gzip 的 JSON {d 日期, o h l c 開高低收(原始價格), a 還原收盤價, v 成交量(張)}；
  只放有成交的日子。查 10 年只要讀約 11 列，不會用掉 D1 的讀取額度。
  每次都在本機重算全部，但只上傳內容有變的(新的交易日、除權息後還原股價整段改變、資料修正)；
  上傳過的內容記在 ~/.cache/little-trader/d1_prices.json，刪掉這個檔就會全部重傳。
用法：python pipeline/price_query/sync.py [--local]   (--local：寫進 wrangler pages dev 用的本機 D1)
需要：本機 PostgreSQL；正式 D1 要先 npx wrangler login(run_local.py 每天同步後會自動執行)
"""
import gzip
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'pipeline'))
from common import pg_connect  # noqa: E402

DB_NAME = 'little-trader'
STATE = Path.home() / '.cache' / 'little-trader' / 'd1_prices.json'
SQL_PRICES = '''COPY (
  SELECT "股票代號", "日期", "開盤價", "最高價", "最低價", "收盤價", "還原收盤價", "成交量" FROM cm.tw_daily
  WHERE "成交量" > 0 AND "收盤價" > 0 ORDER BY 1, 2
) TO STDOUT WITH CSV'''
SQL_NAMES = '''
  SELECT DISTINCT ON ("股票代號") "股票代號", "股票名稱" FROM cm.tw_company_info ORDER BY "股票代號", "年度" DESC'''
SQL_DELISTED = 'SELECT "股票代號", "股票名稱" FROM cm.tw_delisted_company'
MAX_FILE = 40_000_000     # 一次上傳的 SQL 檔上限(位元組)，太大就分批


def load():
    with pg_connect() as conn, conn.cursor() as cur:
        buf = io.BytesIO()
        with cur.copy(SQL_PRICES) as cp:
            for block in cp:
                buf.write(block)
        cur.execute(SQL_NAMES)
        names = dict(cur.fetchall())
        cur.execute(SQL_DELISTED)
        delisted = dict(cur.fetchall())
    buf.seek(0)
    df = pd.read_csv(buf, header=None, names=['s', 'd', 'o', 'h', 'l', 'c', 'a', 'v'], dtype={'s': str, 'd': str})
    return df, names, delisted


ETF_NAMES = STATE.with_name('etf_names.json')   # 累積下來的 ETF 名稱：下市後官方清單就查不到，留著繼續用


def etf_names():
    """資料庫的公司基本資料沒有 ETF：用證交所、櫃買中心當天的收盤行情補名稱(失敗時沿用上次存的)"""
    import requests
    cache = json.loads(ETF_NAMES.read_text(encoding='utf-8')) if ETF_NAMES.exists() else {}
    for url, code, name in [('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', 'Code', 'Name'),
                            ('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', 'SecuritiesCompanyCode', 'CompanyName')]:
        try:
            rows = requests.get(url, timeout=120, headers={'User-Agent': 'Mozilla/5.0'}).json()
            cache.update({r[code].strip(): r[name].strip() for r in rows if r[code].startswith('00') and r[name].strip()})
        except Exception as e:  # noqa: BLE001
            print(f'ETF 名稱下載失敗(沿用上次的)：{url}：{e!r}', file=sys.stderr)
    ETF_NAMES.parent.mkdir(parents=True, exist_ok=True)
    ETF_NAMES.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    return cache


def chunks(df):
    """{(代號, 年): (交易日數, gzip bytes, md5)}"""
    df['y'] = df['d'].str[:4].astype(int)
    out = {}
    for (s, y), g in df.groupby(['s', 'y'], sort=False):
        obj = {'d': g['d'].tolist()}
        for k in 'ohlca':
            obj[k] = [round(float(x), 2 if k != 'a' else 4) if pd.notna(x) else None for x in g[k]]
        obj['v'] = [int(x) if pd.notna(x) else None for x in g['v']]
        raw = json.dumps(obj, separators=(',', ':')).encode()
        out[(s, int(y))] = (len(g), gzip.compress(raw, 9, mtime=0), hashlib.md5(raw).hexdigest())
    return out


def sql_str(v):
    return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"


def wrangler(*args):
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    p = subprocess.run([npx, 'wrangler', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace',
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if p.returncode:
        raise RuntimeError(f'wrangler {" ".join(args[:3])} 失敗：{(p.stdout + p.stderr)[-1500:]}')
    return p.stdout


def execute(statements, local):
    """分批寫成 SQL 檔，用 wrangler d1 execute 上傳"""
    batches, cur, size = [], [], 0
    for st in statements:
        if cur and size + len(st) > MAX_FILE:
            batches.append(cur); cur, size = [], 0
        cur.append(st); size += len(st) + 1
    if cur:
        batches.append(cur)
    for i, b in enumerate(batches, 1):
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
            f.write('\n'.join(b))
            path = f.name
        try:
            wrangler('d1', 'execute', DB_NAME, '--local' if local else '--remote', '--file', path, '-y')
            print(f'  上傳第 {i}/{len(batches)} 批({len(b)} 筆、{Path(path).stat().st_size / 1e6:.1f} MB)')
        finally:
            Path(path).unlink(missing_ok=True)


def main():
    local = '--local' in sys.argv
    state_file = STATE.with_name('d1_prices_local.json') if local else STATE
    state = json.loads(state_file.read_text(encoding='utf-8')) if state_file.exists() else {}

    df, names, delisted = load()
    names = {**etf_names(), **names}
    print(f'cm.tw_daily：{df["s"].nunique()} 檔、{len(df):,} 筆，{df["d"].min()} ~ {df["d"].max()}')
    C = chunks(df)
    span = df.groupby('s')['d'].agg(['min', 'max'])
    last = df['d'].max()

    stmts, new_state = [], {}
    for (s, y), (n, gz, md5) in C.items():
        key = f'{s}:{y}'
        new_state[key] = md5
        if state.get(key) != md5:
            stmts.append(f"INSERT OR REPLACE INTO price_chunks (symbol, year, n, data) VALUES ('{s}', {y}, {n}, X'{gz.hex()}');")
    gone = [k for k in state if k.count(':') == 1 and not k.startswith('sym:') and k not in new_state]
    stmts += [f"DELETE FROM price_chunks WHERE symbol = {sql_str(k.split(':')[0])} AND year = {int(k.split(':')[1])};" for k in gone]
    n_chunks = len(stmts)

    for s, r in span.iterrows():
        row = (names.get(s) or delisted.get(s) or '', r['min'], r['max'], int(s in delisted and r['max'] < last))
        key, h = f'sym:{s}', hashlib.md5(json.dumps(row, ensure_ascii=False).encode()).hexdigest()
        new_state[key] = h
        if state.get(key) != h:
            stmts.append('INSERT OR REPLACE INTO symbols (symbol, name, first_date, last_date, delisted) VALUES '
                         f'({sql_str(s)}, {sql_str(row[0])}, {sql_str(row[1])}, {sql_str(row[2])}, {row[3]});')
    stmts.append(f"INSERT OR REPLACE INTO meta (k, v) VALUES ('last_date', {sql_str(last)});")

    total = sum(len(gz) for _, gz, _ in C.values())
    print(f'{len(C):,} 個年度區塊(壓縮後共 {total / 1e6:.1f} MB)，要上傳 {n_chunks:,} 個區塊、{len(stmts) - n_chunks - 1:,} 檔股票資料')
    execute(stmts, local)
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(new_state), encoding='utf-8')
    print(f'完成：資料到 {last}({"本機" if local else "正式"} D1)')


if __name__ == '__main__':
    main()
