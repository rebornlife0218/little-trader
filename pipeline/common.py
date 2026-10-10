"""
各資料集共用工具：輸出資料夾、meta.json(更新時間、資料來源、排程)、讀回上一次發佈的檔案。

每個資料集 = web/data/<名稱>/ 一個資料夾(本機預覽用，不進 git；正式資料發佈在 data 分支)，
裡面一定有 meta.json，網頁靠它顯示「資料來源 / 更新時間 / 更新排程」，
並用 version 讓瀏覽器快取在資料更新後失效。
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent     # repo 根目錄
DATA = ROOT / 'web' / 'data'                      # 資料輸出位置(網站的 data/)
TW = timezone(timedelta(hours=8))
REPO = os.environ.get('GITHUB_REPOSITORY', 'rebornlife0218/little-trader')


def load_published(name: str, file: str, default=None):
    """讀回上一次發佈的 data/<name>/<file>：先找本機 web/data/，再找 data 分支。
    用來做增量更新(GitHub Actions 每次都是全新環境，data 分支就是快取)。"""
    p = DATA / name / file
    if p.exists():
        return json.loads(p.read_text(encoding='utf-8'))
    url = f'https://raw.githubusercontent.com/{REPO}/data/{name}/{file}'
    try:
        r = requests.get(url, timeout=30)
        if r.ok:
            return r.json()
    except Exception as e:  # noqa: BLE001
        print(f'讀取 data 分支的 {name}/{file} 失敗：{e!r}', file=sys.stderr)
    return default


def dataset_dir(name: str, clean: bool = True) -> Path:
    """回傳 web/data/<name>/，clean=True 時先清空舊檔。"""
    d = DATA / name
    d.mkdir(parents=True, exist_ok=True)
    if clean:
        for f in d.glob('*'):
            if f.is_file():
                f.unlink()
    return d


def write_json(path: Path, obj, compact: bool = True):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':') if compact else None,
                               indent=None if compact else 2), encoding='utf-8')


def write_meta(name: str, source_name: str, source_url: str, schedule: str, **extra):
    """寫入 web/data/<name>/meta.json。"""
    now = datetime.now(TW)
    meta = {
        'dataset': name,
        'updated_at': now.strftime('%Y-%m-%d %H:%M'),
        'version': now.strftime('%Y%m%d%H%M'),
        'timezone': 'Asia/Taipei',
        'source': {'name': source_name, 'url': source_url},
        'schedule': schedule,
        **extra,
    }
    write_json(DATA / name / 'meta.json', meta, compact=False)
    return meta
