"""
資料集 tw_gap：台股其他研究「跳空與隔夜報酬」 → web/data/tw_gap/gap.json

研究本身在本機的研究資料夾計算(台股日資料，還原價；跳空倍數 = 跳空 ÷ 20 日日報酬標準差)，
這裡只把研究輸出的統計表(output/*.csv、events.parquet)轉成網頁用的 JSON；不發佈 csv、png 與原始股價。
報告範本 reports/gap.md 依 CLAUDE.md「研究報告」的結構重新編排，表格由這裡依 csv 填入，內文的數字是手寫的，研究數字改變時要同步更新。
報告裡的圖片 ![說明](xxx.png) 由網頁依 JSON 重畫(tw-research.js 的 gap)。
不是回測，沒有淨值。研究結果不每日更新，研究改版後手動執行：
  python pipeline/run_local.py tw_gap        (轉檔、發佈到 data 分支並重新部署)
另外成一個資料集(不放 tw_research)：tw_research 由另一台電腦每天發佈整個資料夾，放在裡面會被覆蓋。
研究資料夾預設為 ~/Desktop/ETF_PANEL/CLAUDE/其他策略/跳空隔夜報酬，可用環境變數 GAP_DIR 指定。
"""
import os
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

NAME = 'tw_gap'
SRC = Path(os.environ.get('GAP_DIR', Path.home() / 'Desktop' / 'ETF_PANEL' / 'CLAUDE' / '其他策略' / '跳空隔夜報酬'))
MIN_N = 30          # 不到 30 筆的組不列、不畫
VOLS = ['量縮', '中等', '爆量']


def read(name, idx=0):
    return pd.read_csv(SRC / 'output' / f'{name}.csv', index_col=idx, encoding='utf-8-sig')


def rnd(v, nd=5):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def arr(values, nd=5):
    return [rnd(v, nd) for v in values]


# ---------- 報告的表格 ----------
pct = lambda v, d=2: '—' if pd.isna(v) else f'{v * 100:+.{d}f}%'  # noqa: E731


def head(cols):
    return [f"| {' | '.join(cols)} |", '|' + '---|' * len(cols)]


def main_table(t):
    lines = head(['跳空倍數', '筆數', '跳空', '盤中', '隔夜', '中位數', '勝率'])
    for r, z in t.iterrows():
        lines.append(f"| {r} | {int(z['筆數']):,} | {pct(z['跳空平均'], 1)} | {pct(z['盤中平均'])} | "
                     f"**{pct(z['隔夜平均'])}** | {pct(z['隔夜中位數'])} | {z['隔夜勝率'] * 100:.0f}% |")
    return '\n'.join(lines)


def limit_table(t, key):
    g = t.loc[key]
    g = g[g['筆數'] >= MIN_N]
    lines = head(['跳空倍數', '筆數', '盤中', '隔夜', '中位數', '勝率'])
    for r, z in g.iterrows():
        lines.append(f"| {r} | {int(z['筆數']):,} | {pct(z['盤中平均'])} | **{pct(z['隔夜平均'])}** | "
                     f"{pct(z['隔夜中位數'])} | {z['隔夜勝率'] * 100:.0f}% |")
    return '\n'.join(lines)


def pivot_table(t, bins, order=None):
    """列 = 跳空倍數，欄 = 第一層分組；格子 = 隔夜平均"""
    t = t[t['筆數'] >= MIN_N]
    groups = order or list(dict.fromkeys(t.index.get_level_values(0)))
    lines = head(['跳空倍數', *groups])
    for b in bins:
        cells = [pct(t.loc[(g, b), '隔夜平均']) if (g, b) in t.index else '—' for g in groups]
        lines.append(f'| {b} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(lines)


def report(facts):
    s = (HERE / 'reports' / 'gap.md').read_text(encoding='utf-8')
    s = re.sub(r'^# .*\n+', '', s, count=1)                       # 第一行標題由網頁顯示
    return s.format_map(facts)                                     # 網頁不顯示資料來源：範本裡不寫資料庫名稱


def gap():
    bins = read('bins')
    nl = read('bins_nolimit').reindex(bins.index)
    labels = list(bins.index)
    down, up = labels[:6], labels[7:]                              # 第 7 組(-0.1～0.1)是沒跳空
    keys = [('往下跳', b) for b in down] + [('往上跳', b) for b in up]
    e = pd.read_parquet(SRC / 'output' / 'events.parquet', columns=['日期', '跳空', '組', '真跳空', '回昨K當天', '收漲停', '收跌停', '隔夜'])

    def col(t, k, ks):
        return [rnd(t.loc[i, k]) if i in t.index and t.loc[i, '筆數'] >= MIN_N else None for i in ks]

    def cnt(t, ks):
        return [int(t.loc[i, '筆數']) if i in t.index else 0 for i in ks]

    # 回到前一天 K 棒：開在 K 棒外 / 開在 K 棒內(實體外)
    f = read('fill', [0, 1, 2])
    fill = {}
    for k, pos in (('out', '開在K棒外'), ('in', '開在影線')):
        t = f.xs(pos, level=1)
        fill[k] = {'n': cnt(t, keys), 'body0': col(t, '回實體當天', keys), 'far0': col(t, '回另一端當天', keys),
                   'body1': col(t, '回實體隔天前', keys), 'far1': col(t, '回另一端隔天前', keys)}
    # 開在 K 棒外：當天有沒有回到 K 棒內的隔夜報酬；第三組是沒回到、排除收漲跌停
    fo = read('fill_on', [0, 1, 2])
    s = e[(e['真跳空'] != '昨日區間內') & (e['回昨K當天'] == 0) & ~e['收漲停'] & ~e['收跌停']]
    s = s.assign(方向=np.where(s['跳空'] > 0, '往上跳', '往下跳'))
    snl = s.groupby(['方向', '組'], observed=True)['隔夜'].agg(['mean', 'size']).rename(columns={'mean': '隔夜平均', 'size': '筆數'})
    back, stay = [(d, '有回到', b) for d, b in keys], [(d, '沒回到', b) for d, b in keys]
    fill_ov = {'back': col(fo, '隔夜平均', back), 'stay': col(fo, '隔夜平均', stay), 'stayNl': col(snl, '隔夜平均', keys),
               'nBack': cnt(fo, back), 'nStay': cnt(fo, stay), 'nStayNl': cnt(snl, keys)}
    # 成交量：每個跳空倍數組內，量比三等分
    v = read('vol', [0, 1])
    vk = down + up
    vol = {q: {'n': [int(v.loc[(b, q), '筆數']) for b in vk], 'ov': arr([v.loc[(b, q), '隔夜非漲跌停'] for b in vk]),
               'win': arr([v.loc[(b, q), '非漲跌停勝率'] for b in vk]), 'fill0': arr([v.loc[(b, q), '回實體當天'] for b in vk]),
               'fill1': arr([v.loc[(b, q), '回實體隔天前'] for b in vk])} for q in VOLS}

    lc = read('limit_close', [0, 1])
    facts = {
        'start': e['日期'].min().strftime('%Y/%m/%d'), 'end': e['日期'].max().strftime('%Y/%m/%d'),
        'count': '\n'.join(head(['項目', '股票日數']) + [f'| {k} | {int(x):,} |' for k, x in read('count')['筆數'].items()]),
        'main': main_table(bins), 'nolimit': main_table(read('bins_nolimit')),
        'limit_up': limit_table(lc, '收漲停'), 'limit_dn': limit_table(lc, '收跌停'),
        'period': pivot_table(read('bins_period', [0, 1]), labels),
        'mkt': pivot_table(read('bins_mkt', [0, 1]), labels, ['上市', '上櫃']),
        'true': pivot_table(read('bins_true', [0, 1]), labels, ['開在昨低之下', '昨日區間內', '開在昨高之上']),
    }
    x = read('ext')
    facts['ext'] = '\n'.join(head(['跳空倍數', '筆數', '隔夜', '中位數']) +
                             [f"| {r} | {int(z['count']):,} | **{pct(z['mean'])}** | {pct(z['median'])} |" for r, z in x.iterrows()])
    last = read('count')['筆數'].iloc[-1]
    return {
        'asof': e['日期'].max().strftime('%Y-%m-%d'), 'start': e['日期'].min().strftime('%Y-%m-%d'), 'n': int(last),
        'bins': labels, 'down': down, 'up': up,
        'all': {'n': [int(z) for z in bins['筆數']], 'gap': arr(bins['跳空平均']), 'intra': arr(bins['盤中平均']),
                'ov': arr(bins['隔夜平均']), 'med': arr(bins['隔夜中位數']), 'win': arr(bins['隔夜勝率'])},
        'nl': {'n': [int(z) for z in nl['筆數']], 'intra': arr(nl['盤中平均']), 'ov': arr(nl['隔夜平均']),
               'med': arr(nl['隔夜中位數']), 'win': arr(nl['隔夜勝率'])},
        'fill': fill, 'fillOv': fill_ov, 'vol': vol,
        'report': report(facts),
    }


def main():
    out = dataset_dir(NAME)
    B = gap()
    write_json(out / 'gap.json', B)
    write_meta(NAME, '台股日資料(本機計算)', '', '不定期(研究更新時手動執行)', asof=B['asof'])
    print(f"gap：{B['n']:,} 個股票日({B['start']} ～ {B['asof']})")


if __name__ == '__main__':
    main()
