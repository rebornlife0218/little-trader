"""
下載全球 10 大指數 OHLCV (yfinance)，每個指數輸出一個 JSON 給網頁讀取，並記錄更新時間。
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
    dates = pd.to_datetime(data.index).strftime('%Y-%m-%d')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('*'):  # 清掉舊檔(含過去的整合 CSV)
        if old.is_file():
            old.unlink()

    # 每個指數各存一個精簡 JSON(欄位式陣列)，網頁只需載入正在看的指數
    index_meta = {}
    for name in tickers.values():
        df = pd.DataFrame({f: data[f][name].values for f in target_fields}, index=dates)
        # 休市或缺值的日子(任一價格 <= 0 或缺值)直接剔除
        ok = (df[['Open', 'High', 'Low', 'Close']] > 0).all(axis=1)
        df = df[ok]
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
        (OUT_DIR / f'{name}.json').write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
        index_meta[name] = {'rows': len(df), 'first': df.index[0], 'last': df.index[-1],
                            'has_volume': bool((df['Volume'] > 0).any())}

    tw_now = datetime.now(timezone(timedelta(hours=8)))
    META_PATH.write_text(json.dumps({
        'updated_at': tw_now.strftime('%Y-%m-%d %H:%M'),
        'version': tw_now.strftime('%Y%m%d%H%M'),
        'timezone': 'Asia/Taipei',
        'indices': index_meta,
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f'已更新 {len(index_meta)} 個指數，更新時間 {tw_now:%Y-%m-%d %H:%M}')
    for k, m in index_meta.items():
        print(f"  {k:8s} {m['rows']:5d} 筆  {m['first']} ~ {m['last']}")


if __name__ == '__main__':
    main()
