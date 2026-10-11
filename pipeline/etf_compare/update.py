"""
資料集 etf_compare：「怎麼存 ETF」用的資料 → web/data/etf_compare/
  compare.json：0050 與勞退基金(新制)的每月報酬
  etfs.json：常存 ETF(與 ARKK)的每日價格與還原股價，供績效比較、單筆 vs 定期定額回測
  - 勞退基金：勞動基金運用局公告的「最近月份收益率」(當年度截至該月的累計收益率，每年 1 月重新起算)
    換成每月報酬：1 月 = 當月數字；其他月 = (1 + 本月累計) ÷ (1 + 上月累計) − 1
  - 0050：Yahoo Finance 月底收盤(價格報酬)與還原股價(Adj Close，股利再投入的總報酬)
排程：.github/workflows/data-etf_compare.yml；本機手動：python pipeline/etf_compare/update.py
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
from common import dataset_dir, write_json, write_meta  # noqa: E402

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
    ('ARKK', 'ARKK', 'ARK Innovation ETF', '主題型(美股)', 'USD'),
]


def download(ticker, **kw):
    """Yahoo 日資料(收盤與還原股價)，已修正未調整的分割。"""
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
    return fix_unadjusted_splits(df[['Close', 'Adj Close']].dropna())


def fetch_etfs():
    out = {'list': [], 'daily': {}}
    for code, ticker, name, kind, cur in ETFS:
        df = download(ticker, period='max')
        out['list'].append({'code': code, 'name': name, 'kind': kind, 'currency': cur, 'start': df.index[0].strftime('%Y-%m-%d')})
        # d：日期、c：收盤(價格報酬)、a：還原股價(股利再投入的總報酬)
        out['daily'][code] = {'d': df.index.strftime('%Y-%m-%d').tolist(),
                              'c': [round(float(v), 4) for v in df['Close']],
                              'a': [round(float(v), 4) for v in df['Adj Close']]}
        print(f'{code} {name}：{len(df)} 天，{df.index[0].date()} 起')
        time.sleep(1)
    return out


def fetch_0050(start):
    df = download('0050.TW', start=start)
    me = df.resample('ME').last().dropna()
    ret = me.pct_change().dropna()
    ret.index = ret.index.strftime('%Y-%m')
    return {ym: (float(r['Close']), float(r['Adj Close'])) for ym, r in ret.iterrows()}


def main():
    ytd = fetch_lpf()
    lpf = ytd_to_monthly(ytd)
    first = min(lpf)
    etf = fetch_0050(f'{int(first[:4]) - 1}-12-01')
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
    write_json(out / 'etfs.json', fetch_etfs())
    write_meta(DATASET, '勞動基金運用局 勞退基金收益率、Yahoo Finance(ETF 股價)', LPF_URL,
               '每天 09:00(台北時間；勞退基金每月初公告前兩個月的收益率)', months=len(months))


if __name__ == '__main__':
    main()
