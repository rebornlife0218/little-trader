"""
下載全球 10 大指數 OHLCV (yfinance)，輸出給網頁讀取的 CSV 與更新時間。
由 GitHub Actions 排程執行，也可在本機手動執行：python scripts/update_data.py
"""
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

START_DATE = '1991-01-01'
OUT_DIR = Path(__file__).resolve().parent.parent / 'data'
CSV_PATH = OUT_DIR / 'global_indices_ohlcv.csv'
META_PATH = OUT_DIR / 'meta.json'

tickers = {
    # 美國
    '^GSPC': 'SP500',
    '^IXIC': 'NASDAQ',
    # 亞洲
    '^TWII': 'TAIEX',      # 台灣加權
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
    data.columns = [f'{ticker}_{field}' for field, ticker in data.columns]

    df_all = data.reset_index()
    df_all['Date'] = pd.to_datetime(df_all['Date']).dt.strftime('%Y-%m-%d')

    # 沒抓到資料或休市日以 0 填補(網頁端會把 0 視為無交易日略過)
    data_cols = [c for c in df_all.columns if c != 'Date']
    df_all[data_cols] = df_all[data_cols].fillna(0).astype('float64')
    # 價格取到小數 2 位、成交量取整數，縮小檔案
    for c in data_cols:
        df_all[c] = df_all[c].round(0 if c.endswith('_Volume') else 2)

    if len(df_all) < 5000:
        raise RuntimeError(f'資料筆數異常偏少({len(df_all)})，中止更新')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df_all.to_csv(CSV_PATH, index=False)

    tw_now = datetime.now(timezone(timedelta(hours=8)))
    last_dates = {}
    for name in tickers.values():
        traded = df_all.loc[df_all[f'{name}_Close'] > 0, 'Date']
        last_dates[name] = traded.iloc[-1] if len(traded) else None
    META_PATH.write_text(json.dumps({
        'updated_at': tw_now.strftime('%Y-%m-%d %H:%M'),
        'timezone': 'Asia/Taipei',
        'rows': len(df_all),
        'last_trade_date': last_dates,
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f'已儲存 {CSV_PATH} ({len(df_all)} 筆)，更新時間 {tw_now:%Y-%m-%d %H:%M}')
    print(json.dumps(last_dates, ensure_ascii=False))


if __name__ == '__main__':
    main()
