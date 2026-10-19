"""
台股事件型策略(每天收盤後選股、隔天開盤進場、持有幾天就出場)：共用同一份資料、同一套進出場與漲跌停規則，
每個策略輸出 web/data/tw_strategy/<key>.json，比較基準一律是 0050(股息再投入、買進持有)。
資料：本機 PostgreSQL 的 cm.tw_daily(CMoney 日資料，2016 年起)；加權指數用 data 分支的 indices/TAIEX.json。

新增策略：在 STRATEGIES 加一筆(訊號函式 + 出場參數 + 選股表要顯示的欄位)，網頁 tw-strategy.js 的 SIDES 加一筆設定。
不公開的策略寫在本機的 private_strategies.py(不進版控)：它的 COLS、STRATEGIES 會併進來；有 password 的策略，
輸出的 JSON 連同網頁說明(info)整份加密(PBKDF2-SHA256 推導金鑰 + AES-GCM)，網頁輸入密碼後在瀏覽器解密。
沒有這個檔案時，不公開的策略不會產生。

共用規則：
  - 選股日收盤後判斷訊號，隔一個交易日開盤進場；同一檔股票同時只持有一筆，出場當天收盤的訊號就可以再進場
  - 停利 tp、停損 sl(可省略)：盤中觸及就以該價格出場，跳空越過則以開盤價出場；同一天兩者都觸及時以停損計
  - 最多持有 hold 個交易日：exit='open' 在第 hold+1 個交易日開盤出場；exit='close' 在第 hold 個交易日收盤出場
  - 價格用還原股價(含除權息)；漲跌停用原始價格判斷(漲停價 = 前一日收盤 × 1.1 依升降單位無條件捨去，跌停價 = × 0.9 無條件進位)
      做多：進場日開盤漲停 → 買不到，再隔一個交易日開盤進場(可能連續延後)；要賣出時(開盤或收盤)剛好是跌停價 → 賣不掉，延到下一個交易日同一時點
      做空：進場日開盤跌停 → 空不到，再隔一個交易日開盤進場；進場日開盤是漲停價 → 不放空(空在漲停價不合理)，這筆取消；
            要回補時剛好是漲停價 → 買不回來，延到下一個交易日同一時點
  - 組合淨值：每天把資金平均分配給當天持有中的部位，當天報酬 = 各部位當天報酬的平均(做空的報酬 = −股價漲跌幅)；
    沒有部位時持有現金(報酬 0)。交易成本由網頁依當天買賣的部位比例扣除(trade)。

策略(公開)：
  against 大盤跌個股逆勢漲就是欠踹(做空)：大盤大跌時逆勢大漲、又有借券空方加碼的股票，隔天開盤放空、當天收盤回補
    1. 加權指數當天下跌 ≥ 1%　2. 個股當天上漲 ≥ 3%
    3. 收盤價在 60 日均線之上，且 60 日均線的線性迴歸斜率為正(XQ 的 LinearRegSlope(60 日均線, 60) > 0)
    4. 借券賣出餘額張數創 3 日新高(高於前 2 日的最高值)
    排除：選股日開盤價等於漲停價；進場日開盤價等於漲停價(不放空)
    出場：不設停利停損，持有 1 個交易日，當天收盤回補

用法：python pipeline/tw_strategy/events.py [策略 ...]   (預設全部；python pipeline/tw_strategy/update.py 也會一起產生)
"""
import base64
import hashlib
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import REPO, dataset_dir, load_published, pg_connect, write_json  # noqa: E402

try:
    import private_strategies as private
except ImportError:
    private = None

RECENT = 20             # 網頁列出最近幾個交易日的選股
BENCH = '0050'
EPS = 1e-6

COLS = {'open': '開盤價', 'close': '收盤價', 'vol': '成交量', 'o': '還原開盤價', 'h': '還原最高價', 'l': '還原最低價', 'c': '還原收盤價',
        'sbl': '借券賣出餘額'}
if private:
    COLS.update(private.COLS)
SQL = f'''COPY (
  SELECT "日期", "股票代號", {", ".join(f'"{c}"' for c in COLS.values())} FROM cm.tw_daily
  WHERE "股票代號" ~ '^([1-9][0-9]{{3}}|0050)$' AND "股票代號" !~ '^91'   -- 91xx 為存託憑證
) TO STDOUT WITH CSV'''
KDF_ITER = 1_000_000    # 加密策略的 PBKDF2 次數(網頁 tw-strategy.js 讀 JSON 裡的 iter，兩邊不用同步改)
SQL_NAMES = '''
  SELECT DISTINCT ON ("股票代號") "股票代號", "股票名稱", "產業指數名稱" FROM cm.tw_company_info
  ORDER BY "股票代號", "年度" DESC'''
SQL_DELISTED = 'SELECT "股票代號", "股票名稱", "產業名稱" FROM cm.tw_delisted_company'


def load():
    """所有策略共用的資料：W[欄位] = 日期 × 代號，外加加權指數收盤 W['taiex'](依交易日對齊)"""
    with pg_connect() as conn:
        buf = io.BytesIO()
        with conn.cursor().copy(SQL) as cp:
            for chunk in cp:
                buf.write(chunk)
        buf.seek(0)
        df = pd.read_csv(buf, header=None, names=['d', 's', *COLS], dtype={'s': str}, parse_dates=['d'])
        names = {s: (n, ind) for s, n, ind in conn.execute(SQL_NAMES).fetchall()}
        for s, n, ind in conn.execute(SQL_DELISTED).fetchall():
            names.setdefault(s, (n, ind))
    c = df.pivot(index='d', columns='s', values='c').sort_index()
    W = {k: df.pivot(index='d', columns='s', values=k).reindex_like(c) for k in COLS}
    try:   # 先讀 data 分支的最新版本(本機 web/data/indices 可能是舊的)
        j = requests.get(f'https://raw.githubusercontent.com/{REPO}/data/indices/TAIEX.json', timeout=30).json()
    except Exception:  # noqa: BLE001
        j = load_published('indices', 'TAIEX.json')
    W['taiex'] = pd.Series(j['c'], index=pd.to_datetime(j['d']), dtype=float).reindex(c.index)
    return W, names


def tick(p):
    """台股升降單位"""
    return np.select([p < 10, p < 50, p < 100, p < 500, p < 1000], [0.01, 0.05, 0.1, 0.5, 1.0], 5.0)


def limits(W):
    """每天的漲停價、跌停價(由前一個交易日的原始收盤價推算)"""
    if 'lim' not in W:
        prev = W['close'].ffill().shift(1).to_numpy()
        with np.errstate(invalid='ignore'):
            up, dn = prev * 1.1, prev * 0.9
            W['lim'] = (np.floor(np.round(up / tick(up), 6)) * tick(up), np.ceil(np.round(dn / tick(dn), 6)) * tick(dn))
    return W['lim']


def linreg_slope(y, n):
    """線性迴歸斜率(同 XQ 的 LinearRegSlope)：每一天用最近 n 個值對時間 0..n-1 做迴歸，回傳斜率；不足 n 個值為缺值"""
    k = pd.DataFrame(np.arange(len(y), dtype=float)[:, None].repeat(y.shape[1], 1), index=y.index, columns=y.columns)
    sy = y.rolling(n).sum()
    sty = (y * k).rolling(n).sum() - (k - n + 1) * sy          # Σ t·y，t = 視窗內的位置 0..n-1
    st, stt = n * (n - 1) / 2, (n - 1) * n * (2 * n - 1) / 6
    return (n * sty - st * sy) / (n * stt - st ** 2)


def wide(s, like):
    """把一條日期序列(例如加權指數)展開成和個股一樣的 日期 × 代號 表格"""
    return pd.DataFrame(np.repeat(s.to_numpy()[:, None], like.shape[1], 1), index=like.index, columns=like.columns)


# ---------- 策略：訊號 + 選股表要顯示的欄位(格式 pct = ×100%、chg = 帶正負號的 ×100%、num = 數字%、int = 整數) ----------
def against_signal(W):
    c, vol, sbl = W['c'], W['vol'], W['sbl']
    ret = c / c.shift(1) - 1
    mkt = wide(W['taiex'] / W['taiex'].shift(1) - 1, c)
    ma = c.rolling(60).mean()
    slope = linreg_slope(ma, 60)
    lu, _ = limits(W)
    sig = ((vol > 0) & (ret >= 0.03) & (mkt <= -0.01) & (c > ma) & (slope > 0)
           & (sbl > 0) & (sbl > sbl.shift(1).rolling(2).max())
           & ~(W['open'] >= lu - EPS))                                   # 排除：選股日開盤價等於漲停價
    cols = [('個股漲幅', 'chg', ret), ('加權指數漲跌', 'chg', mkt), ('距 60 日均線', 'chg', c / ma - 1),
            ('借券賣出餘額(張)', 'int', sbl), ('借券餘額 2 日增減(張)', 'int', sbl - sbl.shift(2))]
    return sig, cols


STRATEGIES = [
    {'key': 'against', 'side': 'short', 'signal': against_signal, 'tp': None, 'sl': None, 'hold': 1, 'exit': 'close'},
] + (private.STRATEGIES if private else [])


def encrypt(obj, password):
    """整份 JSON 加密：{'enc': {iter, salt, iv, ct}}(base64)；網頁用 Web Crypto 以同樣參數解密"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, KDF_ITER, 32)
    ct = AESGCM(key).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode(), None)
    b64 = lambda x: base64.b64encode(x).decode()  # noqa: E731
    return {'enc': {'iter': KDF_ITER, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(ct)}}


# ---------- 共用：進出場、組合淨值、輸出 ----------
def backtest(W, sig, st):
    """逐檔模擬進出場：回傳每筆交易(含漲跌停延後進場、延後出場的天數)"""
    O, H, L, C = (W[k].to_numpy() for k in ('o', 'h', 'l', 'c'))
    RO, RC = W['open'].to_numpy(), W['close'].to_numpy()
    LU, LD = limits(W)
    long = st['side'] == 'long'
    tp, sl, hold = st['tp'], st['sl'], st['hold']
    S = sig.to_numpy()
    nd, ns = C.shape

    def no_entry(t, j):      # 做多開盤漲停買不到、做空開盤跌停空不到
        return RO[t, j] >= LU[t, j] - EPS if long else RO[t, j] <= LD[t, j] + EPS

    def locked(raw, t, j):   # 做多跌停賣不掉、做空漲停買不回來(raw = 出場時點的原始價格)
        return raw <= LD[t, j] + EPS if long else raw >= LU[t, j] - EPS

    trades, skipped = [], []
    for j in range(ns):
        free = 0
        for s in np.where(S[:, j])[0]:
            if s < free:
                continue
            e = s + 1                                             # 隔天開盤進場；停牌或開盤漲跌停(進不了場)就再隔一天
            while e < nd and (not np.isfinite(O[e, j]) or no_entry(e, j)):
                e += 1
            if e >= nd:
                continue                                          # 資料最後一天還進不了場
            edelay = int(e - s - 1)
            if not long and RO[e, j] >= LU[e, j] - EPS:
                skipped.append((j, s, e))                         # 做空：開盤就是漲停價，不放空
                continue
            E = O[e, j]
            x, px, why, when = None, None, None, None
            if tp is not None or sl is not None:
                win = E * (1 + tp) if long else E * (1 - tp)      # 停利價
                lose = E * (1 - sl) if long else E * (1 + sl)     # 停損價
                for t in range(e, min(e + hold, nd)):
                    o, h, l = O[t, j], H[t, j], L[t, j]
                    if not np.isfinite(l):
                        continue                                  # 停牌：價格不動
                    best, worst = (h, l) if long else (l, h)
                    hit_w = (lambda p: p >= win) if long else (lambda p: p <= win)
                    hit_l = (lambda p: p <= lose) if long else (lambda p: p >= lose)
                    if t > e and hit_l(o):
                        x, px, why, when = t, o, 'sl', 'open'
                    elif hit_l(worst):
                        x, px, why = t, lose, 'sl'
                    elif t > e and hit_w(o):
                        x, px, why, when = t, o, 'tp', 'open'
                    elif hit_w(best):
                        x, px, why = t, win, 'tp'
                    if x is not None:
                        break
            if x is None:
                t = e + hold if st['exit'] == 'open' else e + hold - 1
                if t < nd:
                    x, why, when = t, 'time', st['exit']
            delay = 0
            if when is not None:
                # 開盤或收盤出場：停牌或剛好在出不了場的漲跌停價，就延到下一個交易日同一時點
                P, R = (O, RO) if when == 'open' else (C, RC)
                t = x
                while t < nd and (not np.isfinite(P[t, j]) or locked(R[t, j], t, j)):
                    t += 1
                delay = int(t - x)
                x = t if t < nd else None
                if x is not None and (why == 'time' or delay):
                    px = P[x, j]
            if x is None:
                why, px = 'open', None                            # 還在持有
            held = None if x is None else int(x - e + (when != 'open'))
            trades.append((j, s, e, x, E, px, why, delay, held, edelay))
            free = x if x is not None else nd                     # 出場當天收盤的訊號就可以再進場
    return trades, skipped


def portfolio(W, trades, long):
    """每日組合報酬(平均分配給當天持有的部位；做空的報酬 = −股價漲跌幅)與當天買賣的部位比例"""
    C = W['c'].ffill().to_numpy()
    nd = C.shape[0]
    sign = 1 if long else -1
    rs = [[] for _ in range(nd)]
    nt = np.zeros(nd)
    for j, s, e, x, E, px, *_ in trades:
        prev = E
        for t in range(e, (x if x is not None else nd - 1) + 1):
            p = px if t == x else C[t, j]
            rs[t].append(sign * (p / prev - 1))
            prev = p
        nt[e] += 1
        if x is not None:
            nt[x] += 1
    ret = np.array([np.mean(r) if r else 0.0 for r in rs])
    npos = np.array([len(r) for r in rs])
    return ret, npos, np.where(npos > 0, nt / np.maximum(npos, 1), 0)


def build(W, names, st):
    dates = W['c'].index
    nd = len(dates)
    sig, cols = st['signal'](W)
    sig = sig.fillna(False).astype(bool)
    sig[BENCH] = False
    stocks = list(W['c'].columns)
    long = st['side'] == 'long'
    trades, skipped = backtest(W, sig, st)
    trades.sort(key=lambda t: (t[2], stocks[t[0]]))
    ret, npos, trade = portfolio(W, trades, long)
    i0 = int(sig.to_numpy().any(axis=1).argmax())     # 第一個訊號日 = 期初
    Cb = W['c'][BENCH].ffill().to_numpy()
    Cl = W['c'].ffill().to_numpy()
    fmt = lambda t: dates[t].strftime('%Y-%m-%d')  # noqa: E731
    nm = lambda j: names.get(stocks[j], ('', ''))  # noqa: E731
    gross = (lambda p, E: p / E - 1) if long else (lambda p, E: 1 - p / E)  # noqa: E731
    # 交易：[代號, 名稱, 進場日, 出場日, 報酬(未扣成本；持有中以最新收盤計), 出場原因, 持有天數, 漲跌停延後出場的天數, 漲跌停延後進場的天數]
    T = [[stocks[j], nm(j)[0], fmt(e), fmt(x) if x is not None else None,
          round(float(gross(px if x is not None else Cl[-1, j], E)), 5), why, held if held is not None else int(nd - e), delay, edelay]
         for j, s, e, x, E, px, why, delay, held, edelay in trades]
    # 最近 RECENT 個交易日的選股：[代號, 名稱, 產業, 收盤價, 各欄位…]
    S, close = sig.to_numpy(), W['close'].to_numpy()
    V = [c[2].to_numpy(dtype=float) for c in cols]
    num = lambda v: round(float(v), 4) if np.isfinite(v) else None  # noqa: E731
    recent = [{'d': fmt(t), 'p': [[stocks[j], *nm(j), float(close[t, j]), *[num(v[t, j]) for v in V]] for j in np.where(S[t])[0]]}
              for t in range(nd - 1, max(-1, nd - 1 - RECENT), -1)]
    return {
        'key': st['key'], 'side': st['side'], 'asof': fmt(nd - 1),
        'd': [x.strftime('%Y-%m-%d') for x in dates[i0:]],
        'nav': {'s': [round(float(x), 6) for x in np.cumprod(1 + ret[i0:])], 'b0050': [round(float(x), 6) for x in Cb[i0:] / Cb[i0]]},
        'npos': npos[i0:].tolist(),
        'trade': [round(float(x), 4) for x in trade[i0:]],
        'trades': T,
        'skipped': [[stocks[j], nm(j)[0], fmt(s), fmt(e)] for j, s, e in sorted(skipped, key=lambda b: b[2])],   # 做空：進場日開盤漲停、取消
        'cols': [[h, f] for h, f, _ in cols],
        'recent': recent,
        'params': {'tp': st['tp'], 'sl': st['sl'], 'hold': st['hold'], 'exit': st['exit']},
    }


def main(keys=None):
    W, names = load()
    out_dir = dataset_dir('tw_strategy', clean=False)
    for st in STRATEGIES:
        if keys and st['key'] not in keys:
            continue
        out = build(W, names, st)
        write_json(out_dir / f"{st['key']}.json", encrypt({**out, 'info': st['info']}, st['password']) if st.get('password') else out)
        T = [t for t in out['trades'] if t[5] != 'open']
        r = np.array([t[4] for t in T])
        print(f"{st['key']}({st['side']}) {out['d'][0]} ~ {out['asof']}：延後進場 {sum(t[8] > 0 for t in out['trades'])} 筆、開盤漲停不放空 {len(out['skipped'])} 筆、延後出場 {sum(t[7] > 0 for t in T)} 筆；"
              f"{len(T)} 筆已出場，勝率 {(r > 0).mean():.1%}，平均 {r.mean():+.2%}；組合 {out['nav']['s'][-1]:.2f} 倍，"
              f"最新選股 {out['recent'][0]['d']} {len(out['recent'][0]['p'])} 檔")


if __name__ == '__main__':
    main(sys.argv[1:] or None)
