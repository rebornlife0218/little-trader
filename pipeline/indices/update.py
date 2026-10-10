"""
資料集 indices：全球 10 大指數 OHLCV (yfinance)，每個指數輸出一個 JSON → web/data/indices/
台灣加權(TAIEX)的開高低收量全部改用證交所資料(見 twse.py)
排程：.github/workflows/data-indices.yml；本機手動：python pipeline/indices/update.py
"""
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402
from twse import load_taiex  # noqa: E402

DATASET = 'indices'

START_DATE = '1991-01-01'

tickers = {
    # 美國
    '^GSPC': 'SP500',
    '^IXIC': 'NASDAQ',
    # 亞洲
    '^N225': 'NK225',      # 日經 225
    '^KS11': 'KOSPI50',    # 韓國 KOSPI
    '^HSI': 'HSI',         # 香港恆生指數
    '000001.SS': 'SSEC',   # 上海綜合指數 (上證)
    '^STI': 'STI',         # 新加坡海峽指數
    # 歐洲
    '^STOXX50E': 'STOXX50',# 歐洲斯托克 50 指數
    '^FTSE': 'FTSE100'     # 英國富時 100 指數
}
target_fields = ['Open', 'High', 'Low', 'Close', 'Volume']


def download(retries=4):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            data = yf.download(list(tickers), start=START_DATE, end=None,
                               auto_adjust=True, progress=False, threads=False)
            if data is not None and not data.empty:
                missing = [t for t in tickers if data['Close'][t].dropna().empty]
                if not missing:
                    return data
                last_err = f'缺少資料: {missing}'
            else:
                last_err = '下載結果為空'
        except Exception as e:  # 網路錯誤 / 被限流
            last_err = repr(e)
        print(f'第 {attempt} 次下載失敗：{last_err}', file=sys.stderr)
        time.sleep(30 * attempt)
    raise RuntimeError(f'下載失敗：{last_err}')


def main():
    data = download()[target_fields]
    data = data.rename(columns=tickers, level=1)
    dates = pd.to_datetime(data.index).strftime('%Y-%m-%d')

    # 台灣加權改用證交所資料(要在清空輸出資料夾前讀回快取)
    taiex = load_taiex()

    out_dir = dataset_dir(DATASET)

    # 每個指數各存一個精簡 JSON(欄位式陣列)，網頁只需載入正在看的指數
    index_meta = {}
    frames = {name: pd.DataFrame({f: data[f][name].values for f in target_fields}, index=dates)
              for name in tickers.values()}
    days = sorted(taiex)
    frames['TAIEX'] = pd.DataFrame([taiex[d] for d in days], index=days, columns=target_fields)
    for name, df in frames.items():
        # 休市或缺值的日子(任一價格 <= 0 或缺值)直接剔除
        ok = (df[['Open', 'High', 'Low', 'Close']] > 0).all(axis=1)
        df = df[ok]
        if name == 'TAIEX' and len(df) < 250:
            # 證交所連不上又沒有快取時，先跳過台灣加權，不影響其他指數更新
            print(f'台灣加權資料不足({len(df)} 筆)，本次略過', file=sys.stderr)
            continue
        if len(df) < 250:
            raise RuntimeError(f'{name} 資料筆數異常偏少({len(df)})，中止更新')
        payload = {
            'd': list(df.index),
            'o': df['Open'].round(2).tolist(),
            'h': df['High'].round(2).tolist(),
            'l': df['Low'].round(2).tolist(),
            'c': df['Close'].round(2).tolist(),
            'v': df['Volume'].fillna(0).round(0).astype('int64').tolist(),
        }
        write_json(out_dir / f'{name}.json', payload)
        index_meta[name] = {'rows': len(df), 'first': df.index[0], 'last': df.index[-1],
                            'has_volume': bool((df['Volume'] > 0).any()),
                            'source': '臺灣證券交易所' if name == 'TAIEX' else 'Yahoo Finance',
                            'volume': '成交金額(元)' if name == 'TAIEX' else '成交量'}

    meta = write_meta(DATASET, 'Yahoo Finance、臺灣證券交易所(台灣加權)', 'https://finance.yahoo.com/',
                      '每個工作日 05:30、15:30', indices=index_meta)
    print(f"已更新 {len(index_meta)} 個指數，更新時間 {meta['updated_at']}")
    for k, m in index_meta.items():
        print(f"  {k:8s} {m['rows']:5d} 筆  {m['first']} ~ {m['last']}")


if __name__ == '__main__':
    main()
