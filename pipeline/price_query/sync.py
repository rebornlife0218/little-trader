"""
股票查詢(網頁「股票 › 台股 › 股票查詢」)的資料：本機 PostgreSQL 的 cm schema → Cloudflare D1
  每檔每年一筆(price_chunks)，data = gzip 的 JSON(欄式，只放有成交的日子)：
    d 日期、o h l c 開高低收(原始價格)、a 還原收盤價(含除權息)、v 成交量(張)、
    f 外資買賣超(張)、t 投信買賣超(張)、m 融資餘額(張)、s 融券餘額(張)、b 借券賣出餘額(張)、
    ev 事件 [[日期, 種類, 說明, 結束日期]]：rev 月營收公告(年成長)、div 除權息、split 分割或減資(由還原與原始股價的比例變化推算)、
       halt 暫停交易、disp 處置(到結束日期)
  查 10 年只要讀約 11 列，不會用掉 D1 的讀取額度。
  股票清單(symbols)：名稱、上市/上櫃/創新板、股本(億元，實收資本額)、資料期間、是否已下市櫃；整份清單另存在 meta 的 symbols_gz(查詢頁只讀這 1 列)。
  每次都在本機重算全部，但只上傳內容有變的(新的交易日、除權息後還原股價整段改變、資料修正)；
  上傳過的內容記在 ~/.cache/little-trader/d1_prices.json，刪掉這個檔就會全部重傳。
用法：python pipeline/price_query/sync.py [--local]   (--local：寫進 wrangler pages dev 用的本機 D1)
需要：本機 PostgreSQL；正式 D1 要先 npx wrangler login(run_local.py 每天同步後會自動執行)
"""
import base64
import gzip
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'pipeline'))
from common import pg_connect  # noqa: E402

DB_NAME = 'little-trader'
STATE = Path.home() / '.cache' / 'little-trader' / 'd1_prices.json'
# 欄位單位都已用 2330 核對：成交量、外資與投信買賣超、融資券餘額、借券賣出餘額都是「張」
COLS = {'o': '開盤價', 'h': '最高價', 'l': '最低價', 'c': '收盤價', 'a': '還原收盤價', 'v': '成交量',
        'f': '外資買賣超', 't': '投信買賣超', 'm': '資餘', 's': '券餘', 'b': '借券賣出餘額'}
SQL_PRICES = f'''COPY (
  SELECT "股票代號", "日期", {", ".join(f'"{c}"' for c in COLS.values())} FROM cm.tw_daily
  WHERE "成交量" > 0 AND "收盤價" > 0 ORDER BY 1, 2
) TO STDOUT WITH CSV'''
SQL_NAMES = '''
  SELECT DISTINCT ON ("股票代號") "股票代號", "股票名稱", "上市上櫃", "實收資本額(百萬)" FROM cm.tw_company_info
  ORDER BY "股票代號", "年度" DESC'''
SQL_DELISTED = 'SELECT "股票代號", "股票名稱" FROM cm.tw_delisted_company'
SQL_REVENUE = '''
  SELECT "股票代號", "年月", COALESCE("單月合併營收年成長(%)", "單月營收年成長(%)"), "公告日"::date FROM cm.tw_monthly_revenue
  WHERE "公告日" IS NOT NULL'''
SQL_HALT = 'SELECT "股票代號", "暫停交易日期"::date, "恢復交易日期"::date FROM cm.tw_trading_halt'
SQL_DISP = 'SELECT "股票代號", "處置時間起"::date, "處置時間迄"::date, "處置措施" FROM cm.tw_disposition'
MARKET = {'1': '上市', '2': '上櫃', '7': '創新板'}
MAX_FILE = 40_000_000     # 一次上傳的 SQL 檔上限(位元組)，太大就分批


def load():
    with pg_connect() as conn, conn.cursor() as cur:
        buf = io.BytesIO()
        with cur.copy(SQL_PRICES) as cp:
            for block in cp:
                buf.write(block)
        out = {}
        for k, sql in [('names', SQL_NAMES), ('delisted', SQL_DELISTED), ('rev', SQL_REVENUE), ('halt', SQL_HALT), ('disp', SQL_DISP)]:
            cur.execute(sql)
            out[k] = cur.fetchall()
    buf.seek(0)
    df = pd.read_csv(buf, header=None, names=['sym', 'd', *COLS], dtype={'sym': str, 'd': str})
    return df, out


ETF_NAMES = STATE.with_name('etf_names.json')   # 累積下來的 ETF 名稱與市場：下市後官方清單就查不到，留著繼續用


def etf_info():
    """資料庫的公司基本資料沒有 ETF：用證交所(上市)、櫃買中心(上櫃)當天的收盤行情補名稱與市場(失敗時沿用上次存的)"""
    import requests
    cache = json.loads(ETF_NAMES.read_text(encoding='utf-8')) if ETF_NAMES.exists() else {}
    cache = {k: (v if isinstance(v, list) else [v, '']) for k, v in cache.items()}   # 舊格式只有名稱
    for url, code, name, market in [('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', 'Code', 'Name', '上市'),
                                    ('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', 'SecuritiesCompanyCode', 'CompanyName', '上櫃')]:
        try:
            rows = requests.get(url, timeout=120, headers={'User-Agent': 'Mozilla/5.0'}).json()
            cache.update({r[code].strip(): [r[name].strip(), market] for r in rows if r[code].startswith('00') and r[name].strip()})
        except Exception as e:  # noqa: BLE001
            print(f'ETF 名稱下載失敗(沿用上次的)：{url}：{e!r}', file=sys.stderr)
    ETF_NAMES.parent.mkdir(parents=True, exist_ok=True)
    ETF_NAMES.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    return cache


def events(df, ext):
    """{代號: [[日期, 種類, 說明, 結束日期]]}；日期一律對到該股票的交易日(公告日、暫停日當天沒交易就放在下一個交易日)"""
    days = {s: g['d'].to_numpy() for s, g in df.groupby('sym', sort=False)}
    out = {s: [] for s in days}

    def on_trading_day(s, d):
        a = days.get(s)
        if a is None:
            return None
        i = np.searchsorted(a, str(d))
        return a[i] if i < len(a) else None

    for s, ym, yoy, d in ext['rev']:
        day = on_trading_day(s, d)
        if day:
            out[s].append([day, 'rev', f'{int(ym[4:])}月營收' + (f' {yoy:+.1f}%' if yoy is not None and np.isfinite(yoy) else ''), None])
    for s, d0, d1 in ext['halt']:
        day = on_trading_day(s, d0)
        if day:
            out[s].append([day, 'halt', '暫停交易' + (f'(至 {d1:%m/%d})' if d1 else ''), None])
    for s, d0, d1, how in ext['disp']:
        day = on_trading_day(s, d0)
        if day:
            out[s].append([day, 'disp', how or '處置', str(d1) if d1 else None])
    # 除權息、分割或減資：還原收盤價 ÷ 收盤價 的比例跳動(平常只有四捨五入造成的小誤差)
    for s, g in df.groupby('sym', sort=False):
        c, a = g['c'].to_numpy(float), g['a'].to_numpy(float)
        r = a / c
        jump = r[1:] / r[:-1] - 1
        noise = 4 * (0.005 / a[1:] + 0.005 / c[1:] + 0.005 / a[:-1] + 0.005 / c[:-1])
        for i in np.where(np.abs(jump) > np.maximum(0.002, noise))[0]:
            day = g['d'].iat[i + 1]
            if abs(jump[i]) > 0.25:
                out[s].append([day, 'split', '分割或減資', None])
            else:
                out[s].append([day, 'div', f'除權息 {jump[i] * 100:.1f}%', None])   # 還原比例變化 ≈ 殖利率
    for s in out:
        out[s].sort(key=lambda e: e[0])
    return out


def chunks(df, ev):
    """{(代號, 年): (交易日數, gzip bytes, md5)}"""
    df['y'] = df['d'].str[:4].astype(int)
    out = {}
    for (s, y), g in df.groupby(['sym', 'y'], sort=False):
        obj = {'d': g['d'].tolist()}
        for k in COLS:
            digits = 4 if k == 'a' else 2 if k in 'ohlc' else 0
            obj[k] = [(round(float(x), digits) if digits else int(round(x))) if pd.notna(x) else None for x in g[k]]
        obj['ev'] = [e for e in ev.get(s, []) if e[0][:4] == str(y)]
        raw = json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode()
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

    df, ext = load()
    info = {s: (n, MARKET.get(str(m), ''), round(cap / 100, 2) if cap else None) for s, n, m, cap in ext['names']}
    etf = etf_info()
    delisted = dict(ext['delisted'])
    print(f'cm.tw_daily：{df["sym"].nunique()} 檔、{len(df):,} 筆，{df["d"].min()} ~ {df["d"].max()}')
    ev = events(df, ext)
    print(f'事件：{sum(len(v) for v in ev.values()):,} 筆(月營收、除權息、暫停交易、處置)')
    C = chunks(df, ev)
    span = df.groupby('sym')['d'].agg(['min', 'max'])
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

    sym_rows = []
    for s, r in span.iterrows():
        name, market, cap = info.get(s) or (etf.get(s, [None, ''])[0], etf.get(s, [None, ''])[1], None)
        row = (name or delisted.get(s) or '', r['min'], r['max'], int(s in delisted and r['max'] < last), market or None, cap)
        sym_rows.append((s, row))
        key, h = f'sym:{s}', hashlib.md5(json.dumps(row, ensure_ascii=False).encode()).hexdigest()
        new_state[key] = h
        if state.get(key) != h:
            stmts.append('INSERT OR REPLACE INTO symbols (symbol, name, first_date, last_date, delisted, market, capital) VALUES '
                         f'({sql_str(s)}, {sql_str(row[0])}, {sql_str(row[1])}, {sql_str(row[2])}, {row[3]}, {sql_str(row[4])}, '
                         f'{"NULL" if row[5] is None else row[5]});')
    # 整份股票清單另存成一列(gzip＋base64)：查詢頁每次打開只讀 1 列，不用讀 2,500 多列
    sym_list = [{'symbol': s, 'name': r[0], 'first_date': r[1], 'last_date': r[2], 'delisted': r[3], 'market': r[4], 'capital': r[5]}
                for s, r in sym_rows]
    raw = json.dumps(sym_list, ensure_ascii=False, separators=(',', ':')).encode()
    h = hashlib.md5(raw).hexdigest()
    if state.get('symbols_gz') != h:
        stmts.append(f"INSERT OR REPLACE INTO meta (k, v) VALUES ('symbols_gz', '{base64.b64encode(gzip.compress(raw, 9, mtime=0)).decode()}');")
    new_state['symbols_gz'] = h
    stmts.append(f"INSERT OR REPLACE INTO meta (k, v) VALUES ('last_date', {sql_str(last)});")

    total = sum(len(gz) for _, gz, _ in C.values())
    print(f'{len(C):,} 個年度區塊(壓縮後共 {total / 1e6:.1f} MB)，要上傳 {n_chunks:,} 個區塊、{len(stmts) - n_chunks - 1:,} 檔股票資料')
    execute(stmts, local)
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(new_state), encoding='utf-8')
    print(f'完成：資料到 {last}({"本機" if local else "正式"} D1)')


if __name__ == '__main__':
    main()
