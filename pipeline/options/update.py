"""
資料集 options：臺指選擇權(TXO)與臺股期貨(TX)每日行情 → web/data/options/
  - 來源：臺灣期貨交易所「選擇權每日交易行情下載」(一次最多查一個月)
  - history.json：每日的 30 天平價隱含波動率、Put/Call 比、成交量與未平倉量(第一次回補 1 年，之後增量更新)
  - chain.json：最新交易日各到期契約的 T 字報價(結算價、成交量、未平倉量、隱含波動率)
  - futures.json：台指期近月走勢、三大法人淨未平倉、期限結構(見 futures.py)
排程：.github/workflows/data-options.yml；本機手動：python pipeline/options/update.py

計算方式
  - 遠期價格 F：用買賣權平價，在 |C − P| 最小的履約價 K 上 F = K + e^{rT}(C − P)，不需要現貨價
  - 隱含波動率：以結算價反推 Black-76 模型的 σ(二分法)
  - 30 天隱含波動率：各到期日的平價 IV 換成總變異數 σ²T，在 30 天前後兩個到期日之間線性內插(同 VIX 的概念)
  - Put/Call 比：成交量含一般與盤後時段；未平倉量不含當日到期的契約(與期交所公布的數字一致)
"""
import io
import math
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import TW, dataset_dir, load_published, write_json, write_meta  # noqa: E402
import futures  # noqa: E402

DATASET = 'options'
URL = 'https://www.taifex.com.tw/cht/3/dlOptDataDown'
HEADERS = {'User-Agent': 'Mozilla/5.0 (little-trader data bot)'}
R = 0.017              # 無風險利率(約台灣一年期定存利率)，計算 IV 用
BACKFILL_DAYS = 370    # 沒有快取時回補的天數
CHAIN_RANGE = 0.12     # T 字報價只保留遠期價格 ±12% 的履約價
HIST_KEYS = ['d', 'iv30', 'fwd', 'pcv', 'pcoi', 'cv', 'pv', 'coi', 'poi']


# ---------- Black-76 ----------
def _ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def b76(F, K, T, sigma, call, r=R):
    if sigma <= 0 or T <= 0:
        return math.exp(-r * T) * max(F - K if call else K - F, 0)
    sd = sigma * math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * sd * sd) / sd
    d2 = d1 - sd
    if call:
        return math.exp(-r * T) * (F * _ncdf(d1) - K * _ncdf(d2))
    return math.exp(-r * T) * (K * _ncdf(-d2) - F * _ncdf(-d1))


def implied_vol(price, F, K, T, call):
    """二分法反推 σ；價格低於內含價值或高於上限時回傳 None。"""
    if price is None or T <= 0:
        return None
    lo, hi = 1e-4, 3.0
    if not (b76(F, K, T, lo, call) < price < b76(F, K, T, hi, call)):
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if b76(F, K, T, mid, call) < price:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def expiry_from_code(code):
    """舊檔(2025-12 前)沒有「契約到期日」欄位，由契約代碼推算：
    月契約 202610 = 第 3 個週三；週契約 202610W2 = 第 2 個週三、202610F2 = 第 2 個週五(不考慮假日順延)。"""
    y, m = int(code[:4]), int(code[4:6])
    kind, n = (code[6], int(code[7])) if len(code) >= 8 else ('W', 3)
    wd = 4 if kind == 'F' else 2
    first = date(y, m, 1)
    return first + timedelta(days=(wd - first.weekday()) % 7 + 7 * (n - 1))


# ---------- 下載 ----------
def download(start: date, end: date, retries=3):
    """下載 [start, end] 的 TXO 行情(區間不可超過一個月)。"""
    form = {'down_type': '1', 'commodity_id': 'TXO', 'commodity_id2': '',
            'queryStartDate': start.strftime('%Y/%m/%d'), 'queryEndDate': end.strftime('%Y/%m/%d')}
    for i in range(retries):
        try:
            r = requests.post(URL, data=form, headers=HEADERS, timeout=180)
            r.raise_for_status()
            text = r.content.decode('cp950', errors='replace')
            if not text.startswith('交易日期'):
                return pd.DataFrame()   # 查無資料(假日)時期交所回傳 HTML 頁面
            return pd.read_csv(io.StringIO(text), index_col=False, dtype=str)
        except Exception as e:  # noqa: BLE001
            print(f'下載 {start}~{end} 失敗({i + 1}/{retries})：{e!r}', file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError(f'無法下載 {start}~{end}')


def download_range(start: date, end: date):
    frames, s = [], start
    while s <= end:
        e = min(end, (s.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1))
        print(f'下載 TXO {s} ~ {e}')
        frames.append(download(s, e))
        s = e + timedelta(days=1)
        time.sleep(3)
    df = pd.concat([f for f in frames if not f.empty], ignore_index=True) if any(not f.empty for f in frames) else pd.DataFrame()
    if df.empty:
        return df
    df.columns = [c.strip() for c in df.columns]
    df = df.apply(lambda col: col.str.strip())
    df = df[df['契約'] == 'TXO']
    num = lambda c: pd.to_numeric(df[c].replace('-', None), errors='coerce')  # noqa: E731
    return pd.DataFrame({
        'date': pd.to_datetime(df['交易日期']).dt.date,
        'code': df['到期月份(週別)'],
        'expiry': [date(int(e[:4]), int(e[4:6]), int(e[6:8])) if isinstance(e, str) and len(e) == 8 else expiry_from_code(c)
                   for e, c in zip(df.get('契約到期日', pd.Series(None, index=df.index)), df['到期月份(週別)'])],
        'k': num('履約價'),
        'call': df['買賣權'] == '買權',
        'session': df['交易時段'],
        'settle': num('結算價'),
        'vol': num('成交量').fillna(0).astype(int),
        'oi': num('未沖銷契約數'),
    })


# ---------- 計算 ----------
def expiry_table(day_df, d, chain=False):
    """單日各到期契約：遠期價格、平價 IV；chain=True 時另外產生 T 字報價(只有最新一日需要)。"""
    reg = day_df[day_df['session'] == '一般']
    vol = day_df.groupby(['code', 'k', 'call'])['vol'].sum()   # 成交量 = 一般 + 盤後
    out = []
    for (code, expiry), g in reg.groupby(['code', 'expiry']):
        days = (expiry - d).days
        if days <= 0:
            continue
        T = days / 365
        c = g[g['call']].set_index('k')
        p = g[~g['call']].set_index('k')
        both = c[['settle', 'oi']].join(p[['settle', 'oi']], lsuffix='_c', rsuffix='_p', how='inner').dropna(subset=['settle_c', 'settle_p'])
        if both.empty:
            continue
        k0 = (both['settle_c'] - both['settle_p']).abs().idxmin()
        F = k0 + math.exp(R * T) * (both.at[k0, 'settle_c'] - both.at[k0, 'settle_p'])
        # 平價 IV：F 兩側最近的履約價，價外那一邊(較準確)的 IV 依距離內插
        ks = sorted(both.index)
        lo = max([k for k in ks if k <= F], default=None)
        hi = min([k for k in ks if k >= F], default=None)
        ivs = []
        for k in {lo, hi} - {None}:
            iv = implied_vol(both.at[k, 'settle_p'] if k <= F else both.at[k, 'settle_c'], F, k, T, call=k > F)
            if iv:
                ivs.append((k, iv))
        if not ivs:
            continue
        if len(ivs) == 2 and ivs[1][0] != ivs[0][0]:
            (k1, v1), (k2, v2) = sorted(ivs)
            atm = v1 + (v2 - v1) * (F - k1) / (k2 - k1)
        else:
            atm = ivs[0][1]
        strikes = []
        for k in (ks if chain else []):
            if abs(k / F - 1) > CHAIN_RANGE:
                continue
            row = {'k': int(k)}
            for side, call in (('c', True), ('p', False)):
                s = both.at[k, f'settle_{side}']
                iv = implied_vol(s, F, k, T, call)
                oi = both.at[k, f'oi_{side}']
                row[side] = [s, int(vol.get((code, k, call), 0)), int(oi) if pd.notna(oi) else 0,
                             round(iv, 4) if iv else None]
            strikes.append(row)
        out.append({'code': code, 'expiry': expiry.isoformat(), 'days': days, 'fwd': round(F, 1),
                    'atm_iv': round(atm, 4), 'strikes': strikes})
    return sorted(out, key=lambda e: e['days'])


def iv30(exps):
    """30 天平價隱含波動率：總變異數在 30 天前後兩個到期日之間線性內插。"""
    pts = [(e['days'], e['atm_iv'] ** 2 * e['days'] / 365) for e in exps if e['days'] >= 3]
    if not pts:
        return None
    below = [p for p in pts if p[0] <= 30]
    above = [p for p in pts if p[0] >= 30]
    if below and above:
        (t1, w1), (t2, w2) = below[-1], above[0]
        w = w1 if t1 == t2 else w1 + (w2 - w1) * (30 - t1) / (t2 - t1)
    else:   # 只有單側：用最接近的到期日等比例換算
        t, w0 = above[0] if above else below[-1]
        w = w0 * 30 / t
    return math.sqrt(w * 365 / 30)


def summarize(day_df, d, chain=False):
    exps = expiry_table(day_df, d, chain)
    reg = day_df[(day_df['session'] == '一般') & (day_df['expiry'] != d)]   # 未平倉不含當日到期
    cv = int(day_df[day_df['call']]['vol'].sum())
    pv = int(day_df[~day_df['call']]['vol'].sum())
    coi = int(reg[reg['call']]['oi'].sum())
    poi = int(reg[~reg['call']]['oi'].sum())
    v = iv30(exps)
    near = next((e for e in exps if '' == e['code'][6:]), exps[0] if exps else None)  # 近月(月契約)
    row = {'d': d.isoformat(), 'iv30': round(v, 4) if v else None, 'fwd': near['fwd'] if near else None,
           'pcv': round(pv / cv * 100, 2) if cv else None, 'pcoi': round(poi / coi * 100, 2) if coi else None,
           'cv': cv, 'pv': pv, 'coi': coi, 'poi': poi}
    return row, exps


def main():
    today = datetime.now(TW).date()
    cache = load_published(DATASET, 'history.json') or {k: [] for k in HIST_KEYS}
    rows = {d: {k: cache[k][i] for k in HIST_KEYS} for i, d in enumerate(cache['d'])}
    start = (date.fromisoformat(cache['d'][-1]) - timedelta(days=7)) if cache['d'] else today - timedelta(days=BACKFILL_DAYS)
    df = download_range(start, today)
    if df.empty and not rows:
        raise RuntimeError('沒有下載到任何選擇權資料')

    latest_exps, latest_day = None, None
    days = sorted(df['date'].unique()) if not df.empty else []
    for d in days:
        row, exps = summarize(df[df['date'] == d], d, chain=(d == days[-1]))
        rows[row['d']] = row
        latest_exps, latest_day = exps, d
    if latest_exps is None:   # 期間內沒有新資料：沿用上次的 T 字報價
        chain = load_published(DATASET, 'chain.json')
    else:
        chain = {'date': latest_day.isoformat(), 'r': R, 'multiplier': 50, 'expiries': latest_exps}

    hist = sorted(rows.values(), key=lambda r: r['d'])
    fut = futures.update(load_published(DATASET, 'futures.json'), today, BACKFILL_DAYS)
    out_dir = dataset_dir(DATASET)
    write_json(out_dir / 'futures.json', fut)
    write_json(out_dir / 'history.json', {k: [r[k] for r in hist] for k in HIST_KEYS})
    write_json(out_dir / 'chain.json', chain)
    meta = write_meta(DATASET, '臺灣期貨交易所 期貨、選擇權每日交易行情與三大法人', 'https://www.taifex.com.tw/cht/3/dlOptDataDown',
                      '週一~週五 16:00、06:00(台北時間)', last_trade_date=chain['date'], days=len(hist))
    last = hist[-1]
    print(f"完成：{len(hist)} 個交易日，最新 {last['d']}，30 天 IV {last['iv30']}，P/C OI {last['pcoi']}%")
    return meta


if __name__ == '__main__':
    main()
