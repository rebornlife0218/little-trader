"""
資料集 tw_strategy：台股低波動策略回測(資料來自本機 PostgreSQL 的 cm schema) → web/data/tw_strategy/
原始版本：rebornlife0218/Trading_Strategy 的 LowVolatility_TW.py(已整合到這裡並從該 repo 刪除，最後版本在 commit cf78ce9)，這裡修正它的偏誤：
  - 前視偏誤：原版用「當天收盤」選股，同一天的報酬就算進組合。這裡在每月最後一個交易日收盤後選股，
    隔一個交易日以開盤價(還原開盤價)進場，持有到下個月第一個交易日開盤換股。
  - 倖存者偏差：原版用「現在」的上市櫃代號清單；cm.tw_daily 含已下市櫃股票，每月只從當時有交易的股票挑選。
  - 不公平的比較基準：原版個股用還原股價(含股息)、大盤用加權指數(不含股息)；這裡改用 0050 的還原股價。
  - 流動性：沒有成交的日子 cm 仍有一筆(價格不變、成交量 0)，這種股票的波動看起來很低，
    原版會優先選到；這裡要求過去半年幾乎每天有成交、成交金額中位數至少 500 萬元。
策略(每月換股、等權重、買進後持有到月底，權重隨股價漂移)：
  lv10   低波動 10 檔：過去 120 個交易日波動最小的 10 檔(原版 README 的說法)
  lv10p  低波動 10%：波動最小的 10%(原版程式實際的作法，約一百多檔)
  ew     全部合格股票等權重(對照組：看低波動本身的效果，扣掉「等權重」的效果)
  b0050  0050 還原股價買進持有
波動 = 過去 120 個交易日的 5 日報酬標準差(原版用 5 日報酬；cm 從 2016 年開始，回看期間從原版的 10 年改為半年)

同一個資料集也產生事件型策略(events.py → margin.json、against.json…)，這裡最後會呼叫它。

只能在本機執行(GitHub Actions 連不到本機資料庫)：
  python pipeline/tw_strategy/update.py
  python pipeline/run_local.py    # 本機資料集一起更新 + 發佈到 data 分支 + 重新部署(Windows 排程呼叫這個)
資料庫連線見 common.pg_connect()。
"""
import io
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, pg_connect, write_json, write_meta  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import events  # noqa: E402

DATASET = 'tw_strategy'
LOOKBACK = 120          # 回看交易日數(約半年)
MIN_TRADED = 0.9        # 回看期間有成交的天數比例下限
MIN_VALUE = 5000        # 回看期間每日成交金額中位數下限(千元) = 500 萬元
TOP_N = 10
TOP_PCT = 0.1
BENCH = '0050'

SQL = '''COPY (
  SELECT "日期", "股票代號", "還原開盤價", "還原收盤價", "成交金額(千)"
  FROM cm.tw_daily
  WHERE "股票代號" ~ '^([1-9][0-9]{3}|0050)$'
) TO STDOUT WITH CSV'''
# 普通股 = 4 碼且不是 0 開頭(0 開頭為 ETF)；名稱與產業取最新一年的基本資料，已下市櫃的用下市櫃資料
SQL_NAMES = '''
  SELECT DISTINCT ON ("股票代號") "股票代號", "股票名稱", "產業指數名稱" FROM cm.tw_company_info
  ORDER BY "股票代號", "年度" DESC'''
SQL_DELISTED = 'SELECT "股票代號", "股票名稱", "產業名稱", "終止日期" FROM cm.tw_delisted_company'


def load():
    with pg_connect() as conn:
        buf = io.BytesIO()
        with conn.cursor().copy(SQL) as cp:
            for chunk in cp:
                buf.write(chunk)
        buf.seek(0)
        df = pd.read_csv(buf, header=None, names=['d', 's', 'o', 'c', 'v'], dtype={'s': str}, parse_dates=['d'])
        names = {s: (n, ind) for s, n, ind in conn.execute(SQL_NAMES).fetchall()}
        for s, n, ind, _ in conn.execute(SQL_DELISTED).fetchall():
            names.setdefault(s, (n, ind))
    C = df.pivot(index='d', columns='s', values='c').sort_index()
    O = df.pivot(index='d', columns='s', values='o').reindex_like(C)
    V = df.pivot(index='d', columns='s', values='v').reindex_like(C)
    return C, O, V, names


def main():
    C, O, V, names = load()
    dates = C.index
    print(f'cm.tw_daily：{dates[0].date()} ~ {dates[-1].date()}，{C.shape[1]} 檔')
    Cf = C.ffill()                         # 停牌、下市後沿用最後收盤(下市 = 以最後價格轉為現金)
    Of = O.combine_first(Cf)               # 沒有開盤價的日子用最後收盤
    traded = (V > 0) & C.notna()
    stocks = [s for s in C.columns if s != BENCH]
    cf, of, tr, val = Cf[stocks].to_numpy(), Of[stocks].to_numpy(), traded[stocks].to_numpy(), V[stocks].fillna(0).to_numpy()

    # 每月最後一個交易日 = 選股日；隔一個交易日開盤進場
    month = dates.to_period('M')
    sig = [i for i in range(len(dates)) if i + 1 < len(dates) and month[i + 1] != month[i] and i + 1 >= LOOKBACK]

    def select(i):
        w = slice(i - LOOKBACK + 1, i + 1)
        ok = tr[i] & (tr[w].mean(axis=0) >= MIN_TRADED) & (np.median(val[w], axis=0) >= MIN_VALUE)
        p = cf[w]
        with np.errstate(invalid='ignore', divide='ignore'):
            r5 = p[5:] / p[:-5] - 1
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)   # 還沒上市或已下市的股票整欄都是缺值
            vol = np.nanstd(r5, axis=0, ddof=1)
        idx = np.where(ok & np.isfinite(vol))[0]
        idx = idx[np.argsort(vol[idx], kind='stable')]
        k = max(TOP_N, round(len(idx) * TOP_PCT))
        return {'lv10': idx[:TOP_N], 'lv10p': idx[:k], 'ew': idx}, vol

    keys = ['lv10', 'lv10p', 'ew']
    nav = {k: np.full(len(dates), np.nan) for k in keys}
    i0 = sig[0]
    for k in keys:
        nav[k][i0] = 1.0
    months, value = [], {k: 1.0 for k in keys}   # value：每期進場時(開盤)的淨值
    prev = {k: None for k in keys}                # 上一期持股與期末(換股日開盤)的漂移後權重
    for j, s in enumerate(sig):
        e = s + 1
        if e >= len(dates):
            break                                 # 最後一個選股日還沒有進場日(資料剛好到月底)
        end = sig[j + 1] + 1 if j + 1 < len(sig) and sig[j + 1] + 1 < len(dates) else len(dates)
        picks, _ = select(s)
        rec = {'m': str(month[e]), 'start': dates[e].strftime('%Y-%m-%d'), 'n': int(len(picks['ew'])), 'turn': {}}
        for k in keys:
            idx = picks[k]
            w_new = pd.Series(1 / len(idx), index=idx)
            if prev[k] is None:
                rec['turn'][k] = 2.0
            else:
                rec['turn'][k] = round(float(w_new.sub(prev[k], fill_value=0).abs().sum()), 4)
            rel = cf[e:end, idx] / of[e, idx]                     # 進場(開盤)後每天收盤的相對價格
            nav[k][e:end] = value[k] * rel.mean(axis=1)
            if end < len(dates):
                drift = of[end, idx] / of[e, idx]                 # 到下次換股日開盤
                value[k] *= drift.mean()
                prev[k] = pd.Series(drift / drift.sum(), index=idx)
        months.append(rec)

    b = Cf[BENCH].to_numpy()
    e0 = i0 + 1
    nb = np.full(len(dates), np.nan)
    nb[i0] = 1.0
    nb[e0:] = b[e0:] / Of[BENCH].iloc[e0]

    # 最新一次選股(最後一個月底；資料若剛好到月底，這就是下個月要進場的持股)
    last = sig[-1]
    picks, vol = select(last)
    ann = np.sqrt(252 / 5)
    w = slice(last - LOOKBACK + 1, last + 1)
    med = np.median(val[w], axis=0)

    def pick_rows(idx):
        return [[stocks[i], *(names.get(stocks[i], ('', ''))), round(float(vol[i] * ann), 4), round(float(med[i] / 1e5), 2)]
                for i in idx]

    d = dates[i0:]
    out = {
        'asof': dates[-1].strftime('%Y-%m-%d'),
        'd': [x.strftime('%Y-%m-%d') for x in d],
        'nav': {**{k: [round(float(x), 6) for x in nav[k][i0:]] for k in keys}, 'b0050': [round(float(x), 6) for x in nb[i0:]]},
        'm': months,
        'picks': {'signal': dates[last].strftime('%Y-%m-%d'), 'entered': last + 1 < len(dates), 'n': int(len(picks['ew'])),
                  'lv10': pick_rows(picks['lv10']), 'lv10p': pick_rows(picks['lv10p'])},
        'params': {'lookback': LOOKBACK, 'min_traded': MIN_TRADED, 'min_value': MIN_VALUE, 'top_n': TOP_N, 'top_pct': TOP_PCT},
    }
    write_json(dataset_dir(DATASET) / 'backtest.json', out)
    write_meta(DATASET, 'PostgreSQL', '',
               '週一~五 23:45、週二~六 12:15(本機排程)', asof=out['asof'])
    for k in [*keys, 'b0050']:
        v = out['nav'][k]
        yrs = (len(v) - 1) / 252
        print(f'{k:6s} 資產 {v[-1]:.2f} 倍，年化 {v[-1] ** (1 / yrs) - 1:+.2%}')
    print(f"{len(months)} 個月，最新選股 {out['picks']['signal']}，合格 {out['picks']['n']} 檔")
    events.main()   # dataset_dir 會清空資料夾，所以在 backtest.json 之後才寫各事件型策略的 JSON


if __name__ == '__main__':
    main()
