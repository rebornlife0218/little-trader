"""
資料集 tw_research：台股其他研究(營收、因子、事件、機器學習)的回測結果與報告 → web/data/tw_research/

研究本身在 CM 資料夾(rebornlife0218/Seeking_Alpha 的本機工作目錄)用 CM 台股日資料(parquet)計算，
回測規則與 tw_strategy 相同(根目錄 CLAUDE.md「選股回測原則」；實作在 CM/台股/backtest/engine.py 與各研究的 backtest.py)。
這裡只把各研究輸出的淨值、交易統計與報告(Markdown)整理成網頁用的 JSON，不發佈 csv、png 與原始股價。

研究資料夾：環境變數 CM_BACKTEST_DIR(預設為下方 DEFAULT_DIR)，底下每個研究一個資料夾：
  營收公告前布局/  backtest.py(不限市值)、backtest.py q1~q4(市值四分位，輸出在 市值Q1~Q4/)
  營收成長特徵/    backtest.py、event_study.py
  營收衰退開低/    backtest.py
先在 CM 跑完各研究，再執行：
  python pipeline/tw_research/update.py
輸出：每個研究一個 <key>.json(d = 日期、nav = 淨值(期初 = 1)、ts = 交易統計、report = 報告 Markdown…)
"""
import json
import os
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import dataset_dir, write_json, write_meta  # noqa: E402

DEFAULT_DIR = r'C:\Users\013411\Desktop\ETF_PANEL\雜七雜八\CM\台股\backtest'
SRC = Path(os.environ.get('CM_BACKTEST_DIR', DEFAULT_DIR))
CAPITAL = 1_000_000
NAME = 'tw_research'


def csv(p, **kw):
    return pd.read_csv(p, encoding='utf-8-sig', **kw)


def report(p):
    """報告 Markdown：去掉第一行標題(網頁另外顯示)"""
    s = Path(p).read_text(encoding='utf-8')
    return re.sub(r'^# .*\n+', '', s, count=1)


def nav_frame(p):
    """daily_nav.csv(本金 100 萬的每日淨值) → 期初 = 1；前面補一天(進場前一天收盤 = 期初)"""
    nav = csv(p, index_col=0, parse_dates=True)
    return nav


def series(nav, prev_day):
    d = [prev_day] + [x.strftime('%Y-%m-%d') for x in nav.index]
    return d, {c: [1.0] + [round(v / CAPITAL, 5) for v in nav[c].tolist()] for c in nav.columns}


def num(v, nd=5):
    return None if pd.isna(v) else round(float(v), nd)


def tstat(r):
    """strategy.csv 的一列 → 網頁 tradeCards 用的交易統計"""
    g = lambda k: num(r[k]) if k in r and not pd.isna(r[k]) else None  # noqa: E731
    return {'n': int(r['交易筆數']), 'win': g('勝率'), 'mean': g('每筆平均'), 'median': g('每筆中位數'),
            'pos': g('平均一天持有檔數'), 'days': g('平均一檔持倉天期'), 'heldPct': g('有部位天數比例'),
            'nocash': int(r['現金不足放棄筆數']) if '現金不足放棄筆數' in r and not pd.isna(r['現金不足放棄筆數']) else 0,
            'fail': int(r['進場失敗筆數']) if '進場失敗筆數' in r and not pd.isna(r['進場失敗筆數']) else 0,
            'delist': int(r['下市櫃筆數']) if '下市櫃筆數' in r and not pd.isna(r['下市櫃筆數']) else 0,
            'cap': g('每筆資金上限')}


def prev_trading_day(start):
    """進場前一個交易日(期初)：從 0050 的日資料找"""
    import glob
    cm = SRC.parents[0] / 'data' / 'CM_panel'
    days = sorted(set(pd.concat(pd.read_parquet(f, columns=['日期'], filters=[('股票代號', '==', '0050')])
                                for f in glob.glob(str(cm / '*.parquet')))['日期']))
    days = pd.DatetimeIndex(days)
    return days[days < start][-1].strftime('%Y-%m-%d')


# ---------- 營收公告前布局 ----------
def rev_pre():
    base = SRC / '營收公告前布局'
    VERS = [('all', '不限市值', base), ('q1', '市值 Q1(最小)', base / '市值Q1'), ('q2', '市值 Q2', base / '市值Q2'),
            ('q3', '市值 Q3', base / '市值Q3'), ('q4', '市值 Q4(最大)', base / '市值Q4')]
    nav0 = nav_frame(base / 'daily_nav.csv')
    prev = prev_trading_day(nav0.index[0])
    d, _ = series(nav0, prev)
    out = {'d': d, 'asof': d[-1], 'versions': [], 'report': report(base / '報告.md')}
    for key, name, p in VERS:
        nav = nav_frame(p / 'daily_nav.csv')
        assert list(nav.index) == list(nav0.index), f'{p} 的日期和不限市值版本不同'
        _, nv = series(nav, prev)
        st = csv(p / 'strategy.csv')
        s21 = st[st['進場日'] == '21日'].set_index('組合')
        v = {'key': key, 'name': name,
             'nav': {'t10': nv['21日｜前 10 檔'], 't5': nv['21日｜前 5 檔'], 'ew': nv['21日｜全部合格股票']},
             'ts': {'t10': tstat(s21.loc['前 10 檔']), 't5': tstat(s21.loc['前 5 檔']), 'ew': tstat(s21.loc['全部合格股票'])},
             'entry': [{'rule': r['進場日'], 'g': r['組合'], 'ret': num(r['總報酬率']), 'cagr': num(r['年化報酬']), 'sharpe': num(r['夏普']),
                        'sortino': num(r['索提諾']), 'mdd': num(r['最大回撤']), 'mean': num(r['每筆平均'])}
                       for _, r in st[st['進場日'].isin(['21日', '25日', '月底'])].iterrows()]}
        if key != 'all':
            cr = csv(p / 'cap_range.csv')
            v['cap'] = {'m': cr.iloc[:, 0].tolist(), 'lo': [num(x, 1) for x in cr['min']], 'hi': [num(x, 1) for x in cr['max']]}
        out['versions'].append(v)
        if key == 'all':
            out['b0050'] = nv['-｜0050']
    dec = csv(base / 'score_decile.csv')
    out['decile'] = [{'d': int(r['分數十分位']), 'n': int(r['筆數']), 'mean': num(r['平均報酬']), 'win': num(r['勝率']),
                      'yoy': num(r['實際年增中位數'], 2)} for _, r in dec.iterrows()]
    ic = csv(base / 'factor_ic.csv')
    out['ic'] = [{'f': r['因子'], 'ic': num(r['IC'], 4), 't': num(r['IC t'], 2), 'pos': num(r['IC>0 月份比例'], 3),
                  'pred': num(r['與實際年增率相關'], 3)} for _, r in ic.iterrows()]
    return out


# ---------- 營收衰退開低 ----------
def rev_drop():
    base = SRC / '營收衰退開低'
    nav = nav_frame(base / 'daily_nav.csv')
    npos = csv(base / 'daily_npos.csv', index_col=0, parse_dates=True)
    prev = prev_trading_day(nav.index[0])
    d, nv = series(nav, prev)
    st = csv(base / 'strategy.csv').set_index('策略')
    keys = [c for c in nav.columns if c != '0050']
    gr = csv(base / 'groups.csv')
    return {'d': d, 'asof': d[-1], 'b0050': nv['0050'],
            'strats': [{'key': k, 'name': k, 'nav': nv[k], 'ts': tstat(st.loc[k]), 'npos': [0] + [int(x) for x in npos[k]]} for k in keys],
            'groups': [{'s': r['策略'], 'g': r['分組'], 'k': str(r['組別']), 'n': int(r['筆數']), 'mean': num(r['平均']),
                        'median': num(r['中位數']), 'win': num(r['勝率']), 'vol': num(r['T1平均成交張數'], 0)} for _, r in gr.iterrows()],
            'funnel': json.loads((base / 'summary.json').read_text(encoding='utf-8'))['funnel'],
            'report': report(base / '報告.md')}


# ---------- 營收成長特徵 ----------
def rev_growth():
    base = SRC / '營收成長特徵'
    nav = nav_frame(base / 'daily_nav.csv')
    npos = csv(base / 'daily_npos.csv', index_col=0, parse_dates=True)
    prev = prev_trading_day(nav.index[0])
    d, nv = series(nav, prev)
    st = csv(base / 'strategy.csv')
    st['key'] = st['持有期'] + '｜' + st['組合']
    st = st.set_index('key')
    keys = [c for c in nav.columns if c != '0050']
    fx = csv(base / 'feature_ic.csv')
    car = csv(base / 'event_car_path.csv', index_col=0)
    sc = csv(base / 'score.csv')
    return {'d': d, 'asof': d[-1], 'b0050': nv['0050'],
            'strats': [{'key': k, 'h': k.split('｜')[0], 'g': k.split('｜')[1], 'nav': nv[k], 'ts': tstat(st.loc[k]),
                        'npos': [0] + [int(x) for x in npos[k]]} for k in keys],
            'ic': [{'f': f, 'h': {h: num(fx[(fx['特徵'] == f) & (fx['持有期'] == h)]['IC t'].iloc[0], 2) for h in ['日內', 'T+1', '5日']}}
                   for f in fx['特徵'].unique()],
            'car': {'x': car.index.tolist(), 'series': {c: [num(v * 100, 3) for v in car[c]] for c in car.columns}},
            'score': [{'h': r['持有期'], 's': int(r['分數']), 'n': int(r['筆數']), 'mean': num(r['平均']), 'win': num(r['勝率'])} for _, r in sc.iterrows()],
            'report': report(base / '報告.md')}


def main():
    out = dataset_dir(NAME)
    for key, fn in [('rev_pre', rev_pre), ('rev_drop', rev_drop), ('rev_growth', rev_growth)]:
        data = fn()
        write_json(out / f'{key}.json', data)
        print(f'{key}.json：{(out / f"{key}.json").stat().st_size / 1024:.0f} KB')
    write_meta(NAME, 'CM 台股日資料、月營收(本機計算)', '', '不定期(研究更新時手動執行)')


if __name__ == '__main__':
    main()
