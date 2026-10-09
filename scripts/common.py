"""
各資料集共用工具：輸出資料夾、meta.json(更新時間、資料來源、排程)。

每個資料集 = data/<名稱>/ 一個資料夾，裡面一定有 meta.json，網頁靠它顯示
「資料來源 / 更新時間 / 更新排程」，並用 version 讓瀏覽器快取在資料更新後失效。
"""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TW = timezone(timedelta(hours=8))


def dataset_dir(name: str, clean: bool = True) -> Path:
    """回傳 data/<name>/，clean=True 時先清空舊檔。"""
    d = ROOT / 'data' / name
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
    """寫入 data/<name>/meta.json。"""
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
    write_json(ROOT / 'data' / name / 'meta.json', meta, compact=False)
    return meta
