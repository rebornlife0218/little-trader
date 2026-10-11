"""
資料集 earnings：美股財報行事曆(上週、本週、下週) → web/data/earnings/
  - 來源：Nasdaq Earnings Calendar API(每天一次請求)
  - 已公布的公司有實際 EPS 與驚喜幅度(% Surprise)；未公布的有市場預估 EPS
  - 日期以美東時間計算；盤前 BMO = 開盤(美東 9:30)前公布，盤後 AMC = 收盤(16:00)後公布
排程：.github/workflows/data-earnings.yml；本機手動：python pipeline/earnings/update.py
"""
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

DATASET = 'earnings'
API = 'https://api.nasdaq.com/api/calendar/earnings'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
           'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
NY = ZoneInfo('America/New_York')
TIME = {'time-pre-market': 'bmo', 'time-after-hours': 'amc'}


def money(s):
    """'$1,234.5' / '($0.12)' / 'N/A' → float 或 None"""
    if s is None:
        return None
    s = str(s).strip().replace('$', '').replace(',', '')
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()')
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def fetch_day(d, retries=3):
    for i in range(retries):
        try:
            r = requests.get(API, params={'date': d.isoformat()}, headers=HEADERS, timeout=30)
            r.raise_for_status()
            data = (r.json() or {}).get('data') or {}
            return data.get('rows') or []
        except Exception as e:  # noqa: BLE001
            print(f'{d} 下載失敗({i + 1}/{retries})：{e!r}', file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(f'無法下載 {d} 的財報行事曆')


def clean(row):
    cap = money(row.get('marketCap'))
    return {
        's': row.get('symbol', '').strip(),
        'n': (row.get('name') or '').strip(),
        't': TIME.get(row.get('time'), 'na'),
        'cap': int(cap) if cap else None,
        'q': row.get('fiscalQuarterEnding') or '',
        'est': money(row.get('epsForecast')),
        'nest': int(row['noOfEsts']) if str(row.get('noOfEsts', '')).isdigit() else None,
        'eps': money(row.get('eps')),
        'sur': money(row.get('surprise')),
        'ly': money(row.get('lastYearEPS')),
    }


def main():
    today = datetime.now(NY).date()
    monday = today - timedelta(days=today.weekday())
    if today.weekday() >= 5:   # 週末時「本週」指即將到來的一週
        monday += timedelta(days=7)
    weeks = {k: [(monday + timedelta(days=7 * off + i)).isoformat() for i in range(5)]
             for k, off in (('prev', -1), ('this', 0), ('next', 1))}
    days = {}
    for d in weeks['prev'] + weeks['this'] + weeks['next']:
        rows = [clean(r) for r in fetch_day(datetime.fromisoformat(d).date())]
        days[d] = sorted([r for r in rows if r['s']], key=lambda r: -(r['cap'] or 0))
        print(f'{d}：{len(days[d])} 家')
        time.sleep(1)
    out = dataset_dir(DATASET)
    write_json(out / 'earnings.json', {'today': today.isoformat(), 'weeks': weeks, 'days': days})
    write_meta(DATASET, 'Nasdaq Earnings Calendar', 'https://www.nasdaq.com/market-activity/earnings',
               '每天 07:30、20:00(台北時間)', companies=sum(len(v) for v in days.values()),
               updated_utc=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ'))


if __name__ == '__main__':
    main()
