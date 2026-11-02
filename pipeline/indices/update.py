"""
資料集 indices：全球 10 大指數 OHLCV，每個指數輸出一個 JSON → web/data/indices/
來源是私有 repo rebornlife0218/Seeking_Alpha 的 CM/國際指數(本機排程每天從 CM「重要國際指數」上傳：年度大表 + 每日檔)。
GitHub Actions 用唯讀 token(secret SEEKING_ALPHA_TOKEN)取得；本機可用環境變數 CM_DIR 指向 Seeking_Alpha 的工作目錄。
加權報酬指數 TAIEX_TR 另外來自證交所(見 twse.py)。
排程：.github/workflows/data-indices.yml；本機手動：python pipeline/indices/update.py
"""
import base64
import glob
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402
from twse import TR_FILE, load_taiex_tr  # noqa: E402

DATASET = 'indices'
REPO_URL = 'https://github.com/rebornlife0218/Seeking_Alpha'
CM_FOLDER = 'CM/國際指數'
SOURCE = '國際指數彙整資料'   # 網頁不顯示資料來源，meta.json 也不寫資料庫名稱

START_DATE = '1991-01-01'
START_BY_INDEX = {'TAIEX': '1996-01-01'}   # 台灣加權的統計從 1996 年開始
MAX_STALE_DAYS = 7     # 最新資料超過這麼多天，代表本機上傳停了：中止更新，讓 workflow 失敗發通知

tickers = {
    # 台灣
    '#TWII': 'TAIEX',      # 成交量單位是張
    # 美國
    '#GSPC': 'SP500',
    '#IXIC': 'NASDAQ',
    # 亞洲
    '#N225': 'NK225',      # 日經 225
    '#KS11': 'KOSPI50',    # 韓國 KOSPI
    '#HSI': 'HSI',         # 香港恆生指數
    '#SSEC': 'SSEC',       # 上海綜合指數 (上證)
    '#STI': 'STI',         # 新加坡海峽指數
    # 歐洲
    '#STOXX50E': 'STOXX50',# 歐洲斯托克 50 指數
    '#FTSE': 'FTSE100'     # 英國富時 100 指數
}
COLS = {'開盤價': 'Open', '最高價': 'High', '最低價': 'Low', '收盤價': 'Close', '成交量': 'Volume'}
target_fields = list(COLS.values())


def checkout():
    """回傳 Seeking_Alpha 工作目錄；只下載 CM/國際指數，token 放在環境變數裡，不會出現在指令或 log"""
    if os.environ.get('CM_DIR'):
        return Path(os.environ['CM_DIR'])
    token = os.environ.get('SEEKING_ALPHA_TOKEN')
    if not token:
        raise RuntimeError('沒有 SEEKING_ALPHA_TOKEN，讀不到 Seeking_Alpha(也可用 CM_DIR 指定本機目錄)')
    auth = base64.b64encode(f'x-access-token:{token}'.encode()).decode()
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_CONFIG_COUNT='1',
               GIT_CONFIG_KEY_0='http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0=f'AUTHORIZATION: basic {auth}')
    root = tempfile.mkdtemp(prefix='seeking_alpha_')
    for args in (['clone', '-q', '--depth=1', '--filter=blob:none', '--sparse', REPO_URL, root],
                 ['-C', root, 'sparse-checkout', 'set', '--no-cone', f'/{CM_FOLDER}/']):
        r = subprocess.run(['git', *args], env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode:
            raise RuntimeError(f'git {args[0]} 失敗：{r.stderr.strip()}')
    return Path(root)


def read_files(files):
    columns = ['日期', '代號', *COLS]
    frames = [pd.read_parquet(f, columns=columns, filters=[('代號', 'in', list(tickers))]) for f in files]
    frames = [f for f in frames if len(f)]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=columns)


def load_cm(root):
    """年度大表接上每日檔；同一天兩邊都有時以每日檔為準(GitHub 上的年度大表不會每日更新)"""
    daily_dir = root / CM_FOLDER / 'Daily'
    panel = read_files(sorted(glob.glob(str(daily_dir / 'INTL_panel_*.parquet'))))
    daily = read_files(sorted(glob.glob(str(daily_dir / 'daily' / '*' / '*.parquet'))))
    if panel.empty:
        raise RuntimeError(f'{CM_FOLDER} 沒有年度大表')
    if not daily.empty:
        panel = panel[~panel['日期'].isin(daily['日期'].unique())]
    df = pd.concat([panel, daily], ignore_index=True) if not daily.empty else panel
    last = df['日期'].max()
    if datetime.now() - last > timedelta(days=MAX_STALE_DAYS):
        raise RuntimeError(f'{CM_FOLDER} 最新資料只到 {last:%Y-%m-%d}，本機上傳可能停了')
    return df.sort_values(['代號', '日期'])


def main():
    data = load_cm(checkout())

    # 加權報酬指數要在清空輸出資料夾前讀回快取
    taiex_tr = load_taiex_tr()

    out_dir = dataset_dir(DATASET)

    # 每個指數各存一個精簡 JSON(欄位式陣列)，網頁只需載入正在看的指數
    index_meta = {}
    for code, name in tickers.items():
        g = data[data['代號'] == code]
        df = g.rename(columns=COLS).set_index(g['日期'].dt.strftime('%Y-%m-%d'))[target_fields]
        df = df[df.index >= START_BY_INDEX.get(name, START_DATE)]
        # 休市或缺值的日子(任一價格 <= 0 或缺值)直接剔除
        df = df[(df[['Open', 'High', 'Low', 'Close']] > 0).all(axis=1)]
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
                            'source': SOURCE, 'volume': '成交量(張)' if name == 'TAIEX' else '成交量'}

    # 加權報酬指數(含股息)：不列入 indices(指數頁不顯示)，給 ETF大禮包的長期回測使用
    extra = {}
    if len(taiex_tr) >= 250:
        tr_days = sorted(taiex_tr)
        write_json(out_dir / TR_FILE, {'d': tr_days, 'c': [round(taiex_tr[d], 2) for d in tr_days]})
        extra['TAIEX_TR'] = {'rows': len(tr_days), 'first': tr_days[0], 'last': tr_days[-1], 'source': '臺灣證券交易所 發行量加權股價報酬指數'}
    meta = write_meta(DATASET, SOURCE, '', '週二~六 11:00、週一~五 18:30', indices=index_meta, extra=extra)
    print(f"已更新 {len(index_meta)} 個指數，更新時間 {meta['updated_at']}")
    for k, m in index_meta.items():
        print(f"  {k:8s} {m['rows']:5d} 筆  {m['first']} ~ {m['last']}")


if __name__ == '__main__':
    main()
