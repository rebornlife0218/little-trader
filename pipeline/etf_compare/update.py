"""
資料集 etf_compare：「怎麼存 ETF」用的資料 → web/data/etf_compare/
  compare.json：0050 與勞退基金(新制)的每月報酬
  etfs.json：常存 ETF(與 ARKK)的每日收盤、股利再投入的還原股價、每股配息，供績效比較、單筆 vs 定期定額回測
    台股 ETF 的配息用臺灣證券交易所「除權除息計算結果表」(Yahoo 的配息資料不完整)
  - 台股 ETF 收盤價：本機 PostgreSQL 的 cm.tw_daily(2016 年起)；資料庫開始之前沿用 Yahoo Finance(0050、0056、006208，從上市日起)
    兩邊都排除沒有成交的日子；cm 的收盤價沒有分割調整，用 fix_unadjusted_splits 換算
  - 勞退基金：勞動基金運用局公告的「最近月份收益率」(當年度截至該月的累計收益率，每年 1 月重新起算)
    換成每月報酬：1 月 = 當月數字；其他月 = (1 + 本月累計) ÷ (1 + 上月累計) − 1
  - 0050：上述每日收盤與股利再投入還原股價的月底值
  - ARKK(美股)：Yahoo Finance 收盤與還原股價
排程：本機 pipeline/run_local.py(要連本機資料庫，GitHub Actions 連不到)；手動：python pipeline/run_local.py etf_compare
"""
import io
import re
import ssl
import sys
import time
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf
from requests.adapters import HTTPAdapter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, pg_connect, write_json, write_meta  # noqa: E402

DATASET = 'etf_compare'
LPF_URL = 'https://www.blf.gov.tw/49200/49255/49261/49269/49279/73028/post'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'}


class _LenientX509(HTTPAdapter):
    """勞動基金運用局的憑證缺少 Subject Key Identifier，Python 3.13 起的嚴格檢查會拒絕；
    仍然驗證憑證，只關閉 VERIFY_X509_STRICT 這一項。"""
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.verify_flags &= ~getattr(ssl, 'VERIFY_X509_STRICT', 0)
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)


def fetch_lpf(retries=3):
    """回傳 {'YYYY-MM': 當年度累計收益率(小數)}"""
    session = requests.Session()
    session.mount('https://www.blf.gov.tw', _LenientX509())
    for i in range(retries):
        try:
            r = session.get(LPF_URL, headers=HEADERS, timeout=60)
            r.raise_for_status()
            r.encoding = 'utf-8'
            break
        except Exception as e:  # noqa: BLE001
            print(f'勞退基金下載失敗({i + 1}/{retries})：{e!r}', file=sys.stderr)
            time.sleep(5 * (i + 1))
    else:
        raise RuntimeError('無法下載勞退基金收益率')
    table = next(t for t in pd.read_html(io.StringIO(r.text)) if '最近月份收益率' in ''.join(map(str, t.columns)))
    out = {}
    for _, row in table.iterrows():
        m = re.match(r'(\d+)年(\d+)月份', str(row['月份']))
        v = re.match(r'(-?[\d.]+)%', str(row['最近月份收益率']).strip())
        if m and v:
            out[f'{int(m.group(1)) + 1911}-{int(m.group(2)):02d}'] = float(v.group(1)) / 100
    return dict(sorted(out.items()))


def ytd_to_monthly(ytd):
    months, monthly, prev = list(ytd), {}, None
    for ym in months:
        y, m = ym.split('-')
        if m == '01':
            monthly[ym] = ytd[ym]
        elif prev and prev[:4] == y and prev == f'{y}-{int(m) - 1:02d}':
            monthly[ym] = (1 + ytd[ym]) / (1 + ytd[prev]) - 1
        else:
            monthly[ym] = None   # 中間缺月份時無法換算
        prev = ym
    return monthly


def fix_unadjusted_splits(df):
    """Yahoo 的 0050 只把 2025 年的 1 拆 4 套用到 2014 年以後，更早的價格沒有調整(2014-01-02 單日「下跌」75%)。
    單日漲跌剛好接近 1/k 或 k 倍(k = 2～10)且幅度超過 50% 時，視為未調整的分割，把之前的價格一起換算。"""
    df = df.copy()
    ratio = df['Close'] / df['Close'].shift(1)
    for day, r in ratio.items():
        if pd.isna(r) or 0.5 < r < 1.5:
            continue
        k = round(1 / r) if r < 1 else round(r)
        target = 1 / k if r < 1 else k
        if 2 <= k <= 10 and abs(r / target - 1) < 0.08:
            factor = target
            df.loc[df.index < day, ['Close', 'Adj Close']] *= factor
            print(f'修正 {day.date()} 之前未調整的分割(×{factor:.4g})')
    return df


# 常存的 ETF(台股)與 ARKK(美股主題型，研究案例)
ETFS = [
    ('0050', '0050.TW', '元大台灣50', '市值型', 'TWD'),
    ('006208', '006208.TW', '富邦台50', '市值型', 'TWD'),
    ('0056', '0056.TW', '元大高股息', '高股息', 'TWD'),
    ('00878', '00878.TW', '國泰永續高股息', '高股息', 'TWD'),
    ('00713', '00713.TW', '元大台灣高息低波', '高股息', 'TWD'),
    ('00919', '00919.TW', '群益台灣精選高息', '高股息', 'TWD'),
    ('00929', '00929.TW', '復華台灣科技優息', '高股息', 'TWD'),
    ('00918', '00918.TW', '大華優利高填息30', '高股息', 'TWD'),
    ('00939', '00939.TW', '統一台灣高息動能', '高股息', 'TWD'),
    ('00940', '00940.TW', '元大台灣價值高息', '高股息', 'TWD'),
    ('ARKK', 'ARKK', 'ARK Innovation ETF', '主題型(美股)', 'USD'),
]
# 資料庫(2016 年起)之前就上市、要用 Yahoo 補前段的台股 ETF：上市日(Yahoo 會把上市前的募集期也列進來)
LISTED = {'0050': '2003-06-30', '0056': '2007-12-26', '006208': '2012-07-17'}


def download(ticker, **kw):
    """Yahoo 日資料(收盤與還原股價，排除沒有成交的日子)，已修正未調整的分割。"""
    for i in range(4):
        try:
            df = yf.download(ticker, auto_adjust=False, progress=False, threads=False, **kw)
            if not df.empty:
                break
        except Exception as e:  # noqa: BLE001
            print(f'{ticker} 下載失敗({i + 1}/4)：{e!r}', file=sys.stderr)
        time.sleep(5 * (i + 1))
    else:
        raise RuntimeError(f'無法下載 {ticker} 股價')
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df[['Close', 'Adj Close', 'Volume']].dropna()
    # 沒有成交 = 成交量 0 且價格和前後一天相同(上市前募集期的固定價格也是)；
    # Yahoo 2008 年的成交量缺(記為 0)但價格每天在變，那些日子仍視為有成交
    flat = df['Close'].eq(df['Close'].shift(1)) | df['Close'].eq(df['Close'].shift(-1))
    return fix_unadjusted_splits(df[~((df['Volume'] == 0) & flat)][['Close', 'Adj Close']])


def db_close(codes):
    """cm.tw_daily 的收盤價(排除沒有成交的日子)：({代號: DataFrame[Close]}, 資料庫第一天)，已換算成分割後的單位"""
    with pg_connect() as conn, conn.cursor() as cur:
        cur.execute('SELECT min("日期") FROM cm.tw_daily')
        start = pd.Timestamp(cur.fetchone()[0])
        cur.execute('SELECT "股票代號", "日期", "收盤價" FROM cm.tw_daily '
                    'WHERE "股票代號" = ANY(%s) AND "成交量" > 0 AND "收盤價" > 0 ORDER BY 1, 2', (codes,))
        rows = pd.DataFrame(cur.fetchall(), columns=['code', 'date', 'Close'])
    rows['date'] = pd.to_datetime(rows['date'])
    rows['Close'] = rows['Close'].astype(float)
    out = {}
    for code, g in rows.groupby('code'):
        df = g.set_index('date')[['Close']].assign(**{'Adj Close': g['Close'].values})
        print(f'{code}：', end='')
        out[code] = fix_unadjusted_splits(df)[['Close']]
    return out, start


def tw_close(code, ticker, db, db_start):
    """資料庫開始之後用資料庫；之前上市的(LISTED)從上市日到資料庫開始前沿用 Yahoo，並檢查接合處兩邊的價格一致"""
    d = db[code]
    if code not in LISTED:
        return d
    y = download(ticker, start=LISTED[code])[['Close']]
    early = y[(y.index >= LISTED[code]) & (y.index < db_start)]
    both = d.join(y, rsuffix='_y', how='inner').head(20)
    gap = (both['Close'] / both['Close_y'] - 1).abs().median()
    if not gap < 0.005:
        raise RuntimeError(f'{code} 資料庫與 Yahoo 的價格對不上(接合處差 {gap:.2%})')
    print(f'{code}：{early.index[0].date()}～{early.index[-1].date()} 用 Yahoo({len(early)} 天)，之後用資料庫')
    return pd.concat([early, d])


TWT49U = 'https://www.twse.com.tw/rwd/zh/exRight/TWT49U'


def fetch_exdiv(start='20080101'):
    """臺灣證券交易所「除權除息計算結果表」：{代號: [(除息日, 除息前收盤價, 息值)]}。
    Yahoo 的配息資料不完整(例如 0050 只有 2013 年以後，且分割前後單位不一致)，台股 ETF 改用證交所的官方資料。"""
    today = pd.Timestamp.today().strftime('%Y%m%d')
    for i in range(3):
        try:
            r = requests.get(TWT49U, params={'startDate': start, 'endDate': today, 'response': 'json'}, headers=HEADERS, timeout=120)
            r.raise_for_status()
            rows = r.json().get('data') or []
            break
        except Exception as e:  # noqa: BLE001
            print(f'除權息資料下載失敗({i + 1}/3)：{e!r}', file=sys.stderr)
            time.sleep(5 * (i + 1))
    else:
        raise RuntimeError('無法下載證交所除權息資料')
    out = {}
    for row in rows:
        m = re.match(r'(\d+)年(\d+)月(\d+)日', row[0])
        if not m or '息' not in row[6]:
            continue
        day = f'{int(m.group(1)) + 1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
        out.setdefault(row[1].strip(), []).append((day, float(row[3].replace(',', '')), float(row[5].replace(',', ''))))
    return out


def total_return(df, events):
    """用官方除息資料自己算「股利再投入」的還原股價：每個除息日起乘上 除息前收盤 ÷ (除息前收盤 − 息值)。
    比例與價格單位無關，所以不受分割影響。另回傳換算成目前股數單位的每股配息 [(日期, 金額)]。"""
    close = df['Close']
    dates = close.index.strftime('%Y-%m-%d')
    factor, divs = pd.Series(1.0, index=close.index), []
    for day, prev, cash in sorted(events):
        if day <= dates[0] or day > dates[-1] or prev <= cash:
            continue
        pos = dates.searchsorted(day)                   # 除息日(或之後第一個交易日)
        factor.iloc[pos:] *= prev / (prev - cash)
        divs.append((dates[pos], round(cash * float(close.iloc[pos - 1]) / prev, 6)))   # 換成 Yahoo 價格的單位
    return close * factor, divs


def fetch_etfs():
    exdiv = fetch_exdiv()
    db, db_start = db_close([code for code, *_, cur in ETFS if cur == 'TWD'])
    out = {'list': [], 'daily': {}}
    for code, ticker, name, kind, cur in ETFS:
        if cur == 'TWD':
            df = tw_close(code, ticker, db, db_start)
            adj, divs = total_return(df, exdiv.get(code, []))
            print(f'{code} 總報酬 {adj.iloc[-1] / adj.iloc[0] - 1:.1%}(配息 {len(divs)} 次)')
        else:
            df = download(ticker, period='max')
            adj, divs = df['Adj Close'], []
        out['list'].append({'code': code, 'name': name, 'kind': kind, 'currency': cur, 'start': df.index[0].strftime('%Y-%m-%d'),
                            'source': '臺灣證券交易所除權息資料' if cur == 'TWD' else 'Yahoo 還原股價'})
        # d：日期、c：收盤(價格報酬)、a：股利再投入的還原股價(總報酬)、div：每股配息(換算成目前股數單位)
        out['daily'][code] = {'d': df.index.strftime('%Y-%m-%d').tolist(),
                              'c': [round(float(v), 4) for v in df['Close']],
                              'a': [round(float(v), 4) for v in adj],
                              'div': divs}
        print(f'{code} {name}：{len(df)} 天，{df.index[0].date()} 起')
        time.sleep(1)
    return out


def monthly_0050(daily):
    """0050 每月報酬 {'YYYY-MM': (價格報酬, 總報酬)}，用每日收盤與股利再投入還原股價的月底值"""
    df = pd.DataFrame({'c': daily['c'], 'a': daily['a']}, index=pd.to_datetime(daily['d']))
    ret = df.resample('ME').last().dropna().pct_change().dropna()
    ret.index = ret.index.strftime('%Y-%m')
    return {ym: (float(r['c']), float(r['a'])) for ym, r in ret.iterrows()}


def main():
    ytd = fetch_lpf()
    lpf = ytd_to_monthly(ytd)
    first = min(lpf)
    etfs = fetch_etfs()
    etf = monthly_0050(etfs['daily']['0050'])
    months = [m for m in lpf if m in etf and lpf[m] is not None]
    print(f'勞退基金 {len(ytd)} 個月({first}～{max(lpf)})，0050 {len(etf)} 個月，共同 {len(months)} 個月')
    out = dataset_dir(DATASET)
    write_json(out / 'compare.json', {
        'months': months,
        'lpf': [round(lpf[m], 6) for m in months],                 # 勞退基金每月報酬
        'lpf_ytd': [round(ytd[m], 6) for m in months],             # 原始公告：當年度累計收益率
        'etf_price': [round(etf[m][0], 6) for m in months],        # 0050 價格報酬(不含股利)
        'etf_total': [round(etf[m][1], 6) for m in months],        # 0050 總報酬(股利再投入)
    })
    write_json(out / 'etfs.json', etfs)
    write_meta(DATASET, '勞動基金運用局 勞退基金收益率、CMoney(台股 ETF 股價；2016 年以前 Yahoo Finance)、臺灣證券交易所(除息資料)', LPF_URL,
               '週一~五 23:45、週二~六 12:15(台北時間，本機排程；勞退基金每月初公告前兩個月的收益率)', months=len(months))


if __name__ == '__main__':
    main()
