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
      做多：進場日開盤漲停(或沒有成交) → 買不到，延後一天開盤進場；隔天仍買不到就放棄這筆
            要賣出時(開盤或收盤)剛好是跌停價或沒有成交 → 賣不掉，延到下一個交易日同一時點(可能連續延後)
      做空：進場日開盤跌停(或沒有成交) → 空不到，放棄；進場日開盤是漲停價 → 不放空(空在漲停價不合理)，這筆取消；
            要回補時剛好是漲停價或沒有成交 → 買不回來，延到下一個交易日同一時點(可能連續延後)
      持有期間下市櫃：以最後收盤價轉為現金(不計成本)
  - 資金(simulate)：本金 100 萬；每檔上限 = 1 ÷ 平均一天持有檔數(只算有部位的日子)，策略指定持有檔數 N 時 = 1/N。
    有新股票進場的那天，所有部位調整到 前一天收盤總資產 × min(上限, 1 ÷ 持有檔數)(含新進場的)：先減碼、再進場、最後補足，
    都以一股的價格無條件捨去到整數股；開盤漲跌停或沒有成交的部位不調整，當天預定出場的部位不算。現金不夠時新股票平分剩下的現金，
    不放棄訊號(連一股都買不起才放棄，nocash)。沒有新股票進場的日子不調整。
  - 成本：手續費 0.1425% × 0.3(買賣都收)、證交稅 0.3%(賣出時收，同一天進出 0.15%)、滑價買賣各一個升降單位(不超過漲跌停價)；
    借券費(年利率)在網頁依每天收盤的放空比例(expo)與日曆天數扣除，使用者可調整。

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
        'sbl': '借券賣出餘額', 'val': '成交金額(千)'}
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


# ---------- 共用：交易成本與資金 ----------
CAPITAL = 1_000_000     # 本金 100 萬
FEE = 0.001425 * 0.3    # 手續費(買賣都收，0.1425% 打 3 折)
TAX = 0.003             # 股票交易稅(賣出時收)
TAX_DT = 0.0015         # 當沖交易稅(同一天進出)


def traded(W):
    """當天有成交(沒有成交的日子不能當作進出場價格)"""
    if 'tr' not in W:
        W['tr'] = (W['vol'] > 0).to_numpy()
    return W['tr']


def last_day(W):
    """每檔股票最後一個有資料的交易日(下市櫃的股票在這天之後就沒有資料)"""
    if 'last' not in W:
        ok = np.isfinite(W['c'].to_numpy())
        W['last'] = np.where(ok.any(0), len(ok) - 1 - ok[::-1].argmax(0), -1)
    return W['last']


def fill(raw, buy, lu, ld):
    """滑價：買進以高一個升降單位成交、賣出以低一個升降單位成交，不超過漲跌停價"""
    return min(raw + tick(raw), lu) if buy else max(raw - tick(raw), ld)


def bench_nav(W, i0):
    """0050 股息再投入、買進持有：期初(i0 收盤)現金 100 萬，隔天開盤以整數股買進(含手續費與滑價)，之後不再交易"""
    O, C, RO = W['o'][BENCH].to_numpy(), W['c'][BENCH].ffill().to_numpy(), W['open'][BENCH].to_numpy()
    LU, LD = (x[:, list(W['c'].columns).index(BENCH)] for x in limits(W))
    e = i0 + 1
    px = fill(RO[e], True, LU[e], LD[e])
    sh = int(CAPITAL // (px * (1 + FEE)))
    cash = CAPITAL - sh * px * (1 + FEE)
    units = sh * px / (O[e] * px / RO[e])                    # 還原股價計的單位數：市值 = units × 還原收盤價
    nav = np.r_[1.0, (cash + units * C[e:]) / CAPITAL]
    return nav


# ---------- 事件型策略：進出場、資金模擬、輸出 ----------
def backtest(W, sig, st):
    """逐檔決定進出場的時間與價格(和資金無關)：回傳每筆交易與進不了場而取消的訊號"""
    O, H, L, C = (W[k].to_numpy() for k in ('o', 'h', 'l', 'c'))
    RO, RC = W['open'].to_numpy(), W['close'].to_numpy()
    LU, LD = limits(W)
    TR, LAST = traded(W), last_day(W)
    long = st['side'] == 'long'
    tp, sl, hold = st['tp'], st['sl'], st['hold']
    S = sig.to_numpy()
    nd, ns = C.shape

    def locked(raw, t, j):   # 做多跌停賣不掉、做空漲停買不回來(raw = 出場時點的原始價格)
        return raw <= LD[t, j] + EPS if long else raw >= LU[t, j] - EPS

    trades, skipped = [], []
    for j in range(ns):
        free = 0
        for s in np.where(S[:, j])[0]:
            if s < free or s + 1 >= nd:
                continue
            # 進場：做多開盤漲停(或沒成交)延後一天，隔天仍買不到就放棄；做空開盤跌停(或沒成交)空不到、開盤漲停不放空，都放棄
            e, why_skip = s + 1, None
            for k in range(2 if long else 1):
                e = s + 1 + k
                if e >= nd:
                    why_skip = 'end'
                elif not TR[e, j]:
                    why_skip = 'halt'
                elif long and RO[e, j] >= LU[e, j] - EPS:
                    why_skip = 'up'
                elif not long and RO[e, j] <= LD[e, j] + EPS:
                    why_skip = 'down'
                elif not long and RO[e, j] >= LU[e, j] - EPS:
                    why_skip = 'upshort'
                    break
                else:
                    why_skip = None
                    break
            if why_skip == 'end':
                continue                                          # 資料最後一天，還不知道進不進得了場
            if why_skip:
                skipped.append((j, s, e, why_skip))
                continue
            edelay = int(e - s - 1)
            E = O[e, j]
            x, px, why, when = None, None, None, None
            if tp is not None or sl is not None:
                win = E * (1 + tp) if long else E * (1 - tp)      # 停利價
                lose = E * (1 - sl) if long else E * (1 + sl)     # 停損價
                hit_w = (lambda p: p >= win) if long else (lambda p: p <= win)
                hit_l = (lambda p: p <= lose) if long else (lambda p: p >= lose)
                for t in range(e, min(e + hold, nd)):
                    if not TR[t, j]:
                        continue                                  # 沒有成交：價格不動
                    o, h, l = O[t, j], H[t, j], L[t, j]
                    best, worst = (h, l) if long else (l, h)
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
                # 開盤或收盤出場：沒有成交或剛好在出不了場的漲跌停價，就延到下一個交易日同一時點；中途下市櫃以最後收盤價轉為現金
                P, R = (O, RO) if when == 'open' else (C, RC)
                t = x
                while t < nd and t <= LAST[j] and (not TR[t, j] or locked(R[t, j], t, j)):
                    t += 1
                if t > LAST[j] and LAST[j] < nd - 1:
                    x, px, why, when = int(LAST[j]), C[LAST[j], j], 'delist', 'close'
                    delay = 0
                else:
                    delay = int(t - x)
                    x = t if t < nd else None
                    if x is not None and (why == 'time' or delay):
                        px = P[x, j]
            if x is None:
                why, px = 'open', None                            # 還在持有
            trades.append((j, s, e, x, E, px, why, delay, edelay, when))
            free = x if x is not None else nd                     # 出場當天收盤的訊號就可以再進場
    return trades, skipped


def avg_holding(trades, nd):
    """平均一天持有檔數(只算有部位的日子)：開盤出場的那天不算持有"""
    n = np.zeros(nd)
    for j, s, e, x, E, px, why, delay, edelay, when in trades:
        end = nd - 1 if x is None else (x - 1 if when == 'open' else x)
        n[e:max(e, end) + 1] += 1
    return float(n[n > 0].mean()) if (n > 0).any() else 1.0


def simulate(W, trades, long, i0, cap=None, whole=True):
    """本金 100 萬的逐日資金模擬。cap = 每檔上限(占總資產)，省略時 = 1 ÷ 平均一天持有檔數；策略指定持有檔數 N 時傳 1/N。
    whole=False 不取整數股(只用在研究的參考組，例如每月等權買進全部合格股票)。
    有新股票進場的那天，所有部位調整到 目標金額 = 前一天收盤總資產 × min(cap, 1 ÷ 持有檔數)(持有檔數含新進場的股票)：
    開盤先把超過目標的舊部位減碼，再買進新股票(現金不夠就平分剩下的現金)，最後把低於目標的舊部位補足；
    減碼、補足都以一股的價格無條件捨去到整數股，開盤漲跌停或沒有成交的部位不調整，當天預定出場的部位不算、也不調整。
    沒有新股票進場的日子不調整。同一天先處理開盤出場、再調整與進場、最後處理盤中與收盤出場。
    做空視為拿出同樣金額當保證金，損益 = −(還原股價漲跌幅) × 放空金額。不含借券費(網頁依使用者設定扣除)。
    每筆報酬 = 這檔從進場到全部出場收回的錢 ÷ 投入的錢 − 1(含所有加減碼與成本)。"""
    O, C = W['o'].to_numpy(), W['c'].ffill().to_numpy()
    RO, RC = W['open'].to_numpy(), W['close'].to_numpy()
    LU, LD = limits(W)
    TR = traded(W)
    nd = C.shape[0]
    cap = cap or 1 / avg_holding(trades, nd)
    sign = 1 if long else -1
    ins, outs = {}, {}
    for k, tr in enumerate(trades):
        ins.setdefault(tr[2], []).append(k)
        if tr[3] is not None:
            outs.setdefault(tr[3], []).append(k)
    # pos[k] = [還原股價計的單位數 u, 保證金與放空所得 b(做多為 0), 投入金額, 收回金額]；部位市值 = sign × u × 還原價 + b
    cash, pos, res = float(CAPITAL), {}, {}
    nav, npos, expo = np.ones(nd), np.zeros(nd, int), np.zeros(nd)
    value = lambda k, p: sign * pos[k][0] * p + pos[k][1]  # noqa: E731

    def due(k, t):           # 當天預定出場(時間到期，含跌停延後中的)：事先知道，不算進持有檔數
        x, why, delay = trades[k][3], trades[k][6], trades[k][7]
        return x is not None and why == 'time' and x - delay <= t

    def can(k, t, add):      # 開盤能不能加碼(add)或減碼：沒有成交、或剛好卡在買不到/賣不掉的漲跌停價就不動
        j = trades[k][0]
        if not TR[t, j]:
            return False
        buy = add == long    # 做多加碼、做空減碼 = 買進
        return RO[t, j] < LU[t, j] - EPS if buy else RO[t, j] > LD[t, j] + EPS

    def trade(k, t, sh, add):
        """以 t 開盤成交 sh 股(add = 加碼/進場，否則減碼)：含滑價、手續費，賣出收交易稅"""
        nonlocal cash
        j = trades[k][0]
        buy = add == long
        px = fill(RO[t, j], buy, LU[t, j], LD[t, j])
        amt = sh * px
        u = amt / (O[t, j] * px / RO[t, j])                       # 還原股價計的單位數
        p = pos.setdefault(k, [0.0, 0.0, 0.0, 0.0])
        if add:
            dt = trades[k][2] == t and trades[k][3] == t        # 做空當天回補：放空時收當沖稅率
            fee = amt * (FEE + (0 if long else (TAX_DT if dt else TAX)))
            cash -= amt + fee
            p[0] += u
            p[1] += 0 if long else 2 * amt                        # 做空：保證金 + 放空所得
            p[2] += amt + fee
        else:
            fee = amt * (FEE + (TAX if long else 0))
            f = min(1.0, u / p[0])
            got = (amt if long else f * p[1] - amt) - fee
            cash += got
            p[0] -= f * p[0]
            p[1] -= f * p[1]
            p[3] += got

    def shares_for(k, t, money, buy):
        j = trades[k][0]
        px = fill(RO[t, j], buy, LU[t, j], LD[t, j])
        n = max(0.0, money) / (px * (1 + FEE + (TAX if not long and buy is False else 0)))
        return int(n) if whole else n

    def close_out(k, t):
        nonlocal cash
        j, e, px, why, when = trades[k][0], trades[k][2], trades[k][5], trades[k][6], trades[k][9]
        u, b, paid, got = pos.pop(k)
        if why == 'delist':
            out = sign * u * px + b                               # 下市櫃：以最後收盤價轉為現金，沒有成交、不計成本
        else:
            raw = px * (RO[t, j] / O[t, j] if when == 'open' else RC[t, j] / C[t, j])   # 出場的原始價格
            adj_out = px * fill(raw, not long, LU[t, j], LD[t, j]) / raw
            rate = FEE + ((TAX_DT if t == e else TAX) if long else 0)   # 做多賣出收交易稅；做空回補是買進，只收手續費
            out = sign * u * adj_out + b - u * adj_out * rate
        cash += out
        res[k] = (got + out) / paid - 1

    for t in range(i0 + 1, nd):
        eq = cash + sum(value(k, C[t - 1, trades[k][0]]) for k in pos)
        for k in [k for k in outs.get(t, []) if k in pos and trades[k][9] == 'open']:
            close_out(k, t)
        new = sorted(ins.get(t, []), key=lambda k: trades[k][0])
        if new:
            keep = [k for k in pos if not due(k, t)]
            target = eq * min(cap, 1 / (len(keep) + len(new)))
            for k in keep:                                        # 先減碼：超過目標的部分
                j = trades[k][0]
                if can(k, t, False):
                    sh = (value(k, O[t, j]) - target) / RO[t, j]
                    sh = int(sh) if whole else sh
                    if sh > 0:
                        trade(k, t, sh, False)
            for i, k in enumerate(new):                           # 再進場：現金不夠就平分剩下的現金
                sh = shares_for(k, t, min(target, cash / (len(new) - i)), long)
                if sh > 0:
                    trade(k, t, sh, True)
            for k in keep:                                        # 最後補足：低於目標的部分
                j = trades[k][0]
                if can(k, t, True):
                    sh = shares_for(k, t, min(target - value(k, O[t, j]), cash), long)
                    if sh > 0:
                        trade(k, t, sh, True)
        npos[t] = len(pos)                                        # 當天持有檔數(含當天收盤出場的部位，不含開盤出場的)
        for k in [k for k in outs.get(t, []) if k in pos]:
            close_out(k, t)
        mv = [value(k, C[t, trades[k][0]]) for k in pos]
        nav[t] = (cash + sum(mv)) / CAPITAL
        expo[t] = 0 if long else sum(mv) / max(nav[t] * CAPITAL, EPS)
    for k in pos:                                                 # 持有中：以最新收盤價計(已扣進場成本)
        res[k] = (pos[k][3] + value(k, C[-1, trades[k][0]])) / pos[k][2] - 1
    return nav, npos, expo, res, cap


def build(W, names, st):
    dates = W['c'].index
    nd = len(dates)
    sig, cols = st['signal'](W)
    sig = sig.fillna(False).astype(bool)
    sig[BENCH] = False
    stocks = list(W['c'].columns)
    long = st['side'] == 'long'
    trades, skipped = backtest(W, sig, st)
    i0 = int(sig.to_numpy().any(axis=1).argmax())     # 第一個訊號日收盤 = 期初
    nav, npos, expo, res, cap = simulate(W, trades, long, i0)
    order = sorted(range(len(trades)), key=lambda k: (trades[k][2], stocks[trades[k][0]]))
    fmt = lambda t: dates[t].strftime('%Y-%m-%d')  # noqa: E731
    nm = lambda j: names.get(stocks[j], ('', ''))  # noqa: E731
    held = lambda tr: int(nd - tr[2]) if tr[3] is None else int(tr[3] - tr[2] + (tr[9] != 'open'))  # noqa: E731
    # 交易：[代號, 名稱, 進場日, 出場日, 報酬(扣手續費、交易稅、滑價，未扣借券費；持有中以最新收盤計), 出場原因, 持有天數, 漲跌停延後出場的天數, 漲跌停延後進場的天數, 持有日曆天數]
    T = [[stocks[tr[0]], nm(tr[0])[0], fmt(tr[2]), fmt(tr[3]) if tr[3] is not None else None, round(float(res[k]), 5), tr[6], held(tr), tr[7], tr[8],
          int(((dates[tr[3]] if tr[3] is not None else dates[-1]) - dates[tr[2]]).days)]
         for k in order if (tr := trades[k]) and k in res]
    nocash = len(trades) - len(res)
    # 最近 RECENT 個交易日的選股：[代號, 名稱, 產業, 收盤價, 各欄位…]
    S, close = sig.to_numpy(), W['close'].to_numpy()
    V = [c[2].to_numpy(dtype=float) for c in cols]
    num = lambda v: round(float(v), 4) if np.isfinite(v) else None  # noqa: E731
    recent = [{'d': fmt(t), 'p': [[stocks[j], *nm(j), float(close[t, j]), *[num(v[t, j]) for v in V]] for j in np.where(S[t])[0]]}
              for t in range(nd - 1, max(-1, nd - 1 - RECENT), -1)]
    out = {
        'key': st['key'], 'side': st['side'], 'asof': fmt(nd - 1),
        'd': [x.strftime('%Y-%m-%d') for x in dates[i0:]],
        'nav': {'s': [round(float(x), 6) for x in nav[i0:]], 'b0050': [round(float(x), 6) for x in bench_nav(W, i0)]},
        'npos': npos[i0:].tolist(),
        'trades': T,
        # 進不了場而取消的訊號：[代號, 名稱, 選股日, 原因]；up = 做多連兩天開盤漲停、down = 做空開盤跌停、upshort = 做空開盤漲停(不放空)、halt = 沒有成交
        'skipped': [[stocks[j], nm(j)[0], fmt(s), why] for j, s, e, why in sorted(skipped, key=lambda b: b[2])],
        'nocash': nocash,
        'cap': round(cap, 4),
        'cols': [[h, f] for h, f, _ in cols],
        'recent': recent,
        'params': {'tp': st['tp'], 'sl': st['sl'], 'hold': st['hold'], 'exit': st['exit'], 'capital': CAPITAL, 'fee': FEE, 'tax': TAX, 'tax_dt': TAX_DT},
    }
    if not long:
        out['expo'] = [round(float(x), 4) for x in expo[i0:]]   # 每天收盤放空部位占總資產的比例(網頁據此扣借券費)
    return out


def main(keys=None, data=None, out=None):
    """data = load() 的結果(update.py 已經讀過就直接傳進來)；out = 只回傳結果、不寫檔(比較新舊版本用)"""
    W, names = data or load()
    out_dir = dataset_dir('tw_strategy', clean=False)
    results = {}
    for st in STRATEGIES:
        if keys and st['key'] not in keys:
            continue
        res = build(W, names, st)
        results[st['key']] = res
        if out is None:
            write_json(out_dir / f"{st['key']}.json", encrypt({**res, 'info': st['info']}, st['password']) if st.get('password') else res)
        T = [t for t in res['trades'] if t[5] != 'open']
        r = np.array([t[4] for t in T])
        sk = pd.Series([b[3] for b in res['skipped']]).value_counts().to_dict()
        print(f"{st['key']}({st['side']}) {res['d'][0]} ~ {res['asof']}：延後進場 {sum(t[8] > 0 for t in res['trades'])} 筆、取消 {sk}、買不到一股 {res['nocash']} 筆、"
              f"延後出場 {sum(t[7] > 0 for t in T)} 筆；{len(T)} 筆已出場，勝率 {(r > 0).mean():.1%}，平均 {r.mean():+.2%}(扣成本)；"
              f"組合 {res['nav']['s'][-1]:.2f} 倍(0050 {res['nav']['b0050'][-1]:.2f} 倍)，每筆上限 {res['cap']:.0%}")
    return results


if __name__ == '__main__':
    main(sys.argv[1:] or None)
