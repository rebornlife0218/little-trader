/* 選擇權共用工具(LTOpt)：Black-Scholes 定價與 Greeks、策略定義、資料載入
   三個頁面(市場概況、Black-Scholes 計算器、策略損益圖)都靠這支，要先於它們載入。
   資料集：data/options/(pipeline/options/update.py)、data/indices/TAIEX.json(現貨價) */
const LTOpt = (() => {
  const MULT = 50;            // 臺指選擇權每點 50 元
  const R_DEFAULT = 0.017;    // 預設無風險利率(約一年期定存)

  /* ---------- 常態分配 ---------- */
  const npdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  function ncdf(x) {   // Abramowitz & Stegun 26.2.17，誤差 < 7.5e-8
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const p = npdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
  }

  /* ---------- Black-Scholes ----------
     S 現貨、K 履約價、T 年、r 無風險利率、v 波動率(皆為小數)；type 'C' 買權 / 'P' 賣權 */
  function d12(S, K, T, r, v) {
    const sd = v * Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / sd;
    return [d1, d1 - sd];
  }
  function price(type, S, K, T, r, v) {
    if (T <= 0 || v <= 0) return Math.max(type === 'C' ? S - K * Math.exp(-r * Math.max(T, 0)) : K * Math.exp(-r * Math.max(T, 0)) - S, 0);
    const [d1, d2] = d12(S, K, T, r, v), df = Math.exp(-r * T);
    return type === 'C' ? S * ncdf(d1) - K * df * ncdf(d2) : K * df * ncdf(-d2) - S * ncdf(-d1);
  }
  // theta 為每日、vega 與 rho 為每 1%(與一般報價軟體相同)
  function greeks(type, S, K, T, r, v) {
    if (T <= 0 || v <= 0) return { delta: type === 'C' ? +(S > K) : -(S < K), gamma: 0, theta: 0, vega: 0, rho: 0 };
    const [d1, d2] = d12(S, K, T, r, v), df = Math.exp(-r * T), sq = Math.sqrt(T);
    const gamma = npdf(d1) / (S * v * sq), vega = S * npdf(d1) * sq / 100;
    if (type === 'C') return { delta: ncdf(d1), gamma, vega,
      theta: (-S * npdf(d1) * v / (2 * sq) - r * K * df * ncdf(d2)) / 365, rho: K * T * df * ncdf(d2) / 100 };
    return { delta: ncdf(d1) - 1, gamma, vega,
      theta: (-S * npdf(d1) * v / (2 * sq) + r * K * df * ncdf(-d2)) / 365, rho: -K * T * df * ncdf(-d2) / 100 };
  }
  function impliedVol(type, p, S, K, T, r) {
    let lo = 1e-4, hi = 3;
    if (!(price(type, S, K, T, r, lo) < p && p < price(type, S, K, T, r, hi))) return null;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (price(type, S, K, T, r, m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /* ---------- 策略 ----------
     legs：type 'C' 買權 / 'P' 賣權 / 'F' 標的(小型台指期貨，每點 50 元，與選擇權乘數相同)
           side +1 買進 / -1 賣出、qty 口數、k 使用第幾個履約價(1~4，由低到高)
     strikes：預設履約價相對價平的檔數(每檔 = 履約價間距 × step) */
  const STRATEGIES = [
    { group: '基本', key: 'long-call', name: '買進買權 Long Call', view: '看大漲', legs: [{ type: 'C', side: 1, k: 1 }], strikes: [0] },
    { group: '基本', key: 'short-call', name: '賣出買權 Short Call', view: '看不漲', legs: [{ type: 'C', side: -1, k: 1 }], strikes: [0] },
    { group: '基本', key: 'long-put', name: '買進賣權 Long Put', view: '看大跌', legs: [{ type: 'P', side: 1, k: 1 }], strikes: [0] },
    { group: '基本', key: 'short-put', name: '賣出賣權 Short Put', view: '看不跌', legs: [{ type: 'P', side: -1, k: 1 }], strikes: [0] },
    { group: '搭配標的', key: 'protective-put', name: '保護性賣權 Protective Put', view: '持有多單，避免大跌', legs: [{ type: 'F', side: 1 }, { type: 'P', side: 1, k: 1 }], strikes: [-1] },
    { group: '搭配標的', key: 'covered-call', name: '掩護性買權 Covered Call', view: '持有多單，預期盤整', legs: [{ type: 'F', side: 1 }, { type: 'C', side: -1, k: 1 }], strikes: [1] },
    { group: '搭配標的', key: 'protective-call', name: '保護性買權 Protective Call', view: '持有空單，避免大漲', legs: [{ type: 'F', side: -1 }, { type: 'C', side: 1, k: 1 }], strikes: [1] },
    { group: '搭配標的', key: 'covered-put', name: '掩護性賣權 Covered Put', view: '持有空單，預期盤整', legs: [{ type: 'F', side: -1 }, { type: 'P', side: -1, k: 1 }], strikes: [-1] },
    { group: '波動率', key: 'long-straddle', name: '買進跨式 Long Straddle', view: '看大漲或大跌(波動變大)', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'P', side: 1, k: 1 }], strikes: [0] },
    { group: '波動率', key: 'short-straddle', name: '賣出跨式 Short Straddle', view: '看盤整(波動變小)', legs: [{ type: 'C', side: -1, k: 1 }, { type: 'P', side: -1, k: 1 }], strikes: [0] },
    { group: '波動率', key: 'long-strangle', name: '買進勒式 Long Strangle', view: '看大漲或大跌，成本較跨式低', legs: [{ type: 'P', side: 1, k: 1 }, { type: 'C', side: 1, k: 2 }], strikes: [-2, 2] },
    { group: '波動率', key: 'short-strangle', name: '賣出勒式 Short Strangle', view: '看區間盤整', legs: [{ type: 'P', side: -1, k: 1 }, { type: 'C', side: -1, k: 2 }], strikes: [-2, 2] },
    { group: '波動率', key: 'strap', name: '買進 Strap', view: '看大波動，偏多', legs: [{ type: 'C', side: 1, qty: 2, k: 1 }, { type: 'P', side: 1, k: 1 }], strikes: [0] },
    { group: '波動率', key: 'strip', name: '買進 Strip', view: '看大波動，偏空', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'P', side: 1, qty: 2, k: 1 }], strikes: [0] },
    { group: '價差', key: 'bull-call', name: '買權多頭價差 Bull Call Spread', view: '溫和看漲', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'C', side: -1, k: 2 }], strikes: [0, 3] },
    { group: '價差', key: 'bull-put', name: '賣權多頭價差 Bull Put Spread', view: '溫和看漲(收權利金)', legs: [{ type: 'P', side: 1, k: 1 }, { type: 'P', side: -1, k: 2 }], strikes: [-3, 0] },
    { group: '價差', key: 'bear-call', name: '買權空頭價差 Bear Call Spread', view: '溫和看跌(收權利金)', legs: [{ type: 'C', side: -1, k: 1 }, { type: 'C', side: 1, k: 2 }], strikes: [0, 3] },
    { group: '價差', key: 'bear-put', name: '賣權空頭價差 Bear Put Spread', view: '溫和看跌', legs: [{ type: 'P', side: -1, k: 1 }, { type: 'P', side: 1, k: 2 }], strikes: [-3, 0] },
    { group: '價差', key: 'call-butterfly', name: '買權蝶式 Long Call Butterfly', view: '看小區間盤整', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'C', side: -1, qty: 2, k: 2 }, { type: 'C', side: 1, k: 3 }], strikes: [-3, 0, 3] },
    { group: '價差', key: 'put-butterfly', name: '賣權蝶式 Long Put Butterfly', view: '看小區間盤整', legs: [{ type: 'P', side: 1, k: 1 }, { type: 'P', side: -1, qty: 2, k: 2 }, { type: 'P', side: 1, k: 3 }], strikes: [-3, 0, 3] },
    { group: '價差', key: 'call-condor', name: '買權兀鷹 Long Call Condor', view: '看區間盤整', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'C', side: -1, k: 2 }, { type: 'C', side: -1, k: 3 }, { type: 'C', side: 1, k: 4 }], strikes: [-4, -1, 1, 4] },
    { group: '價差', key: 'put-condor', name: '賣權兀鷹 Long Put Condor', view: '看區間盤整', legs: [{ type: 'P', side: 1, k: 1 }, { type: 'P', side: -1, k: 2 }, { type: 'P', side: -1, k: 3 }, { type: 'P', side: 1, k: 4 }], strikes: [-4, -1, 1, 4] },
    { group: '價差', key: 'iron-condor', name: '鐵兀鷹 Iron Condor', view: '看區間盤整(收權利金)', legs: [{ type: 'P', side: 1, k: 1 }, { type: 'P', side: -1, k: 2 }, { type: 'C', side: -1, k: 3 }, { type: 'C', side: 1, k: 4 }], strikes: [-4, -1, 1, 4] },
    { group: '價差', key: 'box', name: '箱型價差 Box Spread', view: '套利：到期損益固定', legs: [{ type: 'C', side: 1, k: 1 }, { type: 'C', side: -1, k: 2 }, { type: 'P', side: 1, k: 2 }, { type: 'P', side: -1, k: 1 }], strikes: [-2, 2] },
  ];
  // 單一部位在到期時(T = 0)或之前的價值；entry 為進場價格(權利金或期貨成交價)
  function legValue(leg, S, T, r, v) {
    if (leg.type === 'F') return S;
    return T > 0 ? price(leg.type, S, leg.K, T, r, v) : Math.max(leg.type === 'C' ? S - leg.K : leg.K - S, 0);
  }
  const pnl = (legs, S, T, r, v) => legs.reduce((a, l) => a + l.side * (l.qty || 1) * (legValue(l, S, T, r, l.iv || v) - l.entry), 0);

  /* ---------- 資料 ---------- */
  async function load() {
    const [chain, hist, taiex] = await Promise.all([
      LT.loadJSON('options', 'chain.json'), LT.loadJSON('options', 'history.json'),
      LT.loadJSON('indices', 'TAIEX.json').catch(() => null),
    ]);
    const spot = taiex ? { date: taiex.data.d[taiex.data.d.length - 1], close: taiex.data.c[taiex.data.c.length - 1], data: taiex.data } : null;
    return { meta: chain.meta, chain: chain.data, hist: hist.data, spot };
  }
  // 契約代碼 → 中文：202610 → 2026/10 月契約、202610W2 → 10 月第 2 週(三)、202610F2 → 10 月第 2 週(五)
  function codeName(code) {
    const m = +code.slice(4, 6), kind = code[6], n = code[7];
    if (!kind) return `${code.slice(0, 4)}/${code.slice(4, 6)} 月契約`;
    return `${m} 月第 ${n} 週(${kind === 'F' ? '五' : '三'})`;
  }

  const fmt = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const pct = (v, d = 1) => Number.isFinite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tex = s => window.katex ? katex.renderToString(s, { displayMode: true, throwOnError: false }) : esc(s);
  const errorPanel = msg => `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(msg)}</p></div></div>`;

  return { MULT, R_DEFAULT, npdf, ncdf, price, greeks, impliedVol, STRATEGIES, legValue, pnl, load, codeName, fmt, pct, esc, tex, errorPanel };
})();
