"""
資料集 index_research：大盤漲跌分析的研究報告 → web/data/index_research/<研究>.json
  nsf.json  國安基金進場與限空令：歷次決議前的收盤和各長期均線的乖離、近 20 日跌幅、離一年高點，進場後的漲跌，以及歷次限空令生效前後的走勢
  margin.json  大跌反彈和融資的關係：報告 reports/大跌反彈和融資的關係.md(全部手寫，研究數字改變時要同步更新)，圖的資料讀本機研究資料夾
            (預設 ~/Desktop/ETF_PANEL/CLAUDE/其他策略/大跌反彈訊號/市值融資，環境變數 MARGIN_DIR 可改)的每日融資與訊號明細；
            GitHub Actions 讀不到這個資料夾，沿用上一次發佈的 margin.json

加權指數讀 data 分支的 indices/TAIEX.json(GitHub Actions 每天更新)；歷次進場的日期與時空背景寫在這裡(EVENTS)與報告範本。
報告範本 reports/國安基金進場與限空令.md 依 CLAUDE.md「研究報告」的結構，表格由這裡填入，內文的數字與限空令的措施內容是手寫的，國安基金再進場、金管會再發布限空令或數字改變時要同步更新。
報告裡的圖片 ![說明](<報告>/xxx.png) 由網頁依 JSON 重畫(indices/nsf.js、margin.js；md 預覽用的 PNG：scripts/md-figs.py)。
不是回測，沒有淨值。GitHub Actions 週一~五 19:30(indices 更新之後)自動重算表格與走勢圖；研究改版或國安基金、限空令有新動作時，內文的數字要手動核對，再執行：
  python pipeline/run_local.py index_research        (產生、發佈到 data 分支並重新部署)
"""
import os
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import REPO, dataset_dir, load_published, write_json, write_meta  # noqa: E402

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
    ('2015-08-24', '2015-08-25', '股災與人民幣貶 2015/8', '急跌', '2016-04-12'),
    ('2020-03-19', '2020-03-20', '疫情 2020/3', '急跌', '2020-10-12'),
    ('2022-07-12', '2022-07-13', '升息 2022/7', '跌破均線', '2023-04-13'),
    ('2025-04-08', '2025-04-09', '關稅 2025/4', '急跌', '2026-01-12'),
    ('2026-11-06', '2026-11-09', '美股科技股重挫 2026/11', '急跌', None),
]
DECIDE_NOTE = {'2015-08-24': '當天(8/25 上午)決議'}
# 金管會限空令：(生效前最後一個收盤日, 生效第一個交易日, 名稱)；措施內容與日期在報告範本
SHORTS = [
    ('2008-09-19', '2008-09-22', '金融海嘯 2008/9'),
    ('2015-08-21', '2015-08-24', '股災與人民幣貶 2015/8'),
    ('2020-03-18', '2020-03-19', '疫情 2020/3'),
    ('2022-09-30', '2022-10-03', '升息 2022/10'),
    ('2025-04-02', '2025-04-07', '關稅 2025/4'),
    ('2026-11-06', '2026-11-09', '2026/11'),
]
W = 200                                 # 進場後最多看幾個交易日
H = (5, 20, 60, W)
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


def shorts(f):
    """限空令：生效前最後一個收盤的位置，以及生效當天和之後的走勢(報酬從生效第一天開盤算起)"""
    idx, c = f.index, f['c']
    L = head(['事件', '近 20 日', '離一年高', '年線', '生效當天', '當天盤中最低', '5 日', '20 日', '60 日', f'{W} 日', '最低收盤', '最低收盤在第幾天'], ['---'] + ['---:'] * 11)
    for base, eff, name in SHORTS:
        t = idx.get_loc(pd.Timestamp(base))
        x = f.iloc[t]
        cells = [pct(x['r20']), pct(x['hi250']), pct(x['b240'])]
        if pd.Timestamp(eff) in idx:
            i = idx.get_loc(pd.Timestamp(eff))
            w = c.iloc[i:i + 60].to_numpy()
            cells += [pct(c.iloc[i] / c.iloc[i - 1] - 1), pct(f['l'].iloc[i] / c.iloc[i - 1] - 1)]
            cells += [pct(fwd(f, i, h)) for h in (5, 20, 60, W)]
            cells += [pct(w.min() / c.iloc[i - 1] - 1), str(int(w.argmin()) + 1)]
        else:
            cells += ['—'] * 8
        L.append(f'| {name} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(L)


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
            if i + W - 1 < len(f):
                w = f['l'].iloc[i:i + W].to_numpy()
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
        rows.append({'d': d, 'tag': tag(d), 'x': f.loc[d], 'y60': fwd(f, i, 60), 'yw': fwd(f, i, W)})
    pre = [r for r in rows if r['d'] < FOUNDED]
    L = head(['日期', '年線', '近 20 日', '離一年高', '國安基金', '之後 60 日', f'{W} 日'], ['---', '---:', '---:', '---:', '---', '---:', '---:'])
    for r in rows:
        if r['d'] < FOUNDED:
            continue
        x = r['x']
        L.append(f"| {r['d']:%Y/%m/%d} | {pct(x['b240'], 0)} | {pct(x['r20'], 0)} | {pct(x['hi250'], 0)} | {r['tag']} | {pct(r['y60'])} | {pct(r['yw'])} |")
    scan = '\n'.join(L)

    # 三、進場後的漲跌：救市型(有 200 日資料的)平均與任意一天
    L = head(['次', '事件', '類型', '5 日', '20 日', '60 日', f'{W} 日', f'{W} 日內最低', '見低在第幾天'], ['---:', '---', '---'] + ['---:'] * 6)
    for k, e in enumerate(ev, 1):
        if 'y5' not in e:
            continue
        L.append(f"| {k} | {e['name']} | {e['type']} | " + ' | '.join(pct(e[f'y{h}']) for h in H) + f" | {pct(e.get('low'))} | {e.get('lowDay', '—')} |")
    done = [e for e in ev if e['type'] != '預防' and np.isfinite(e.get(f'y{W}', np.nan))]
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

    # 圖：決議前 120 日到之後 200 日(決議前收盤 = 100)
    X = list(range(-120, W + 1))
    paths = []
    for e in ev:
        t = idx.get_loc(pd.Timestamp(e['base']))
        y = [round(float(c.iloc[t + k] / c.iloc[t] * 100), 2) if 0 <= t + k < len(f) else None for k in X]
        paths.append({'name': e['name'], 'type': e['type'], 'y': y})

    asof = idx[-1]
    md = (HERE / 'reports' / '國安基金進場與限空令.md').read_text(encoding='utf-8')
    md = re.sub(r'^# .*\n+', '', md, count=1)                     # 第一行標題由網頁顯示
    report = md.format_map({'pos': pos, 'scan': scan, 'after': after_t, 'short': shorts(f), 'pre': len(pre), 'asof': f'{asof:%Y/%m/%d}'})
    clean = lambda e: {k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in e.items()}  # noqa: E731
    return {'asof': f'{asof:%Y-%m-%d}', 'x': X, 'paths': paths, 'events': [clean(e) for e in ev], 'report': report}


MARGIN_DIR = Path(os.environ.get('MARGIN_DIR', Path.home() / 'Desktop/ETF_PANEL/CLAUDE/其他策略/大跌反彈訊號/市值融資'))


def margin_report():
    """大跌反彈和融資的關係的報告：reports/大跌反彈和融資的關係.md 去掉第一行標題"""
    md = (HERE / 'reports' / '大跌反彈和融資的關係.md').read_text(encoding='utf-8')
    return re.sub(r'^# .*\n+', '', md, count=1)


def margin():
    """大跌反彈和融資的關係：報告與三張圖(重點、訊號總覽、訊號後走勢)的資料；本機研究資料夾不在時回傳 None"""
    if not (MARGIN_DIR / '每日市值與融資.csv').exists():
        return None
    f = pd.read_csv(MARGIN_DIR / '每日市值與融資.csv', dtype={'d': str}).set_index('d')
    ev = pd.read_csv(MARGIN_DIR / '檢驗' / '定案明細.csv', dtype={'d': str})
    g = pd.read_csv(MARGIN_DIR / '檢驗' / '定案分組.csv').set_index('分組')
    r = f['amt'].pct_change(fill_method=None)
    b = r.shift(1).rolling(120, min_periods=120)
    za = -(r - b.mean()) / b.std()                         # 單日融資金額 z：基準是過去 120 日的變化率，算到昨天
    keep = f.index >= '20020101'
    ymd = lambda d: f'{d[:4]}-{d[4:6]}-{d[6:]}'  # noqa: E731
    r2 = lambda v: None if not np.isfinite(v) else round(float(v), 2)  # noqa: E731
    # 訊號後走勢：隔天開盤買進，到第 k 個交易日收盤
    pos = {d: i for i, d in enumerate(f.index)}
    c, o = f['c'].to_numpy(), f['o'].to_numpy()
    K = 60
    M = np.array([[c[pos[d] + k] / o[pos[d] + 1] - 1 if pos[d] + k < len(c) else np.nan for k in range(1, K + 1)] for d in ev['d']]) * 100
    st = int(np.flatnonzero(keep)[0])
    base = [np.nanmean(c[st + k:] / o[st + 1:len(c) - k + 1] - 1) * 100 for k in range(1, K + 1)]   # 任意一天：同樣隔天開盤買進
    return {
        'asof': ymd(f.index[-1]),
        'key': {k: {'n': int(g.at[k, '次數']) if k in g.index and np.isfinite(g.at[k, '次數']) else None,
                    **{f'u{h}': r2(g.at[k, f'{h}上']) for h in (5, 20, 60)}, **{f'm{h}': r2(g.at[k, f'{h}均']) for h in (5, 20, 60)}}
                for k in ('全部', '任意一天')},
        'd': [ymd(d) for d in f.index[keep]], 'c': [round(float(v)) for v in f['c'][keep]], 'z': [r2(v) for v in za[keep].clip(lower=-8)],
        'sig': [{'d': ymd(d), 'c': round(float(v))} for d, v in zip(ev['d'], ev['c'])],
        'last': ymd(ev['d'].iloc[-1]),
        'path': {'x': list(range(1, K + 1)), 'mean': [r2(v) for v in np.nanmean(M, 0)], 'p25': [r2(v) for v in np.nanpercentile(M, 25, 0)],
                 'p75': [r2(v) for v in np.nanpercentile(M, 75, 0)], 'base': [r2(v) for v in base]},
        'report': margin_report(),
    }


def main():
    prev = load_published(NAME, 'margin.json')          # 先讀回上一次的檔(dataset_dir 會清空本機資料夾)
    out = dataset_dir(NAME)
    B = nsf()
    write_json(out / 'nsf.json', B)
    m = margin() or prev
    if m:
        m['report'] = margin_report()                   # 沿用上一次的圖表資料時，報告文字仍用 repo 裡最新的 大跌反彈和融資的關係.md
        write_json(out / 'margin.json', m)
        print(f"margin：{len(m['sig'])} 次訊號，資料到 {m['asof']}")
    else:
        print('margin：找不到本機研究資料夾，也沒有上一次發佈的 margin.json', file=sys.stderr)
    write_meta(NAME, '加權指數(indices 資料集)', '', '週一~五 19:30(加權指數更新之後)', asof=B['asof'])
    print(f"nsf：{len(B['events'])} 次進場，資料到 {B['asof']}")


if __name__ == '__main__':
    main()
