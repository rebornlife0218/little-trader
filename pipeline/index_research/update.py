"""
資料集 index_research：大盤漲跌分析的研究報告 → web/data/index_research/<研究>.json
  nsf.json  國安基金進場：歷次決議前的收盤和各長期均線的乖離、近 20 日跌幅、離一年高點，以及進場後的漲跌

加權指數讀 data 分支的 indices/TAIEX.json(GitHub Actions 每天更新)；歷次進場的日期與時空背景寫在這裡(EVENTS)與報告範本。
報告範本 reports/nsf.md 依 CLAUDE.md「研究報告」的結構，表格由這裡填入，內文的數字是手寫的，國安基金再進場或數字改變時要同步更新。
報告裡的圖片 ![說明](xxx.png) 由網頁依 JSON 重畫(indices/nsf.js)。
不是回測，沒有淨值。不每日更新，研究改版或國安基金有新動作時手動執行：
  python pipeline/run_local.py index_research        (產生、發佈到 data 分支並重新部署)
"""
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import REPO, dataset_dir, write_json, write_meta  # noqa: E402

NAME = 'index_research'
MAS = (60, 120, 240, 480, 1200)          # 季線、半年線、年線、兩年線、五年線
FOUNDED = pd.Timestamp('2000-01-15')     # 國安基金成立(國家金融安定基金設置及管理條例公布)
# 國安基金歷次進場：(決議前最後一個收盤日, 進場日, 名稱, 類型, 護盤結束日)
#   類型：預防 = 政治事件前；跌破均線 = 已經跌破年線一大段；急跌 = 短期急跌
EVENTS = [
    ('2000-03-15', '2000-03-16', '政黨輪替 2000/3', '預防', '2000-03-20'),
    ('2000-10-02', '2000-10-03', '網路泡沫 2000/10', '跌破均線', '2000-11-15'),
    ('2004-05-19', '2004-05-20', '319 後 2004/5', '預防', '2004-06-01'),
    ('2008-09-18', '2008-09-19', '金融海嘯 2008/9', '跌破均線', '2008-12-17'),
    ('2011-12-20', '2011-12-21', '歐債 2011/12', '跌破均線', '2012-04-20'),
    ('2015-08-24', '2015-08-25', '股災 2015/8', '急跌', '2016-04-12'),
    ('2020-03-19', '2020-03-20', '疫情 2020/3', '急跌', '2020-10-12'),
    ('2022-07-12', '2022-07-13', '升息 2022/7', '跌破均線', '2023-04-13'),
    ('2025-04-08', '2025-04-09', '關稅 2025/4', '急跌', '2026-01-12'),
    ('2026-11-06', '2026-11-09', '美股科技股重挫 2026/11', '急跌', None),
]
DECIDE_NOTE = {'2015-08-24': '當天(8/25 上午)決議'}
H = (5, 20, 60, 250)
pct = lambda v, d=1: '—' if v is None or not np.isfinite(v) else f'{v * 100:+.{d}f}%'  # noqa: E731


def taiex():
    url = f'https://raw.githubusercontent.com/{REPO}/data/indices/TAIEX.json'
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    j = r.json()
    f = pd.DataFrame({k: j[k] for k in 'ohlc'}, index=pd.to_datetime(j['d'])).astype(float)
    return f[f.index >= '1990-01-01']


def features(f):
    c = f['c']
    for n in MAS:
        f[f'b{n}'] = c / c.rolling(n).mean() - 1
    f['hi250'] = c / c.rolling(250).max() - 1
    f['r20'] = c / c.shift(20) - 1
    return f


def fwd(f, i, h):
    """進場日(第 i 個交易日)開盤起算，到第 h 個交易日收盤的漲跌"""
    return f['c'].iloc[i + h - 1] / f['o'].iloc[i] - 1 if i + h - 1 < len(f) else np.nan


def head(cols, align):
    return [f"| {' | '.join(cols)} |", '|' + '|'.join(align) + '|']


def nsf():
    f = features(taiex())
    idx, c = f.index, f['c']
    ev = []
    for base, entry, name, kind, end in EVENTS:
        t = idx.get_loc(pd.Timestamp(base))
        x = f.iloc[t]
        e = {'base': base, 'entry': entry, 'name': name, 'type': kind, 'end': end, 'close': float(x['c']),
             'r20': float(x['r20']), 'hi250': float(x['hi250']), **{f'b{n}': float(x[f'b{n}']) for n in MAS}}
        if pd.Timestamp(entry) in idx:
            i = idx.get_loc(pd.Timestamp(entry))
            for h in H:
                e[f'y{h}'] = fwd(f, i, h)
            if i + 249 < len(f):
                w = f['l'].iloc[i:i + 250].to_numpy()
                e['low'] = float(w.min() / f['o'].iloc[i] - 1)
                e['lowDay'] = int(w.argmin()) + 1
        ev.append(e)

    # 一、基準日的位置
    L = head(['次', '事件', '類型', '近 20 日', '離一年高', '季線', '半年線', '年線', '兩年線', '五年線'], ['---:', '---', '---'] + ['---:'] * 7)
    for k, e in enumerate(ev, 1):
        cells = [pct(e[f'b{n}']) for n in MAS]
        if e['type'] != '預防' and e['b240'] > 0:
            cells[2] = f'**{cells[2]}**'      # 救市型裡唯一在年線之上的
        L.append(f"| {k} | {e['name']} | {e['type']} | {pct(e['r20'])} | {pct(e['hi250'])} | " + ' | '.join(cells) + ' |')
    pos = '\n'.join(L)

    # 二、歷史上符合條件的日子：離一年高點 ≤ -20%，且年線乖離 ≤ -17% 或近 20 日 ≤ -15%；同一波 60 個交易日內只算第一天
    base = f.loc['1995':]
    m = ((base['b240'] <= -.17) | (base['r20'] <= -.15)) & (base['hi250'] <= -.20)
    hits, last = [], -10 ** 9
    for d in base.index[m]:
        k = base.index.get_loc(d)
        if k - last >= 60:
            hits.append(d)
            last = k
    mission = [(pd.Timestamp(e['entry']), pd.Timestamp(e['end'] or '2100-01-01'), e) for e in ev]

    def tag(d):
        for a, b, e in mission:
            if a <= d <= b:
                return '護盤期間中'
        for a, b, e in mission:
            bd = pd.Timestamp(e['base'])
            if d <= bd and (bd - d).days <= 30:
                g = idx.get_loc(bd) - idx.get_loc(d)
                return DECIDE_NOTE.get(e['base']) or ('當天決議' if g == 0 else f'{g} 個交易日後決議')
        for a, b, e in mission:
            if e['end'] and 0 < (d - pd.Timestamp(e['end'])).days <= 14:
                end = pd.Timestamp(e['end'])
                return f'沒有進場({end.month}/{end.day} 剛退場)'
        return '沒有進場' if d >= FOUNDED else '(尚未成立)'

    rows = []
    for d in hits:
        i = idx.get_loc(d) + 1
        rows.append({'d': d, 'tag': tag(d), 'x': f.loc[d], 'y60': fwd(f, i, 60), 'y250': fwd(f, i, 250)})
    pre = [r for r in rows if r['d'] < FOUNDED]
    L = head(['日期', '年線', '近 20 日', '離一年高', '國安基金', '之後 60 日', '250 日'], ['---', '---:', '---:', '---:', '---', '---:', '---:'])
    for r in rows:
        if r['d'] < FOUNDED:
            continue
        x = r['x']
        L.append(f"| {r['d']:%Y/%m/%d} | {pct(x['b240'], 0)} | {pct(x['r20'], 0)} | {pct(x['hi250'], 0)} | {r['tag']} | {pct(r['y60'])} | {pct(r['y250'])} |")
    scan = '\n'.join(L)

    # 三、進場後的漲跌：救市型(有 250 日資料的)平均與任意一天
    L = head(['次', '事件', '類型', '5 日', '20 日', '60 日', '250 日', '250 日內最低', '見低在第幾天'], ['---:', '---', '---'] + ['---:'] * 6)
    for k, e in enumerate(ev, 1):
        if 'y5' not in e:
            continue
        L.append(f"| {k} | {e['name']} | {e['type']} | " + ' | '.join(pct(e[f'y{h}']) for h in H) + f" | {pct(e.get('low'))} | {e.get('lowDay', '—')} |")
    done = [e for e in ev if e['type'] != '預防' and np.isfinite(e.get('y250', np.nan))]
    cell = lambda v: f'**{int((v > 0).sum())}/{len(v)}，{pct(v.mean())}**'  # noqa: E731
    L.append(f'| | **救市型 {len(done)} 次** | | ' + ' | '.join(cell(np.array([e[f"y{h}"] for e in done])) for h in H) + ' | | |')
    o, cl = f['o'].to_numpy(), c.to_numpy()
    after = f.index >= '2000-01-01'
    anyday = []
    for h in H:
        y = np.full(len(f), np.nan)
        y[:len(f) - h + 1] = cl[h - 1:] / o[:len(f) - h + 1] - 1
        v = y[after]
        v = v[np.isfinite(v)]
        anyday.append(f'{(v > 0).mean() * 100:.0f}%，{pct(v.mean())}')
    L.append('| | 2000 年以來任意一天 | | ' + ' | '.join(anyday) + ' | | |')
    after_t = '\n'.join(L)

    # 圖：決議前 120 日到之後 250 日(決議前收盤 = 100)
    X = list(range(-120, 251))
    paths = []
    for e in ev:
        t = idx.get_loc(pd.Timestamp(e['base']))
        y = [round(float(c.iloc[t + k] / c.iloc[t] * 100), 2) if 0 <= t + k < len(f) else None for k in X]
        paths.append({'name': e['name'], 'type': e['type'], 'y': y})

    asof = idx[-1]
    md = (HERE / 'reports' / 'nsf.md').read_text(encoding='utf-8')
    md = re.sub(r'^# .*\n+', '', md, count=1)                     # 第一行標題由網頁顯示
    report = md.format_map({'pos': pos, 'scan': scan, 'after': after_t, 'pre': len(pre), 'asof': f'{asof:%Y/%m/%d}'})
    clean = lambda e: {k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in e.items()}  # noqa: E731
    return {'asof': f'{asof:%Y-%m-%d}', 'x': X, 'paths': paths, 'events': [clean(e) for e in ev], 'report': report}


def main():
    out = dataset_dir(NAME)
    B = nsf()
    write_json(out / 'nsf.json', B)
    write_meta(NAME, '加權指數(indices 資料集)', '', '不定期(研究更新時手動執行)', asof=B['asof'])
    print(f"nsf：{len(B['events'])} 次進場，資料到 {B['asof']}")


if __name__ == '__main__':
    main()
