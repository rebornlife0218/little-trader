/* ETF 區塊共用(ETF介紹、怎麼存ETF、ETF研究三個頁面)：格式化、報酬統計、滾動期間比較、配息課稅試算、載入常存 ETF 資料
   頁面：intro.js(etf/intro)、save.js(etf/save)、research.js(etf/research，目錄頁)；舊網址 etf/pack(ETF大禮包)轉到新頁面
   資料集：data/etf_compare/(compare.json、etfs.json；pipeline/etf_compare/update.py)、data/etf_research/(etf_follow.json) */
window.LTETF = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pctf = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const ym = m => m.replace('-', '/');

  /* ---------- 計算工具 ---------- */
  function statsOf(rets, perYear) {
    const n = rets.length; if (!n) return {};
    const cum = rets.reduce((v, r) => v * (1 + r), 1) - 1, m = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / Math.max(1, n - 1));
    let peak = 1, v = 1, mdd = 0;
    rets.forEach(r => { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    return { cum, cagr: (1 + cum) ** (perYear / n) - 1, vol: sd * Math.sqrt(perYear), mdd };
  }
  const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sab / Math.sqrt(sa * sb); };
  const growth = rets => { let v = 1; return rets.map(r => (v *= 1 + r)); };
  // 月底取樣：回傳 {m: ['YYYY-MM'…], c: [...], a: [...]}
  function monthly(dd) {
    const out = { m: [], c: [], a: [], i: [] };
    dd.d.forEach((d, i) => {
      const k = d.slice(0, 7);
      if (out.m[out.m.length - 1] === k) { out.c[out.c.length - 1] = dd.c[i]; out.a[out.a.length - 1] = dd.a[i]; out.i[out.i.length - 1] = i; }
      else { out.m.push(k); out.c.push(dd.c[i]); out.a.push(dd.a[i]); out.i.push(i); }
    });
    return out;
  }

  /* 單筆投入(LSI) vs 定期定額(DCA) vs 逢低買入(BTD)：仿 PWL Capital 的滾動期間比較
     P：月底的總報酬指數(或價格指數)；H：持有年數；dcaN：定期定額分幾個月投入；dip：逢低買入的跌幅門檻
     cash：等待投入的現金每月利率；每個起點 t 都比較 t ～ t + 12H 的年化報酬
     H = 0 代表「持有至今」：每個起點都持有到最後一個月，持有期間各不相同(至少 MIN_NOW 個月) */
  const MIN_NOW = 36;
  function rollingStudy(P, H, dcaN, dips, cashYear) {
    const n = P.length, r = (1 + cashYear) ** (1 / 12) - 1;
    const ath = []; P.forEach((v, i) => ath.push(Math.max(v, i ? ath[i - 1] : v)));   // 歷史高點(到當月為止)
    const out = [];
    for (let t = 0; t < n; t++) {
      const m = H ? H * 12 : n - 1 - t;
      if (H ? t + m >= n : m < Math.max(MIN_NOW, dcaN)) break;
      const end = t + m, yrs = m / 12, ann = v => v ** (1 / yrs) - 1;
      const lsi = ann(P[end] / P[t]);
      // 定期定額：每月投入 1/dcaN，還沒投入的錢放現金賺利息
      let dcaV = 0;
      for (let k = 0; k < dcaN; k++) dcaV += (1 / dcaN) * (1 + r) ** k * P[end] / P[t + k];
      const btd = dips.map(d => {
        let buy = -1;
        for (let k = t; k <= end; k++) if (P[k] <= (1 - d) * ath[k]) { buy = k; break; }
        return buy < 0 ? ann((1 + r) ** m) : ann((1 + r) ** (buy - t) * P[end] / P[buy]);   // 沒跌到門檻就一直拿著現金
      });
      const btdNow = dips.map(d => P[t] <= (1 - d) * ath[t]);   // 起點當月已經跌超過門檻：立刻進場，和單筆相同
      out.push({ t, lsi, dca: ann(dcaV), btd, btdNow });
    }
    return out;
  }
  const pctl = (arr, q) => { const a = [...arr].sort((x, y) => x - y), i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); };

  /* ETF 配息課稅試算(115 年度數額，財政部 114/11/27 公告) */
  const TAX = {
    year: 115, exempt: 101000, std: 136000, salary: 227000, savings: 270000,
    credit: 0.085, creditCap: 80000, sep: 0.28, nhi: 0.0211, nhiMin: 20000,
    // [所得淨額上限, 稅率, 累進差額]
    brackets: [[610000, 0.05, 0], [1380000, 0.12, 42700], [2770000, 0.2, 153100], [5190000, 0.3, 430100], [Infinity, 0.4, 949100]],
  };
  const progTax = net => { if (net <= 0) return 0; const b = TAX.brackets.find(x => net <= x[0]); return net * b[1] - b[2]; };
  const rateOf = net => (TAX.brackets.find(x => Math.max(net, 0) <= x[0]) || TAX.brackets[0])[1];
  // 回傳合併計稅(A)與分開計稅(B)的應納稅額；負數 = 退稅
  function taxCase(o, div) {
    const n = o.married ? 2 : 1;
    const exempt = (n + o.deps) * TAX.exempt, std = TAX.std * n;
    const salDed = Math.min(o.sal1, TAX.salary) + (o.married ? Math.min(o.sal2, TAX.salary) : 0);
    const savDed = Math.min(o.int, TAX.savings);
    const base = o.sal1 + (o.married ? o.sal2 : 0) + o.int - exempt - std - salDed - savDed;
    const netA = Math.max(0, base + div), netB = Math.max(0, base);
    const credit = Math.min(div * TAX.credit, TAX.creditCap);
    return { netA, netB, credit, A: progTax(netA) - credit, B: progTax(netB) + div * TAX.sep };
  }
  const best = c => Math.min(c.A, c.B);

  // 怎麼存ETF 與 ETF研究共用：常存 ETF 比較(etf_compare)與長期回測用的加權報酬指數(含股息，2003 起)、加權指數(不含股息，1999 起)
  // 回傳 { C, E, twList(台幣計價的常存 ETF), MO(各檔月底資料), colorOf(代號 → 顏色), failed(載入失敗時的畫面) }
  async function load() {
    let C = null, E = null, loadErr = '';
    try {
      [C, E] = await Promise.all([LT.loadJSON('etf_compare', 'compare.json').then(r => r.data), LT.loadJSON('etf_compare', 'etfs.json').then(r => r.data)]);
      await Promise.all([['taiex', 'TAIEX.json'], ['taiex_tr', 'TAIEX_TR.json']].map(([k, f]) => LT.loadJSON('indices', f).then(r => { E[k] = r.data; }).catch(() => {})));
    } catch (err) { loadErr = err.message; C = E = null; }
    const twList = E ? E.list.filter(x => x.currency === 'TWD') : [];
    const COLORS = ['var(--amber)', 'var(--blue)', 'var(--up)', 'var(--down)', 'var(--ma20)', 'var(--ma120)', 'var(--ma240)'];
    const colorOf = code => COLORS[twList.findIndex(x => x.code === code) % COLORS.length];
    const MO = {}; if (E) E.list.forEach(x => { MO[x.code] = monthly(E.daily[x.code]); });
    const failed = `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(loadErr)}</p></div></div>`;
    return { C, E, twList, MO, colorOf, failed };
  }

  return { esc, pctf, cls, ym, statsOf, corr, growth, monthly, MIN_NOW, rollingStudy, pctl, TAX, taxCase, best, rateOf, load };
})();
