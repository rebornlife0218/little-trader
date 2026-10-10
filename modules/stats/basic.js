/* 統計學 · 初級統計學
   給第一次修統計學的學生：13 章架構參考大碩補習班張翔老師的統計學課程(編排略有調整)，
   並用本站的台股加權指數資料做「市場實例」，部分章節附互動模擬。
   網址：#/stats/basic/<章節編號>
   章節內容可寫在 content/stats/basic/*.md(設定 md 欄位)，編輯方式見 content/README.md */
(() => {
  const ST = 'https://seeing-theory.brown.edu/';
  const BOOKS = [
    ['Freedman, Pisani & Purves', '《Statistics》', '觀念導向、少公式，最適合第一次接觸統計的入門經典'],
    ['Moore, McCabe & Craig', '《Introduction to the Practice of Statistics》', '大學統計課最常用的教科書之一，資料分析與推論並重'],
    ['Anderson, Sweeney & Williams', '《Statistics for Business and Economics》', '商管學院常用，例題多與企業、經濟、財務相關'],
    ['林惠玲、陳正倉', '《統計學：方法與應用》', '國內大學常用的中文教材，觀念與計算練習完整'],
  ];

  /* ---------- 小工具 ---------- */
  const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
  const pc = (v, d = 2) => Number.isFinite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const quantile = (a, q) => { const b = [...a].sort((x, y) => x - y), pos = (b.length - 1) * q, lo = Math.floor(pos); return b[lo] + (b[Math.min(lo + 1, b.length - 1)] - b[lo]) * (pos - lo); };
  const skew = a => { const m = mean(a), s = sd(a); return a.reduce((x, y) => x + ((y - m) / s) ** 3, 0) / a.length; };
  const exKurt = a => { const m = mean(a), s = sd(a); return a.reduce((x, y) => x + ((y - m) / s) ** 4, 0) / a.length - 3; };
  // 標準常態累積機率(Abramowitz & Stegun 7.1.26 近似)
  const normCdf = z => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2; };
  // 卡方、t、F 分配的右尾機率(Lanczos 對數伽瑪＋不完全伽瑪/貝塔函數，Numerical Recipes 演算法)
  const lnGamma = z => { const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i); const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); };
  const TINY = 1e-300;
  const gammaP = (a, x) => { if (x <= 0) return 0; const lead = Math.exp(-x + a * Math.log(x) - lnGamma(a));
    if (x < a + 1) { let ap = a, del = 1 / a, sum = del; for (let i = 0; i < 500 && Math.abs(del) > Math.abs(sum) * 1e-15; i++) { ap++; del *= x / ap; sum += del; } return sum * lead; }
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < TINY) d = TINY; c = b + an / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
    return 1 - lead * h; };
  const betaCf = (a, b, x) => { let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
    for (let m = 1; m < 500; m++) { const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2)); d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
    return h; };
  const betaI = (a, b, x) => { if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betaCf(a, b, x) / a : 1 - bt * betaCf(b, a, 1 - x) / b; };
  const chi2Sf = (x, k) => 1 - gammaP(k / 2, x / 2);
  const fSf = (f, d1, d2) => betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
  const tTwoSided = (t, df) => betaI(df / 2, 0.5, df / (df + t * t));
  const pv = p => p < 0.0001 ? '&lt; 0.0001' : fmt(p, 4);
  const returns = rows => rows.slice(1).map((r, i) => r.close / rows[i].close - 1);
  async function loadIndex(key) {
    const { data } = await LT.loadJSON('indices', key + '.json');
    return data.d.map((d, i) => ({ date: d, close: data.c[i] }));
  }
  const formula = s => `<div class="formula">${s}</div>`;
  // 文氏圖：kind = inter 交集 / union 聯集 / comp 補集 / diff 差集 / disjoint 互斥，著色部分為該事件
  function venn(kind, caption) {
    const id = 'venn-' + kind, apart = kind === 'disjoint';
    const A = apart ? 'cx="58" cy="62" r="30"' : 'cx="72" cy="62" r="36"', B = apart ? 'cx="122" cy="62" r="30"' : 'cx="108" cy="62" r="36"';
    const fill = 'fill="var(--amber)" fill-opacity=".55"';
    const shade = {
      inter: `<clipPath id="${id}"><circle ${B}/></clipPath><circle ${A} ${fill} clip-path="url(#${id})"/>`,
      union: `<g opacity=".55"><circle ${A} fill="var(--amber)"/><circle ${B} fill="var(--amber)"/></g>`,
      comp: `<mask id="${id}"><rect x="0" y="0" width="180" height="124" fill="#fff"/><circle ${A} fill="#000"/></mask><rect x="4" y="4" width="172" height="116" rx="6" ${fill} mask="url(#${id})"/>`,
      diff: `<mask id="${id}"><circle ${A} fill="#fff"/><circle ${B} fill="#000"/></mask><rect x="0" y="0" width="180" height="124" ${fill} mask="url(#${id})"/>`,
      disjoint: `<circle ${A} ${fill}/><circle ${B} ${fill}/>`,
    }[kind];
    const ax = apart ? 58 : 60, bx = apart ? 122 : 120;
    return `<figure class="venn"><svg viewBox="0 0 180 124" role="img" aria-label="${caption.replace(/<[^>]+>/g, ' ')}">
      <rect x="4" y="4" width="172" height="116" rx="6" fill="none" stroke="var(--border-strong)"/>${shade}
      <circle ${A} fill="none" stroke="var(--text)" stroke-width="1.3"/><circle ${B} fill="none" stroke="var(--text)" stroke-width="1.3"/>
      <text x="14" y="20" font-size="12" fill="var(--mute)">S</text>
      <text x="${ax}" y="66" font-size="13" font-weight="700" text-anchor="middle" fill="var(--text)">A</text>
      <text x="${bx}" y="66" font-size="13" font-weight="700" text-anchor="middle" fill="var(--text)">B</text>
    </svg><figcaption>${caption}</figcaption></figure>`;
  }
  const stLink = (path, name) => `<a href="${ST}${path}/index.html" target="_blank" rel="noopener">Seeing Theory · ${name} ↗</a>`;

  // 直方圖(SVG)＋常態曲線
  function histogramSVG(data, { lo, hi, step, normal, tick = x => (x * 100).toFixed(1) + '%' }) {
    const bins = []; for (let x = lo; x < hi - 1e-12; x += step) bins.push({ x, n: 0 });
    data.forEach(v => { const i = Math.floor((v - lo) / step); if (i >= 0 && i < bins.length) bins[i].n++; });
    const W = 640, H = 220, padL = 8, padB = 22, maxN = Math.max(...bins.map(b => b.n)), bw = (W - padL * 2) / bins.length;
    const yScale = n => (H - padB - 8) * n / maxN;
    let g = bins.map((b, i) => `<rect x="${padL + i * bw + 0.5}" y="${H - padB - yScale(b.n)}" width="${Math.max(bw - 1, 1)}" height="${yScale(b.n)}" fill="var(--blue)" opacity=".75"/>`).join('');
    if (normal) {
      const { m, s } = normal, total = data.length;
      const pts = []; for (let k = 0; k <= 200; k++) { const x = lo + (hi - lo) * k / 200; const dens = Math.exp(-(((x - m) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI)); pts.push(`${padL + (x - lo) / step * bw},${H - padB - yScale(dens * total * step)}`); }
      g += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--amber)" stroke-width="2"/>`;
    }
    const ticks = []; for (let x = lo; x <= hi + 1e-12; x += (hi - lo) / 6) ticks.push(x);
    g += ticks.map(x => `<text x="${padL + (x - lo) / step * bw}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--mute)">${tick(x)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="直方圖">${g}</svg>`;
  }

  /* ---------- Markdown 章節：content/stats/basic/<名稱>.md ----------
     $...$ 行內公式、$$...$$ 獨立公式(KaTeX)；> 引言顯示為提示框；單獨一行的圖片會加上圖說 */
  const MD_DIR = 'content/stats/basic/';
  async function loadChapter(name) {
    const r = await fetch(MD_DIR + name + '.md', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // 先把程式碼收起來(R 的 birthwt$bwt 不是公式)，再把公式換成佔位符，避免被 Markdown 改寫
    const code = [], math = [], vennRows = [];
    const inlineTex = s => s.replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t, { throwOnError: false }));
    let src = (await r.text()).replace(/<!--[\s\S]*?-->/g, '')
      .replace(/```[\s\S]*?```|`[^`\n]+`/g, m => `%%CODE${code.push(m) - 1}%%`)
      // 文氏圖：[[venn 種類|標題|說明]]，種類 = inter / union / comp / diff / disjoint；連續多行排成一列
      .replace(/(?:^\[\[venn .+\]\][ \t]*(?:\r?\n|$))+/gm, block => {
        const figs = block.trim().split(/\r?\n/).map(line => {
          const [kind, title, note] = line.trim().slice(7, -2).split('|');
          return venn(kind.trim(), inlineTex(title.trim()) + (note ? `<br><small>${inlineTex(note.trim())}</small>` : ''));
        });
        return `\n%%VENN${vennRows.push(`<div class="venn-row">${figs.join('')}</div>`) - 1}%%\n\n`;
      })
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => `\n\n%%MATH${math.push([t, true]) - 1}%%\n\n`)
      .replace(/\\\$/g, '%%DOLLAR%%')
      .replace(/\$([^$\n]+?)\$/g, (_, t) => `%%MATH${math.push([t, false]) - 1}%%`)
      .replace(/%%CODE(\d+)%%/g, (_, i) => code[i]);
    const tex = ([t, display]) => katex.renderToString(t, { displayMode: display, throwOnError: false });
    const html = marked.parse(src)
      .replace(/<p>%%MATH(\d+)%%<\/p>/g, (_, i) => tex(math[i]))
      .replace(/%%MATH(\d+)%%/g, (_, i) => tex(math[i]))
      .replace(/<p>%%VENN(\d+)%%<\/p>/g, (_, i) => vennRows[i])
      .replace(/%%DOLLAR%%/g, '$');
    const box = document.createElement('div');
    box.innerHTML = html;
    box.querySelectorAll('img').forEach(img => {
      const s = img.getAttribute('src');
      if (!/^(https?:|\/|data:)/.test(s)) img.setAttribute('src', MD_DIR + s);
      img.loading = 'lazy';
      const p = img.parentElement;
      if (p.tagName === 'P' && p.childNodes.length === 1) {
        const fig = document.createElement('figure');
        fig.className = 'md-fig';
        fig.innerHTML = `<figcaption></figcaption>`;
        fig.querySelector('figcaption').textContent = img.alt;
        fig.prepend(img);
        p.replaceWith(fig);
      }
    });
    box.querySelectorAll('blockquote').forEach(q => q.classList.add('callout'));
    box.querySelectorAll('table').forEach(t => { t.classList.add('stattable', 'md-table'); t.outerHTML = `<div class="tablewrap">${t.outerHTML}</div>`; });
    // 章名已是 h2：Markdown 的 ## → h3(大節)、### → h4(小節)
    const retag = (sel, tag, cls) => box.querySelectorAll(sel).forEach(h => { const e = document.createElement(tag); e.className = cls; e.innerHTML = h.innerHTML; h.replaceWith(e); });
    retag('h3', 'h4', 'md-h3');
    retag('h2', 'h3', 'md-h2');
    return box.innerHTML;
  }

  /* ---------- 章節(架構參考大碩補習班張翔老師的統計學課程，編排略有調整) ---------- */
  // 各章內容在 content/stats/basic/chNN.md(Markdown＋LaTeX 公式，編輯方式見 content/README.md)
  const CHAPTERS = [
    {
      title: '概論及敘述統計學', md: 'ch01', live: 'describe',
    },
    {
      title: '機率', md: 'ch02', st: ['basic-probability', 'Basic Probability'], demo: ['dice', 'coin'],
    },
    {
      title: '隨機變數', md: 'ch03', st: ['probability-distributions', 'Probability Distributions'],
    },
    {
      title: '多元隨機變數', md: 'ch04', st: null, live: 'cov',
    },
    {
      title: '常見機率模型', md: 'ch05', st: ['probability-distributions', 'Probability Distributions'], live: 'normal',
    },
    {
      title: '抽樣方法與抽樣分配', md: 'ch06', st: null, demo: 'clt',
    },
    {
      title: '點估計', md: 'ch07', st: ['frequentist-inference', 'Frequentist Inference'],
    },
    {
      title: '區間估計', md: 'ch08', st: ['frequentist-inference', 'Frequentist Inference'], live: 'ci',
    },
    {
      title: '假說檢定', md: 'ch09', st: null, live: 'ttest',
    },
    {
      title: '變異數分析', md: 'ch10', st: null, live: 'anova',
    },
    {
      title: '線性迴歸', md: 'ch11', st: ['regression-analysis', 'Regression Analysis'], live: 'regress',
    },
    {
      title: '卡方檢定', md: 'ch12', st: null, live: 'chi2',
    },
    {
      title: '其他', md: 'ch13', st: ['bayesian-inference', 'Bayesian Inference'], live: 'runs',
    },
  ];

  /* ---------- 市場實例(用本站台股加權指數資料) ---------- */
  const LIVE = {
    async describe() {
      const rows = await loadIndex('TAIEX'), r = returns(rows);
      const m = mean(r), s = sd(r);
      return `<h3>市場實例 · 台股加權指數日報酬(${rows[0].date} ～ ${rows[rows.length - 1].date}，n = ${r.length})</h3>
        <table class="stattable"><tbody>
          <tr><td>平均數</td><td>${pc(m, 3)}</td><td>中位數</td><td>${pc(quantile(r, .5), 3)}</td></tr>
          <tr><td>標準差(日波動度)</td><td>${pc(s)}</td><td>年化波動度 ≈ s×√252</td><td>${pc(s * Math.sqrt(252), 1)}</td></tr>
          <tr><td>Q1 / Q3</td><td>${pc(quantile(r, .25))} / ${pc(quantile(r, .75))}</td><td>IQR</td><td>${pc(quantile(r, .75) - quantile(r, .25))}</td></tr>
          <tr><td>最小 / 最大</td><td>${pc(Math.min(...r))} / ${pc(Math.max(...r))}</td><td>上漲天數比例</td><td>${pc(r.filter(x => x > 0).length / r.length, 1)}</td></tr>
          <tr><td>偏態係數</td><td>${fmt(skew(r))}</td><td>超額峰度</td><td>${fmt(exKurt(r))}</td></tr>
        </tbody></table>
        ${histogramSVG(r, { lo: -0.06, hi: 0.06, step: 0.0025, normal: { m, s } })}
        <p class="note">藍色長條為實際日報酬的直方圖，橘線是相同平均與標準差的常態分配。超額峰度明顯大於 0：中間更集中、兩端尾巴更厚，這就是金融資料常見的「肥尾」。</p>`;
    },
    async normal() {
      const r = returns(await loadIndex('TAIEX')), m = mean(r), s = sd(r);
      const within = k => r.filter(x => Math.abs(x - m) <= k * s).length / r.length;
      const beyond3 = r.filter(x => Math.abs(x - m) > 3 * s).length;
      return `<h3>市場實例 · 台股日報酬符合 68–95–99.7 嗎？</h3>
        <table class="stattable"><thead><tr><th>範圍</th><th>常態分配理論值</th><th>台股實際</th></tr></thead><tbody>
          <tr><td>μ ± 1σ</td><td>68.3%</td><td>${pc(within(1), 1)}</td></tr>
          <tr><td>μ ± 2σ</td><td>95.4%</td><td>${pc(within(2), 1)}</td></tr>
          <tr><td>μ ± 3σ</td><td>99.7%</td><td>${pc(within(3), 1)}</td></tr>
          <tr><td>超過 ±3σ 的天數</td><td>約 ${Math.round(r.length * 0.0027)} 天</td><td>${beyond3} 天</td></tr>
        </tbody></table>
        <p class="note">實際落在 ±1σ 內的比例比常態多(中間更尖)，超過 ±3σ 的極端日也比常態預期多出好幾倍。用常態分配估計風險，會低估暴跌發生的機率。</p>`;
    },
    async ci() {
      const r = returns(await loadIndex('TAIEX')), n = r.length, m = mean(r), se = sd(r) / Math.sqrt(n);
      const recent = r.slice(-250), mr = mean(recent), ser = sd(recent) / Math.sqrt(recent.length);
      return `<h3>市場實例 · 台股平均日報酬的 95% 信賴區間</h3>
        <table class="stattable"><thead><tr><th>樣本</th><th>n</th><th>x̄</th><th>標準誤 s/√n</th><th>95% 信賴區間</th></tr></thead><tbody>
          <tr><td>全部歷史</td><td>${n}</td><td>${pc(m, 3)}</td><td>${pc(se, 3)}</td><td>${pc(m - 1.96 * se, 3)} ～ ${pc(m + 1.96 * se, 3)}</td></tr>
          <tr><td>最近 250 個交易日</td><td>${recent.length}</td><td>${pc(mr, 3)}</td><td>${pc(ser, 3)}</td><td>${pc(mr - 1.96 * ser, 3)} ～ ${pc(mr + 1.96 * ser, 3)}</td></tr>
        </tbody></table>
        <p class="note">樣本只有一年時，區間寬得多：短期的平均報酬充滿雜訊，很難精準估計。</p>`;
    },
    async ttest() {
      const r = returns(await loadIndex('TAIEX')), n = r.length, m = mean(r), s = sd(r), t = m / (s / Math.sqrt(n));
      const p = tTwoSided(t, n - 1);
      return `<h3>市場實例 · 台股長期平均日報酬顯著不為 0 嗎？</h3>
        ${formula(`H₀：μ = 0　H₁：μ ≠ 0　　t = ${pc(m, 4)} ÷ (${pc(s, 3)} ÷ √${n}) = ${fmt(t)}，df = ${n - 1}`)}
        <p>雙尾 p 值 = <b>${pv(p)}</b>，在 α = 0.05 下${p < 0.05 ? '<b>拒絕</b> H₀：長期平均日報酬顯著不為 0' : '<b>無法拒絕</b> H₀：沒有足夠證據說長期平均日報酬不為 0'}。</p>
        <p class="note">即使統計上顯著，平均日報酬只有約 ${pc(m, 3)}，遠小於單日波動 ${pc(s)}：「統計顯著」和「實務上好不好賺」是兩回事。</p>`;
    },
    async cov() {
      const [tw, jp] = await Promise.all([loadIndex('TAIEX'), loadIndex('NK225')]);
      // 只取兩邊都有開盤的日子，報酬算到「前一個共同交易日」
      const jpClose = new Map(jp.map(d => [d.date, d.close]));
      const both = tw.filter(d => jpClose.has(d.date));
      const xs = [], ys = [];
      for (let i = 1; i < both.length; i++) { xs.push(both[i].close / both[i - 1].close - 1); ys.push(jpClose.get(both[i].date) / jpClose.get(both[i - 1].date) - 1); }
      const n = xs.length, mx = mean(xs), my = mean(ys), sx = sd(xs), sy = sd(ys);
      const cv = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / (n - 1), rho = cv / (sx * sy);
      const port = xs.map((x, k) => (x + ys[k]) / 2);
      const formulaSd = Math.sqrt(0.25 * sx * sx + 0.25 * sy * sy + 0.5 * cv);
      return `<h3>市場實例 · 台股與日經的共變異數與一半一半的投資組合</h3>
        <table class="stattable"><tbody>
          <tr><td>共同交易日報酬筆數</td><td>${n}</td><td>相關係數 ρ</td><td>${fmt(rho, 3)}</td></tr>
          <tr><td>台股日標準差 σ₁</td><td>${pc(sx)}</td><td>日經日標準差 σ₂</td><td>${pc(sy)}</td></tr>
          <tr><td>共變異數 Cov</td><td>${(cv * 1e4).toFixed(3)} ×10⁻⁴</td><td>兩者標準差平均(ρ = 1 時的組合標準差)</td><td>${pc((sx + sy) / 2)}</td></tr>
          <tr><td>組合標準差(用公式 √(¼σ₁² + ¼σ₂² + ½Cov))</td><td>${pc(formulaSd)}</td><td>組合標準差(直接算組合報酬)</td><td>${pc(sd(port))}</td></tr>
        </tbody></table>
        <p class="note">兩種算法完全一樣，驗證了 Var(aX + bY) 的公式。因為 ρ 小於 1，組合的波動比「兩者標準差平均」低，這就是分散投資降低風險的來源。</p>`;
    },
    async anova() {
      const rows = await loadIndex('TAIEX'), r = returns(rows);
      const names = ['週一', '週二', '週三', '週四', '週五'], groups = names.map(() => []);
      rows.slice(1).forEach((d, i) => { const w = new Date(d.date + 'T00:00:00Z').getUTCDay(); if (w >= 1 && w <= 5) groups[w - 1].push(r[i]); });
      const all = groups.flat(), n = all.length, k = groups.length, gm = mean(all);
      const sstr = groups.reduce((a, g) => a + g.length * (mean(g) - gm) ** 2, 0);
      const sse = groups.reduce((a, g) => { const m = mean(g); return a + g.reduce((b, x) => b + (x - m) ** 2, 0); }, 0);
      const mstr = sstr / (k - 1), mse = sse / (n - k), F = mstr / mse, p = fSf(F, k - 1, n - k);
      const e = v => (v * 1e4).toFixed(4);
      return `<h3>市場實例 · 星期效應：台股週一到週五的平均報酬一樣嗎？</h3>
        <table class="stattable"><thead><tr><th>星期</th><th>n</th><th>平均日報酬</th><th>標準差</th></tr></thead><tbody>
          ${groups.map((g, i) => `<tr><td>${names[i]}</td><td>${g.length}</td><td>${pc(mean(g), 3)}</td><td>${pc(sd(g))}</td></tr>`).join('')}
        </tbody></table>
        <table class="stattable"><thead><tr><th>變異來源</th><th>SS(×10⁻⁴)</th><th>df</th><th>MS(×10⁻⁴)</th><th>F</th><th>p 值</th></tr></thead><tbody>
          <tr><td>組間(星期)</td><td>${e(sstr)}</td><td>${k - 1}</td><td>${e(mstr)}</td><td>${fmt(F, 3)}</td><td>${pv(p)}</td></tr>
          <tr><td>組內(誤差)</td><td>${e(sse)}</td><td>${n - k}</td><td>${e(mse)}</td><td></td><td></td></tr>
          <tr><td>總和</td><td>${e(sstr + sse)}</td><td>${n - 1}</td><td></td><td></td><td></td></tr>
        </tbody></table>
        <p class="note">H₀：五天的平均日報酬相等。在 α = 0.05 下${p < 0.05 ? '<b>拒絕</b> H₀，不同星期的平均報酬有顯著差異' : '<b>無法拒絕</b> H₀，沒有足夠證據說不同星期的平均報酬不同'}。注意組內變異遠大於組間變異：就算平均數有差，單日報酬的雜訊仍然大得多。(1999～2000 年間的週六交易日已排除)</p>`;
    },
    async chi2() {
      const r = returns(await loadIndex('TAIEX')).filter(v => v !== 0);
      const O = [[0, 0], [0, 0]]; // 列：前一日 漲/跌，行：當日 漲/跌
      for (let i = 1; i < r.length; i++) O[r[i - 1] > 0 ? 0 : 1][r[i] > 0 ? 0 : 1]++;
      const row = O.map(a => a[0] + a[1]), col = [O[0][0] + O[1][0], O[0][1] + O[1][1]], n = row[0] + row[1];
      const E = O.map((a, i) => a.map((_, j) => row[i] * col[j] / n));
      const x2 = O.reduce((s, a, i) => s + a.reduce((t, o, j) => t + (o - E[i][j]) ** 2 / E[i][j], 0), 0), p = chi2Sf(x2, 1);
      const cell = (i, j) => `${O[i][j]}<br><small class="mute">期望 ${E[i][j].toFixed(1)}</small>`;
      return `<h3>市場實例 · 台股今天漲跌和昨天漲跌獨立嗎？(2 × 2 獨立性檢定)</h3>
        <table class="stattable"><thead><tr><th></th><th>當日上漲</th><th>當日下跌</th><th>合計</th><th>P(上漲 | 前一日)</th></tr></thead><tbody>
          <tr><td>前一日上漲</td><td>${cell(0, 0)}</td><td>${cell(0, 1)}</td><td>${row[0]}</td><td>${pc(O[0][0] / row[0], 1)}</td></tr>
          <tr><td>前一日下跌</td><td>${cell(1, 0)}</td><td>${cell(1, 1)}</td><td>${row[1]}</td><td>${pc(O[1][0] / row[1], 1)}</td></tr>
          <tr><td>合計</td><td>${col[0]}</td><td>${col[1]}</td><td>${n}</td><td>${pc(col[0] / n, 1)}</td></tr>
        </tbody></table>
        ${formula(`χ² = Σ(O − E)² ÷ E = ${fmt(x2, 3)}，df = (2 − 1)(2 − 1) = 1，p 值 = ${pv(p)}`)}
        <p class="note">在 α = 0.05 下${p < 0.05 ? '<b>拒絕</b> H₀：前一日與當日的漲跌並不獨立，比較右欄兩個條件機率可以看出方向' : '<b>無法拒絕</b> H₀：沒有足夠證據說前一日漲跌會影響當日漲跌'}。(平盤日已排除)</p>`;
    },
    async runs() {
      const r = returns(await loadIndex('TAIEX')).filter(v => v !== 0), s = r.slice(-250).map(v => v > 0);
      const all = r.map(v => v > 0);
      const test = seq => { const n1 = seq.filter(Boolean).length, n2 = seq.length - n1, n = seq.length;
        let R = 1; for (let i = 1; i < n; i++) if (seq[i] !== seq[i - 1]) R++;
        const er = 2 * n1 * n2 / n + 1, vr = 2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1)), z = (R - er) / Math.sqrt(vr);
        return { n1, n2, R, er, z, p: 2 * (1 - normCdf(Math.abs(z))) }; };
      const rowOf = (name, t) => `<tr><td>${name}</td><td>${t.n1}</td><td>${t.n2}</td><td>${t.R}</td><td>${t.er.toFixed(1)}</td><td>${fmt(t.z)}</td><td>${pv(t.p)}</td></tr>`;
      const a = test(all), b = test(s);
      return `<h3>市場實例 · 台股每日漲跌是隨機的嗎？(連檢定)</h3>
        <table class="stattable"><thead><tr><th>樣本</th><th>上漲 n₁</th><th>下跌 n₂</th><th>連數 R</th><th>E[R]</th><th>Z</th><th>p 值</th></tr></thead><tbody>
          ${rowOf('全部歷史', a)}${rowOf('最近 250 個交易日', b)}
        </tbody></table>
        <p class="note">H₀：漲跌序列是隨機的。Z &lt; 0(連數比期望少)代表漲跌有「延續」的傾向，Z &gt; 0 代表傾向「反轉」。連檢定只看符號、不看漲跌幅大小，不需要報酬率服從常態分配。(平盤日已排除)</p>`;
    },
    async regress() {
      const [tw, us] = await Promise.all([loadIndex('TAIEX'), loadIndex('NASDAQ')]);
      // 台股當日報酬 vs 美股「前一個交易日」報酬(美股收盤在台股開盤之前)
      const usRet = new Map(); us.forEach((d, i) => { if (i > 0) usRet.set(d.date, d.close / us[i - 1].close - 1); });
      const usDates = us.map(d => d.date);
      const xs = [], ys = []; let j = 0;
      for (let i = 1; i < tw.length; i++) {
        while (j + 1 < usDates.length && usDates[j + 1] < tw[i].date) j++;
        if (usDates[j] < tw[i].date && usRet.has(usDates[j])) { xs.push(usRet.get(usDates[j])); ys.push(tw[i].close / tw[i - 1].close - 1); }
      }
      const mx = mean(xs), my = mean(ys), sx = sd(xs), sy = sd(ys);
      const r = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / ((xs.length - 1) * sx * sy);
      const b1 = r * sy / sx, b0 = my - b1 * mx;
      // 散佈圖(取最近 750 筆)
      const W = 360, H = 260, pad = 28, lim = 0.06, sc = v => (v + lim) / (2 * lim);
      const pts = xs.slice(-750).map((x, k) => { const y = ys.slice(-750)[k]; return Math.abs(x) < lim && Math.abs(y) < lim ? `<circle cx="${pad + sc(x) * (W - 2 * pad)}" cy="${H - pad - sc(y) * (H - 2 * pad)}" r="1.8" fill="var(--blue)" opacity=".5"/>` : ''; }).join('');
      const line = `<line x1="${pad}" y1="${H - pad - sc(b0 - b1 * lim) * (H - 2 * pad)}" x2="${W - pad}" y2="${H - pad - sc(b0 + b1 * lim) * (H - 2 * pad)}" stroke="var(--amber)" stroke-width="2"/>`;
      const axes = `<line x1="${pad}" y1="${H / 2}" x2="${W - pad}" y2="${H / 2}" stroke="var(--grid)"/><line x1="${W / 2}" y1="${pad}" x2="${W / 2}" y2="${H - pad}" stroke="var(--grid)"/>
        <text x="${W - pad}" y="${H / 2 - 4}" font-size="10" text-anchor="end" fill="var(--mute)">那斯達克前一日</text><text x="${W / 2 + 4}" y="${pad - 6}" font-size="10" fill="var(--mute)">台股當日</text>`;
      return `<h3>市場實例 · 美股前一晚的漲跌，能解釋台股當天多少？</h3>
        <div class="split">
          <svg viewBox="0 0 ${W} ${H}" class="chart-svg" style="max-width:${W}px">${axes}${pts}${line}</svg>
          <table class="stattable"><tbody>
            <tr><td>樣本數</td><td>${xs.length}</td></tr>
            <tr><td>相關係數 r</td><td>${fmt(r, 3)}</td></tr>
            <tr><td>斜率 b₁</td><td>${fmt(b1, 3)}</td></tr>
            <tr><td>截距 b₀</td><td>${pc(b0, 3)}</td></tr>
            <tr><td>R²</td><td>${pc(r * r, 1)}</td></tr>
          </tbody></table>
        </div>
        <p class="note">x＝那斯達克前一個交易日報酬，y＝台股加權當日報酬(散佈圖顯示最近 750 筆)。斜率 ${fmt(b1, 2)} 表示那斯達克前一晚每漲跌 1%，台股當天平均同向變動約 ${fmt(b1, 2)}%；R² 說明台股當日波動中約 ${pc(r * r, 0)} 能被這個因素解釋，其餘來自其他因素。</p>`;
    },
  };

  /* ---------- 互動模擬 ---------- */
  const DEMOS = {
    dice: {
      html: `<h3>互動模擬 · 擲骰子</h3>
        <div class="btnrow-l"><button onclick="LTStat.dice(1)">擲 1 次</button><button onclick="LTStat.dice(10)">擲 10 次</button><button onclick="LTStat.dice(100)">擲 100 次</button><button onclick="LTStat.dice(1000)">擲 1000 次</button><button onclick="LTStat.dice(0)">重來</button></div>
        <div id="diceOut" class="mute" style="margin-top:10px;">按下按鈕開始擲骰子</div>`,
    },
    coin: {
      html: `<h3>互動模擬 · 擲錢幣</h3>
        <div class="btnrow-l"><button onclick="LTStat.coin(1)">擲 1 次</button><button onclick="LTStat.coin(10)">擲 10 次</button><button onclick="LTStat.coin(100)">擲 100 次</button><button onclick="LTStat.coin(1000)">擲 1000 次</button><button onclick="LTStat.coin(0)">重來</button></div>
        <div id="coinOut" class="mute" style="margin-top:10px;">按下按鈕開始擲錢幣</div>`,
    },
    clt: {
      html: `<h3>互動模擬 · 中央極限定理(擲骰子取平均)</h3>
        <div class="btnrow-l">每次擲 <select id="cltN"><option>1</option><option>2</option><option selected>5</option><option>30</option></select> 顆骰子取平均，重複
          <button onclick="LTStat.clt(100)">100 次</button><button onclick="LTStat.clt(1000)">1000 次</button><button onclick="LTStat.clt(0)">重來</button></div>
        <div id="cltOut" style="margin-top:10px;"></div>`,
    },
  };
  // 骰子點數的 SVG(九宮格點位)
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieSVG = (v, size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${v} 點"><rect x="1.5" y="1.5" width="37" height="37" rx="7" fill="var(--panel)" stroke="var(--border-strong)" stroke-width="1.5"/>${PIPS[v].map(k => `<circle cx="${10 + (k % 3) * 10}" cy="${10 + Math.floor(k / 3) * 10}" r="3.4" fill="${v === 1 ? 'var(--up)' : 'var(--text)'}"/>`).join('')}</svg>`;
  // 錢幣的 SVG：正面金色、反面銀色
  const coinSVG = (h, size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${h ? '正面' : '反面'}"><circle cx="20" cy="20" r="18" fill="${h ? 'var(--amber)' : 'var(--dim)'}" stroke="var(--border-strong)" stroke-width="1.5"/><circle cx="20" cy="20" r="14" fill="none" stroke="var(--panel)" stroke-width="1" opacity=".6"/><text x="20" y="25.5" font-size="15" font-weight="700" text-anchor="middle" fill="var(--panel)">${h ? '正' : '反'}</text></svg>`;
  let diceRolls = [];
  let coinFlips = [];
  let cltMeans = [];
  window.LTStat = {
    dice(k) {
      if (k === 0) diceRolls = []; else for (let i = 0; i < k; i++) diceRolls.push(1 + Math.floor(Math.random() * 6));
      const el = document.getElementById('diceOut'); if (!el) return;
      const n = diceRolls.length;
      if (!n) { el.textContent = '按下按鈕開始擲骰子'; return; }
      const cnt = [0, 0, 0, 0, 0, 0]; diceRolls.forEach(v => cnt[v - 1]++);
      const even = cnt[1] + cnt[3] + cnt[5], last = diceRolls.slice(-k).slice(-12);
      const W = 640, H = 180, padB = 34, top = 18, bw = W / 6, maxC = Math.max(...cnt, n / 6 * 1.6);
      const y = c => H - padB - (H - padB - top) * c / maxC;
      const bars = cnt.map((c, i) => `<rect x="${i * bw + bw * 0.2}" y="${y(c)}" width="${bw * 0.6}" height="${H - padB - y(c)}" fill="var(--blue)" opacity=".75"/>
        <text x="${i * bw + bw / 2}" y="${y(c) - 5}" font-size="11" text-anchor="middle" fill="var(--text)">${c} 次(${(c / n * 100).toFixed(1)}%)</text>
        <text x="${i * bw + bw / 2}" y="${H - 12}" font-size="12" text-anchor="middle" fill="var(--mute)">${i + 1} 點</text>`).join('');
      el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${last.map((v, i) => dieSVG(v, i === last.length - 1 ? 48 : 34)).join('')}</div>
        <div>擲了 <b>${n}</b> 次，平均點數 <b>${(diceRolls.reduce((a, b) => a + b, 0) / n).toFixed(3)}</b>(期望值 3.5)，事件「擲出偶數」比例 <b>${(even / n * 100).toFixed(1)}%</b>(理論 50%)</div>
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg">${bars}<line x1="0" x2="${W}" y1="${y(n / 6)}" y2="${y(n / 6)}" stroke="var(--amber)" stroke-dasharray="4 3"/></svg>
        <div class="note">上方顯示這次擲出的骰子(最多 12 顆，最右邊較大的是最新一顆)。長條為各點數出現的次數，橘色虛線為期望次數 n × 1/6 = ${(n / 6).toFixed(1)}。次數少時長條高低不齊，擲越多次各點數的比例越接近 1/6 ≈ 16.7%(大數法則)。</div>`;
    },
    coin(k) {
      if (k === 0) coinFlips = []; else for (let i = 0; i < k; i++) coinFlips.push(Math.random() < 0.5 ? 1 : 0);
      const el = document.getElementById('coinOut'); if (!el) return;
      const n = coinFlips.length;
      if (!n) { el.textContent = '按下按鈕開始擲錢幣'; return; }
      const h = coinFlips.reduce((a, b) => a + b, 0), cnt = [h, n - h], last = coinFlips.slice(-k).slice(-12);
      const W = 640, H = 180, padB = 34, top = 18, bw = W / 2, maxC = Math.max(...cnt, n / 2 * 1.3);
      const y = c => H - padB - (H - padB - top) * c / maxC;
      const bars = cnt.map((c, i) => `<rect x="${i * bw + bw * 0.3}" y="${y(c)}" width="${bw * 0.4}" height="${H - padB - y(c)}" fill="${i ? 'var(--dim)' : 'var(--amber)'}" opacity=".8"/>
        <text x="${i * bw + bw / 2}" y="${y(c) - 5}" font-size="12" text-anchor="middle" fill="var(--text)">${c} 次(${(c / n * 100).toFixed(1)}%)</text>
        <text x="${i * bw + bw / 2}" y="${H - 12}" font-size="12" text-anchor="middle" fill="var(--mute)">${i ? '反面' : '正面'}</text>`).join('');
      el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${last.map((v, i) => coinSVG(v, i === last.length - 1 ? 48 : 34)).join('')}</div>
        <div>擲了 <b>${n}</b> 次，正面 <b>${h}</b> 次、反面 <b>${n - h}</b> 次，正面比例 <b>${(h / n * 100).toFixed(1)}%</b>(理論 50%)</div>
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg">${bars}<line x1="0" x2="${W}" y1="${y(n / 2)}" y2="${y(n / 2)}" stroke="var(--blue)" stroke-dasharray="4 3"/></svg>
        <div class="note">上方顯示這次擲出的錢幣(最多 12 枚，最右邊較大的是最新一枚)。長條為正面、反面出現的次數，藍色虛線為期望次數 n × 1/2 = ${(n / 2).toFixed(1)}。擲越多次，兩邊的比例越接近各 50%(大數法則)。</div>`;
    },
    clt(k) {
      const n = +document.getElementById('cltN').value;
      if (k === 0) cltMeans = []; else for (let i = 0; i < k; i++) { let sum = 0; for (let j = 0; j < n; j++) sum += 1 + Math.floor(Math.random() * 6); cltMeans.push(sum / n); }
      const el = document.getElementById('cltOut'); if (!el) return;
      if (!cltMeans.length) { el.innerHTML = '<span class="mute">選擇骰子數後按下按鈕</span>'; return; }
      el.innerHTML = `<div>已模擬 <b>${cltMeans.length}</b> 次，平均數的平均 <b>${mean(cltMeans).toFixed(3)}</b>(理論 3.5)，標準差 <b>${cltMeans.length > 1 ? sd(cltMeans).toFixed(3) : '—'}</b>(理論 1.708÷√n)</div>
        ${histogramSVG(cltMeans, { lo: 1, hi: 6.0001, step: 0.125, tick: x => x.toFixed(1) })}
        <div class="note">骰子數 1 時是平坦的均勻分配；骰子數越多，平均數的分布越像鐘形、也越集中在 3.5 附近。換骰子數前請先按「重來」。</div>`;
    },
  };

  /* ---------- 頁面 ---------- */
  LT.register({
    section: 'stats', key: 'basic', name: '初級統計學',
    async mount(el, ctx) {
      const n = parseInt((location.hash.split('/')[3] || '1'), 10);
      const idx = Math.min(Math.max(1, n || 1), CHAPTERS.length) - 1;
      const ch = CHAPTERS[idx];
      const nav = (i, label) => i < 0 || i >= CHAPTERS.length ? '<span></span>'
        : `<a class="chap-nav" href="#/stats/basic/${i + 1}">${label}</a>`;
      el.innerHTML = `
        <header class="top"><div>
          <h1>初級統計學</h1>
          <p>給第一次修統計學的你：觀念、公式、市場實例與互動模擬</p>
        </div></header>
        <div class="chap-list">
          ${CHAPTERS.map((c, i) => `<a href="#/stats/basic/${i + 1}" class="${i === idx ? 'active' : ''}"><span>${i + 1}</span>${c.title}</a>`).join('')}
        </div>
        <article class="panel doc chapter">
          <div class="chap-head">
            <h2>第 ${idx + 1} 章　${ch.title}</h2>
            ${ch.st ? `<div class="chap-st">搭配互動教材：${stLink(ch.st[0], ch.st[1])}</div>` : ''}
          </div>
          <div id="chapBody">${ch.md ? '<span class="mute">載入章節內容…</span>' : ch.body()}</div>
          ${[].concat(ch.demo || []).map(d => `<div class="demo-box">${DEMOS[d].html}</div>`).join('')}
          ${ch.live ? `<div class="live-box" id="liveBox"><span class="mute">正在用台股資料計算市場實例…</span></div>` : ''}
          <div class="chap-foot">${nav(idx - 1, '← 上一章')}${nav(idx + 1, '下一章 →')}</div>
        </article>
        <div class="panel doc">
          <h3>參考教材</h3>
          <ul>${BOOKS.map(b => `<li><b>${b[0]}</b> ${b[1]}：${b[2]}</li>`).join('')}
            <li><b>Seeing Theory</b>(布朗大學)：<a href="${ST}" target="_blank" rel="noopener">${ST} ↗</a> 互動視覺化教材，第 ${CHAPTERS.map((c, i) => c.st ? i + 1 : 0).filter(Boolean).join("、")} 章可搭配使用</li>
            <li>章節架構參考<b>大碩補習班 張翔老師</b>的統計學課程，編排略有調整</li></ul>
        </div>`;
      const demos = [].concat(ch.demo || []);
      if (demos.includes('dice')) diceRolls = [];
      if (demos.includes('coin')) coinFlips = [];
      if (demos.includes('clt')) { cltMeans = []; window.LTStat.clt(0); }
      if (ch.md) {
        const box = document.getElementById('chapBody');
        try {
          const html = await loadChapter(ch.md);
          if (!ctx.alive()) return;
          box.innerHTML = html;
        } catch (err) {
          if (!ctx.alive()) return;
          box.innerHTML = `<span class="mute">章節內容載入失敗：${err.message}</span>`;
        }
      }
      if (ch.live) {
        try {
          const html = await LIVE[ch.live]();
          if (!ctx.alive()) return;
          document.getElementById('liveBox').innerHTML = html;
        } catch (err) {
          if (!ctx.alive()) return;
          document.getElementById('liveBox').innerHTML = `<span class="mute">市場實例資料載入失敗：${err.message}</span>`;
        }
      }
    },
  });
})();
