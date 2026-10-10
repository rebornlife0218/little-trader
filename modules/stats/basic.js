/* 統計學 · 初級統計學
   給第一次修統計學的學生：13 章架構參考大碩補習班張翔老師的統計學課程(編排略有調整)，
   並用本站的台股加權指數資料做「市場實例」，部分章節附互動模擬。
   網址：#/stats/basic/<章節編號> */
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
  const tip = s => `<div class="callout">${s}</div>`;
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

  /* ---------- 章節(架構參考大碩補習班張翔老師的統計學課程，編排略有調整) ---------- */
  const L = 'style="text-align:left"';
  const CHAPTERS = [
    {
      title: '敘述統計學', st: null, live: 'describe',
      goals: ['分辨母體與樣本、參數與統計量、變數的尺度', '用次數分配表與圖形整理資料', '計算集中趨勢、離散程度、相對位置與分配形狀的量數'],
      body: () => `
        <h3>統計學的架構</h3>
        <ul>
          <li><b>敘述統計</b>：把手上的資料整理成表格、圖形與數字，讓人一眼看懂。</li>
          <li><b>推論統計</b>：用樣本去推估(第 7、8 章)或檢驗(第 9～13 章)母體的特性，並說明推論有多可靠；中間的橋樑就是機率(第 2～6 章)。</li>
        </ul>
        <h3>母體與樣本</h3>
        <ul>
          <li><b>母體</b>：想研究的全部對象。描述母體的數字叫<b>參數</b>，用希臘字母：μ、σ²、p。參數固定但通常未知。</li>
          <li><b>樣本</b>：實際蒐集到的一部分。描述樣本的數字叫<b>統計量</b>，用英文字母：x̄、s²、p̂。統計量隨樣本而變，是隨機變數。</li>
        </ul>
        <h3>衡量尺度</h3>
        <table class="stattable"><thead><tr><th>尺度</th><th>特性</th><th>例子</th></tr></thead><tbody>
          <tr><td>名目尺度</td><td ${L}>只能分類，不能排序</td><td ${L}>產業別、交易所</td></tr>
          <tr><td>順序尺度</td><td ${L}>可以排序，但差距無意義</td><td ${L}>信用評等 AAA、AA、A</td></tr>
          <tr><td>區間尺度</td><td ${L}>差距有意義，但沒有絕對零點(不能算倍數)</td><td ${L}>溫度(°C)</td></tr>
          <tr><td>比率尺度</td><td ${L}>有絕對零點，可以算倍數</td><td ${L}>股價、成交量</td></tr>
        </tbody></table>
        <h3>資料整理與圖表</h3>
        <ul>
          <li><b>次數分配表</b>：分組後計算次數、相對次數、累積次數。組數常用 5～20 組，或史特吉斯法則 k ≈ 1 + 3.322 log₁₀ n。</li>
          <li>類別資料：長條圖、圓餅圖；數值資料：直方圖、莖葉圖、盒形圖；兩變數：散佈圖；時間資料：折線圖。</li>
        </ul>
        <h3>集中趨勢</h3>
        ${formula('算術平均數 x̄ = Σxᵢ ÷ n　　加權平均數 = Σwᵢxᵢ ÷ Σwᵢ　　幾何平均數 G = (x₁x₂⋯xₙ)^(1/n)')}
        <ul>
          <li><b>中位數</b>：排序後最中間的值，不受極端值影響；<b>眾數</b>：出現次數最多的值。</li>
          <li>算術平均 ≥ 幾何平均 ≥ 調和平均。<b>平均報酬率要用幾何平均</b>：+50% 再 −50%，算術平均 0%，實際卻賠 25%。</li>
        </ul>
        <h3>離散程度</h3>
        ${formula('母體變異數 σ² = Σ(xᵢ − μ)² ÷ N　　樣本變異數 s² = Σ(xᵢ − x̄)² ÷ (n − 1) = [Σxᵢ² − n·x̄²] ÷ (n − 1)')}
        <ul>
          <li>樣本變異數除以 <b>n − 1</b>(自由度)，才是 σ² 的不偏估計(證明見第 7 章)。</li>
          <li><b>全距</b> = 最大 − 最小；<b>四分位距 IQR</b> = Q₃ − Q₁；<b>變異係數 CV</b> = s ÷ x̄(比較單位不同的資料)。</li>
        </ul>
        <h3>相對位置</h3>
        ${formula('z 分數 = (x − x̄) ÷ s　　離群值：x &lt; Q₁ − 1.5·IQR 或 x &gt; Q₃ + 1.5·IQR')}
        <ul>
          <li><b>柴比雪夫定理</b>：任何分配，落在平均數 ±k 個標準差內的比例至少 1 − 1/k²(k &gt; 1)。±2s 至少 75%、±3s 至少 88.9%。</li>
          <li><b>經驗法則</b>：資料呈鐘形時，約 68%、95%、99.7% 落在 ±1、2、3 個標準差內。</li>
        </ul>
        <h3>分配形狀</h3>
        <ul>
          <li><b>偏態係數</b>：&gt;0 右偏(平均數 &gt; 中位數 &gt; 眾數)；&lt;0 左偏(平均數 &lt; 中位數 &lt; 眾數)；≈0 對稱。</li>
          <li><b>峰態係數</b>：常態分配為 3(超額峰度為 0)；超額峰度 &gt; 0 為高狹峰、肥尾。</li>
        </ul>
        ${tip('<b>金融用語</b>：報酬率的標準差就是「波動度」，日報酬標準差 × √252 ≈ 年化波動度。<b>倖存者偏差</b>：只統計還存在的基金，會漏掉清算的爛基金而高估平均績效。樣本怎麼選，比樣本有多大更重要。')}`,
    },
    {
      title: '機率', st: ['basic-probability', 'Basic Probability'], demo: ['dice', 'coin'],
      goals: ['理解 Kolmogorov 公設化機率，並由公設推導機率的基本性質', '用文氏圖理解交集、聯集、補集，運用排列組合、條件機率與獨立', '用 Monty Hall 問題體會條件機率，理解貝氏定理「用新訊息修正機率」的意義'],
      body: () => `
        <h3>基本名詞</h3>
        <ul>
          <li><b>隨機試驗</b>：結果事先無法確定的過程，例如擲骰子、明天大盤漲或跌。</li>
          <li><b>樣本空間 S</b>：所有可能結果的集合，擲一顆骰子 S = {1, 2, 3, 4, 5, 6}。</li>
          <li><b>事件</b>：S 的子集合，例如「擲出偶數」A = {2, 4, 6}。只含一個結果的叫簡單事件，∅ 為不可能事件，S 為必然事件。</li>
        </ul>
        <h3>事件的運算：交集、聯集、補集</h3>
        <div class="venn-row">
          ${venn('inter', '交集 A ∩ B<br><small>A 與 B 同時發生</small>')}
          ${venn('union', '聯集 A ∪ B<br><small>A 或 B 至少一個發生</small>')}
          ${venn('comp', '補集 Aᶜ<br><small>A 不發生</small>')}
          ${venn('diff', '差集 A − B = A ∩ Bᶜ<br><small>A 發生但 B 不發生</small>')}
          ${venn('disjoint', '互斥 A ∩ B = ∅<br><small>A、B 不可能同時發生</small>')}
        </div>
        <p>擲骰子例：A = {2, 4, 6}(偶數)、B = {4, 5, 6}(大於 3)，則 A ∩ B = {4, 6}、A ∪ B = {2, 4, 5, 6}、Aᶜ = {1, 3, 5}、A − B = {2}。</p>
        ${formula('交換律、結合律　　分配律 A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)　　笛摩根定律 (A ∪ B)ᶜ = Aᶜ ∩ Bᶜ，(A ∩ B)ᶜ = Aᶜ ∪ Bᶜ')}
        <p>若 A₁, …, Aₙ 兩兩互斥且 A₁ ∪ ⋯ ∪ Aₙ = S(周延)，稱為 S 的一個<b>分割</b>：每次試驗恰好有一個 Aᵢ 發生。貝氏定理就建立在分割上。</p>
        <h3>Kolmogorov 公設化機率</h3>
        <p>機率有三種常見的解釋：<b>古典機率</b>(結果同樣可能時 P(A) = n(A) ÷ n(S))、<b>相對次數</b>(長期重複試驗的發生比例，見下方模擬)、<b>主觀機率</b>(個人的信心程度)。但每一種都有適用不到的情況，例如古典機率要求「同樣可能」、相對次數無法真的無限重複。</p>
        <p>1933 年蘇聯數學家 <b>Kolmogorov</b> 不去爭論機率「是什麼」，而是規定機率「必須滿足什麼」：只要一個函數 P 對樣本空間 S 中的每個事件 A 給出一個實數，並滿足以下三個<b>公設</b>，就稱為機率。</p>
        <table class="stattable"><thead><tr><th>公設</th><th>內容</th><th>意義</th></tr></thead><tbody>
          <tr><td>公設一　非負性</td><td ${L}>對任意事件 A，P(A) ≥ 0</td><td ${L}>機率不會是負的</td></tr>
          <tr><td>公設二　規範性</td><td ${L}>P(S) = 1</td><td ${L}>一定有某個結果發生</td></tr>
          <tr><td>公設三　可數可加性</td><td ${L}>A₁, A₂, … 兩兩互斥時，P(A₁ ∪ A₂ ∪ ⋯) = P(A₁) + P(A₂) + ⋯</td><td ${L}>互斥事件的機率可以直接相加</td></tr>
        </tbody></table>
        <p>古典、相對次數、主觀機率都滿足這三個公設，所以由公設推導出的所有定理對它們都成立。<b>由公設推導的性質</b>：</p>
        <ul>
          <li><b>P(∅) = 0</b>：S = S ∪ ∅ ∪ ∅ ∪ ⋯ 兩兩互斥，由公設三得 P(∅) = 0。</li>
          <li><b>餘事件 P(Aᶜ) = 1 − P(A)</b>：A 與 Aᶜ 互斥且 A ∪ Aᶜ = S，由公設二、三得 P(A) + P(Aᶜ) = 1。</li>
          <li><b>0 ≤ P(A) ≤ 1</b>：由公設一與上一條。</li>
          <li><b>單調性</b>：A ⊂ B ⇒ P(A) ≤ P(B)，因為 B = A ∪ (B − A) 互斥，P(B − A) ≥ 0。</li>
          <li><b>加法定理 P(A ∪ B) = P(A) + P(B) − P(A ∩ B)</b>：把 A ∪ B 拆成互斥的 A 與 B − A，而 P(B − A) = P(B) − P(A ∩ B)。看上方聯集的圖，A ∩ B 被 A、B 各算了一次，所以要減掉一次。</li>
        </ul>
        ${formula('三個事件：P(A ∪ B ∪ C) = P(A) + P(B) + P(C) − P(A ∩ B) − P(A ∩ C) − P(B ∩ C) + P(A ∩ B ∩ C)')}
        <h3>計數方法</h3>
        ${formula('乘法原理 n₁ × n₂ × ⋯　　排列 P(n, r) = n! ÷ (n − r)!　　組合 C(n, r) = n! ÷ [r!(n − r)!]')}
        <p>例：從 10 檔股票挑 3 檔組成投資組合(不管順序)，共 C(10, 3) = 120 種。</p>
        <h3>條件機率與獨立</h3>
        ${formula('條件機率 P(A | B) = P(A ∩ B) ÷ P(B)，P(B) &gt; 0　　乘法法則 P(A ∩ B) = P(B)·P(A | B)')}
        <p>「已知 B 發生」等於把樣本空間從 S 縮小成 B，再看 A 占 B 的多少(交集的圖中，著色部分占 B 的比例)。</p>
        <p><b>獨立</b>：P(A ∩ B) = P(A)·P(B)，等價於 P(A | B) = P(A)，知道 B 發生不會改變 A 的機率。注意「互斥」與「獨立」不同：機率皆為正的兩事件若互斥，一定不獨立(一個發生，另一個就不可能發生)。</p>
        ${tip('<b>市場實例</b>：「出現某K棒型態後上漲的機率」是條件機率 P(上漲 | 型態)，要和 P(上漲) 比較才知道型態有沒有資訊。<b>賭徒謬誤</b>：每天漲跌若獨立，連跌 5 天也不代表明天一定反彈；大數法則是靠次數多「稀釋」偏差，而不是「補回來」。')}
        <h3>Monty Hall 問題(三門問題)</h3>
        <p>美國電視遊戲節目《Let's Make a Deal》：三扇門後面有一輛汽車和兩隻山羊。你先選一扇門(假設 1 號門)，<b>知道答案的主持人 Monty Hall</b> 一定會從剩下的兩扇門中，打開一扇後面是山羊的門(假設打開 3 號門)，然後問你：要不要換到 2 號門？</p>
        <p>直覺會說「剩兩扇門，各 1/2，換不換都一樣」，但答案是<b>換門贏的機率是 2/3</b>。列出汽車所在位置的三種等可能情況：</p>
        <table class="stattable"><thead><tr><th>汽車在</th><th>機率</th><th>主持人開</th><th>不換(留 1 號)</th><th>換門</th></tr></thead><tbody>
          <tr><td>1 號門</td><td>1/3</td><td>2 號或 3 號</td><td>贏</td><td>輸</td></tr>
          <tr><td>2 號門</td><td>1/3</td><td>只能開 3 號</td><td>輸</td><td>贏</td></tr>
          <tr><td>3 號門</td><td>1/3</td><td>只能開 2 號</td><td>輸</td><td>贏</td></tr>
          <tr><td colspan="3">贏的機率</td><td><b>1/3</b></td><td><b>2/3</b></td></tr>
        </tbody></table>
        <p><b>關鍵在於主持人不是隨機開門</b>：他知道汽車在哪，而且一定開山羊門。你一開始選對的機率只有 1/3，這個機率不會因為主持人開門而改變；剩下的 2/3 原本分散在 2、3 號門，3 號門被排除後就全部集中到 2 號門。想像成 100 扇門：你選 1 扇，主持人打開其餘 98 扇山羊門，只留下 1 扇，你一定會想換。</p>
        <p>「主持人打開 3 號門」就是一個<b>新的訊息</b>，下一節用貝氏定理正式計算它如何改變各扇門的機率。</p>
        <h3>貝氏定理</h3>
        <p>設 A₁, A₂, …, Aₙ 是樣本空間 S 的一個分割(互斥且周延)，B 為任一事件，P(B) &gt; 0。</p>
        ${formula('全機率定理：P(B) = P(A₁)P(B | A₁) + P(A₂)P(B | A₂) + ⋯ + P(Aₙ)P(B | Aₙ)')}
        ${formula('貝氏定理：P(Aᵢ | B) = P(Aᵢ)·P(B | Aᵢ) ÷ [ P(A₁)P(B | A₁) + ⋯ + P(Aₙ)P(B | Aₙ) ]')}
        <table class="stattable"><thead><tr><th>名稱</th><th>符號</th><th>意義</th></tr></thead><tbody>
          <tr><td>事前機率(先驗)</td><td>P(Aᵢ)</td><td ${L}>還沒得到新訊息之前，對 Aᵢ 的評估</td></tr>
          <tr><td>概似</td><td>P(B | Aᵢ)</td><td ${L}>如果 Aᵢ 是真的，觀察到 B 的機率</td></tr>
          <tr><td>事後機率(後驗)</td><td>P(Aᵢ | B)</td><td ${L}>得知 B 已發生之後，對 Aᵢ 重新評估的機率</td></tr>
        </tbody></table>
        <div class="callout"><b>貝氏定理的意義</b><br>有新的訊息進來，即認知到事件B已經發生新的事實，此時事件A1~An不宜再用事前機率評估，既然事件B已發生，就要重新估算，在給定事件B已發生的條件下，事件A1~An發生的條件機率。</div>
        <p>換句話說，貝氏定理是一套<b>用新證據修正舊看法</b>的規則：事後機率 ∝ 事前機率 × 概似。原本就比較可能的 Aᵢ(事前機率大)，或是最能解釋 B 為什麼發生的 Aᵢ(概似大)，事後機率就會變大。今天的事後機率，又可以當成下一次有新訊息時的事前機率，不斷更新。</p>
        <p><b>例一 · Monty Hall</b>：Aᵢ = 汽車在 i 號門，事前機率各 1/3；B = 主持人打開 3 號門(你選 1 號)。</p>
        ${formula('概似：P(B | A₁) = 1/2(1 號有車時，2、3 號他隨便開一扇)　P(B | A₂) = 1(只能開 3 號)　P(B | A₃) = 0(不會開汽車門)')}
        ${formula('P(B) = (1/3)(1/2) + (1/3)(1) + (1/3)(0) = 1/2　→　P(A₁ | B) = (1/6) ÷ (1/2) = 1/3，P(A₂ | B) = (1/3) ÷ (1/2) = 2/3')}
        <p>新訊息讓 2 號門的機率從事前的 1/3 修正為事後的 2/3，所以要換門。</p>
        <p><b>例二 · 醫學檢驗</b>：疾病盛行率 1%(事前機率)，有病時 99% 驗出陽性、沒病時 1% 誤判陽性(概似)。某人驗出陽性(新訊息 B)，真的有病的機率：</p>
        ${formula('P(陽性) = 0.01 × 0.99 + 0.99 × 0.01 = 0.0198　→　P(有病 | 陽性) = 0.0099 ÷ 0.0198 = 50%')}
        <p>有病的機率從 1% 修正為 50%，但仍只有一半，因為沒病的人太多，1% 的誤判就產生和真陽性一樣多的假陽性。<b>事前機率(基礎比率)非常重要</b>，只看檢驗準確率 99% 會嚴重高估。若再驗一次仍是陽性，就把 50% 當成新的事前機率再更新一次，有病的機率會升到 99%。</p>`,
    },
    {
      title: '隨機變數', st: ['probability-distributions', 'Probability Distributions'],
      goals: ['區分離散與連續隨機變數，使用 PMF、PDF 與 CDF', '計算期望值、變異數與它們的運算性質', '認識動差與動差生成函數'],
      body: () => `
        <h3>隨機變數</h3>
        <p>把樣本空間中的每個結果對應到一個實數的函數，記為 X。</p>
        <table class="stattable"><thead><tr><th></th><th>離散</th><th>連續</th></tr></thead><tbody>
          <tr><td>描述</td><td ${L}>機率質量函數 f(x) = P(X = x)</td><td ${L}>機率密度函數 f(x)，P(a ≤ X ≤ b) = ∫ₐᵇ f(x)dx</td></tr>
          <tr><td>條件</td><td ${L}>f(x) ≥ 0，Σ f(x) = 1</td><td ${L}>f(x) ≥ 0，∫ f(x)dx = 1</td></tr>
          <tr><td>單點機率</td><td ${L}>可以大於 0</td><td ${L}>P(X = a) = 0，所以 ≤ 與 &lt; 沒有差別</td></tr>
        </tbody></table>
        ${formula('累積分配函數 F(x) = P(X ≤ x)：遞增、右連續、F(−∞) = 0、F(∞) = 1；連續時 f(x) = F′(x)')}
        <h3>期望值</h3>
        ${formula('E[X] = Σ x·f(x)　或　∫ x·f(x)dx　　E[g(X)] = Σ g(x)·f(x)　或　∫ g(x)·f(x)dx')}
        ${formula('E[aX + b] = a·E[X] + b')}
        <h3>變異數</h3>
        ${formula('Var(X) = E[(X − μ)²] = E[X²] − (E[X])²　　Var(aX + b) = a²·Var(X)')}
        <p>例：擲一顆公平骰子，E[X] = 3.5、E[X²] = 91/6，Var(X) = 91/6 − 3.5² = 35/12 ≈ 2.92。期望值是「長期平均」，不代表單次會擲出 3.5。</p>
        <h3>動差與動差生成函數</h3>
        ${formula('k 階原動差 E[Xᵏ]　　k 階主動差 E[(X − μ)ᵏ]　　M(t) = E[eᵗˣ]，E[Xᵏ] = M⁽ᵏ⁾(0)')}
        <ul>
          <li>二階主動差是變異數；三階、四階主動差標準化後就是偏態係數與峰態係數。</li>
          <li>MGF 唯一決定分配：兩個隨機變數的 MGF 相同，分配就相同。常用來證明獨立隨機變數相加後的分配。</li>
        </ul>
        <h3>柴比雪夫不等式</h3>
        ${formula('P(|X − μ| ≥ kσ) ≤ 1 ÷ k²　(不論 X 是什麼分配)')}
        ${tip('<b>金融用語</b>：一筆交易的「期望報酬」= 勝率 × 平均賺 − 敗率 × 平均賠。勝率高不代表期望值為正，賺小賠大的策略勝率 80% 也可能長期虧錢。')}`,
    },
    {
      title: '多元隨機變數', st: null, live: 'cov',
      goals: ['使用聯合、邊際與條件分配', '計算共變異數與相關係數，判斷獨立', '計算線性組合的期望值與變異數'],
      body: () => `
        <h3>聯合分配</h3>
        ${formula('離散 f(x, y) = P(X = x, Y = y)　　連續 P((X, Y) ∈ A) = ∬_A f(x, y) dx dy')}
        ${formula('邊際分配 f_X(x) = Σ_y f(x, y)　或　∫ f(x, y) dy　　條件分配 f(y | x) = f(x, y) ÷ f_X(x)')}
        <p><b>獨立</b>：對所有 x、y 都有 f(x, y) = f_X(x)·f_Y(y)。只要有一格不成立就不獨立。</p>
        <h3>共變異數與相關係數</h3>
        ${formula('Cov(X, Y) = E[(X − μ_X)(Y − μ_Y)] = E[XY] − E[X]E[Y]　　ρ = Cov(X, Y) ÷ (σ_X σ_Y)，−1 ≤ ρ ≤ 1')}
        <ul>
          <li>Cov(aX + b, cY + d) = ac·Cov(X, Y)；ρ 不受單位影響(a、c 同號時不變)。</li>
          <li>獨立 ⇒ Cov = 0；但 <b>Cov = 0 不一定獨立</b>(只代表沒有「線性」關係)。例外：二元常態時兩者等價。</li>
        </ul>
        <h3>線性組合</h3>
        ${formula('E[aX + bY] = aE[X] + bE[Y]　　Var(aX + bY) = a²Var(X) + b²Var(Y) + 2ab·Cov(X, Y)')}
        <p>n 個獨立且同分配(iid)的隨機變數：E[x̄] = μ、Var(x̄) = σ² ÷ n。這是第 6 章抽樣分配的基礎。</p>
        <h3>條件期望值</h3>
        ${formula('E[Y | X = x] = Σ y·f(y | x)　　重複期望值定理 E[Y] = E[ E[Y | X] ]')}
        ${formula('Var(Y) = E[ Var(Y | X) ] + Var( E[Y | X] )')}
        ${tip('<b>投資組合</b>：兩檔資產各放一半，組合變異數 = ¼σ₁² + ¼σ₂² + ½Cov。只要 ρ &lt; 1，組合的標準差就小於兩者標準差的平均 — 這就是「分散風險」的數學原理。')}`,
    },
    {
      title: '常見機率模型', st: ['probability-distributions', 'Probability Distributions'], live: 'normal',
      goals: ['使用常見的離散分配：二項、卜瓦松、幾何、超幾何', '使用常見的連續分配：均勻、指數、常態', '用卜瓦松、常態近似二項分配'],
      body: () => `
        <h3>離散分配</h3>
        <table class="stattable"><thead><tr><th>分配</th><th>情境</th><th>f(x)</th><th>E[X]</th><th>Var(X)</th></tr></thead><tbody>
          <tr><td>伯努利 B(1, p)</td><td ${L}>一次試驗，成功記 1</td><td>pˣ(1−p)¹⁻ˣ</td><td>p</td><td>p(1−p)</td></tr>
          <tr><td>二項 B(n, p)</td><td ${L}>n 次獨立試驗的成功次數</td><td>C(n,x)pˣ(1−p)ⁿ⁻ˣ</td><td>np</td><td>np(1−p)</td></tr>
          <tr><td>幾何 G(p)</td><td ${L}>第一次成功發生在第 x 次</td><td>(1−p)ˣ⁻¹p</td><td>1/p</td><td>(1−p)/p²</td></tr>
          <tr><td>負二項</td><td ${L}>第 r 次成功發生在第 x 次</td><td>C(x−1,r−1)pʳ(1−p)ˣ⁻ʳ</td><td>r/p</td><td>r(1−p)/p²</td></tr>
          <tr><td>超幾何</td><td ${L}>N 個中有 K 個成功，取出不放回 n 個</td><td>C(K,x)C(N−K,n−x)/C(N,n)</td><td>nK/N</td><td>n(K/N)(1−K/N)(N−n)/(N−1)</td></tr>
          <tr><td>卜瓦松 P(λ)</td><td ${L}>單位時間/空間內事件發生次數</td><td>e^(−λ)λˣ/x!</td><td>λ</td><td>λ</td></tr>
        </tbody></table>
        <h3>連續分配</h3>
        <table class="stattable"><thead><tr><th>分配</th><th>f(x)</th><th>E[X]</th><th>Var(X)</th></tr></thead><tbody>
          <tr><td>均勻 U(a, b)</td><td>1/(b − a)，a ≤ x ≤ b</td><td>(a+b)/2</td><td>(b−a)²/12</td></tr>
          <tr><td>指數 Exp(λ)</td><td>λe^(−λx)，x ≥ 0</td><td>1/λ</td><td>1/λ²</td></tr>
          <tr><td>伽瑪 Γ(α, λ)</td><td>λ^α x^(α−1) e^(−λx) / Γ(α)</td><td>α/λ</td><td>α/λ²</td></tr>
          <tr><td>常態 N(μ, σ²)</td><td>e^(−(x−μ)²/2σ²) / (σ√2π)</td><td>μ</td><td>σ²</td></tr>
        </tbody></table>
        <h3>重要性質</h3>
        <ul>
          <li><b>無記憶性</b>：幾何(離散)與指數(連續)分配，P(X &gt; s + t | X &gt; s) = P(X &gt; t)。已經等了多久不影響還要等多久。</li>
          <li><b>卜瓦松與指數</b>：單位時間發生次數 ~ P(λ)，則兩次事件的間隔時間 ~ Exp(λ)。</li>
          <li><b>常態的線性組合仍是常態</b>；標準化 Z = (X − μ) ÷ σ ~ N(0, 1)，再查標準常態表。</li>
          <li>不放回抽樣的超幾何，當 n/N 很小(&lt; 5%)時可用二項近似。</li>
        </ul>
        <h3>近似</h3>
        ${formula('卜瓦松近似：n 大、p 小(n ≥ 20 且 p ≤ 0.05)時，B(n, p) ≈ P(λ = np)')}
        ${formula('常態近似：np ≥ 5 且 n(1−p) ≥ 5 時，B(n, p) ≈ N(np, np(1−p))，並做連續性校正 P(X ≤ k) ≈ P(Z ≤ (k + 0.5 − np) ÷ √(np(1−p)))')}
        <p>例：策略勝率 55%，做 20 筆，平均贏 11 筆，標準差 √(20×0.55×0.45) ≈ 2.2 筆；贏不到 8 筆的機率 ≈ P(Z ≤ (7.5 − 11) ÷ 2.22) ≈ 5.8%。</p>`,
    },
    {
      title: '抽樣方法與抽樣分配', st: null, demo: 'clt',
      goals: ['認識簡單隨機、分層、群集、系統抽樣', '推導樣本平均數與樣本比例的抽樣分配、理解中央極限定理', '認識卡方、t、F 三大抽樣分配'],
      body: () => `
        <h3>抽樣方法</h3>
        <table class="stattable"><thead><tr><th>方法</th><th>做法</th><th>適用</th></tr></thead><tbody>
          <tr><td>簡單隨機抽樣</td><td ${L}>每個大小為 n 的樣本被抽到的機率相同</td><td ${L}>母體同質、有完整名冊</td></tr>
          <tr><td>分層隨機抽樣</td><td ${L}>依特性分層，每層內再隨機抽</td><td ${L}>層內同質、層間異質(例：依產業分層)</td></tr>
          <tr><td>群集抽樣</td><td ${L}>把母體分成許多群，隨機抽幾個群全部調查</td><td ${L}>群內異質、群間同質，節省成本</td></tr>
          <tr><td>系統抽樣</td><td ${L}>隨機選起點後，每隔 k 個抽一個</td><td ${L}>名冊沒有週期性時</td></tr>
        </tbody></table>
        <p>非隨機抽樣(便利、判斷、配額、雪球)無法計算抽樣誤差，不能做統計推論。<b>抽樣誤差</b>來自「只看了一部分」；<b>非抽樣誤差</b>來自涵蓋不全、無回應、量測偏差等，樣本再大也不會消失。</p>
        <h3>樣本平均數 x̄ 的抽樣分配</h3>
        ${formula('E[x̄] = μ　　σ_x̄ = σ ÷ √n(標準誤)；有限母體不放回且 n/N &gt; 5% 時乘上 √[(N − n) ÷ (N − 1)]')}
        <ul>
          <li>母體為常態 ⇒ x̄ 不論 n 多少都是常態。</li>
          <li><b>中央極限定理</b>：母體不是常態，只要 n 夠大(常用 n ≥ 30)，x̄ 近似 N(μ, σ²/n)。下方擲骰子模擬可親眼看到。</li>
        </ul>
        <h3>樣本比例 p̂ 的抽樣分配</h3>
        ${formula('E[p̂] = p　　σ_p̂ = √[p(1 − p) ÷ n]　　np ≥ 5 且 n(1 − p) ≥ 5 時 p̂ 近似常態')}
        <h3>三大抽樣分配</h3>
        <table class="stattable"><thead><tr><th>分配</th><th>由來</th><th>主要用途</th></tr></thead><tbody>
          <tr><td>卡方 χ²(k)</td><td ${L}>k 個獨立標準常態的平方和；(n − 1)s²/σ² ~ χ²(n − 1)</td><td ${L}>σ² 的推論、卡方檢定(第 12 章)</td></tr>
          <tr><td>t(k)</td><td ${L}>Z ÷ √(χ²(k)/k)；(x̄ − μ) ÷ (s/√n) ~ t(n − 1)</td><td ${L}>σ 未知時 μ 的推論、迴歸係數</td></tr>
          <tr><td>F(k₁, k₂)</td><td ${L}>[χ²(k₁)/k₁] ÷ [χ²(k₂)/k₂]；(s₁²/σ₁²) ÷ (s₂²/σ₂²) ~ F</td><td ${L}>兩變異數比較、ANOVA、迴歸整體檢定</td></tr>
        </tbody></table>
        <ul>
          <li>t 分配對稱、比 Z 尾巴厚，自由度 → ∞ 時趨近 N(0, 1)；t(k)² = F(1, k)。</li>
          <li>χ²(k) 平均 k、變異數 2k，右偏；F 分配的倒數性質 F₁₋α(k₁, k₂) = 1 ÷ F_α(k₂, k₁)。</li>
        </ul>`,
    },
    {
      title: '點估計', st: ['frequentist-inference', 'Frequentist Inference'],
      goals: ['用不偏性、有效性、一致性、充分性評估估計式', '理解均方誤差與偏誤–變異的取捨', '用動差法與最大概似法求估計式'],
      body: () => `
        <h3>估計式與估計值</h3>
        <p><b>估計式</b> θ̂ 是樣本的函數(隨機變數，例如 x̄ = ΣXᵢ/n)；代入實際資料得到的數字叫<b>估計值</b>。</p>
        <h3>好估計式的性質</h3>
        <ul>
          <li><b>不偏性</b>：E[θ̂] = θ。x̄、p̂、s²(除以 n − 1)都是不偏估計式；除以 n 的變異數有偏誤 −σ²/n。</li>
          <li><b>有效性</b>：都不偏時變異數越小越好。相對效率 = Var(θ̂₂) ÷ Var(θ̂₁)。常態母體下樣本平均數比中位數有效(中位數變異數約為 π/2 倍)。</li>
          <li><b>一致性</b>：n → ∞ 時 θ̂ 機率收斂到 θ。充分條件：偏誤與變異數都趨近 0。</li>
          <li><b>充分性</b>：θ̂ 已包含樣本中關於 θ 的所有資訊(費雪–奈曼分解定理)。</li>
        </ul>
        <h3>均方誤差</h3>
        ${formula('MSE(θ̂) = E[(θ̂ − θ)²] = Var(θ̂) + [Bias(θ̂)]²')}
        <p>有時接受一點偏誤，換來變異數大幅下降，整體 MSE 反而更小。</p>
        ${formula('克拉瑪–羅下界：不偏估計式的變異數 ≥ 1 ÷ [n·I(θ)]，達到下界者稱為最小變異不偏估計式')}
        <h3>動差法</h3>
        <p>令樣本動差等於母體動差，解出參數：</p>
        ${formula('(1/n)ΣXᵢ = E[X]，(1/n)ΣXᵢ² = E[X²]，…')}
        <p>例：U(0, θ) 的 E[X] = θ/2，令 x̄ = θ/2 ⇒ θ̂ = 2x̄。</p>
        <h3>最大概似法(MLE)</h3>
        ${formula('概似函數 L(θ) = Π f(xᵢ; θ)　→　解 d ln L(θ) ÷ dθ = 0')}
        <table class="stattable"><thead><tr><th>母體</th><th>MLE</th></tr></thead><tbody>
          <tr><td>伯努利 p</td><td>p̂ = x̄(樣本比例)</td></tr>
          <tr><td>卜瓦松 λ</td><td>λ̂ = x̄</td></tr>
          <tr><td>指數 λ</td><td>λ̂ = 1 ÷ x̄</td></tr>
          <tr><td>常態 μ, σ²</td><td>μ̂ = x̄，σ̂² = Σ(xᵢ − x̄)² ÷ n(有偏誤)</td></tr>
          <tr><td>U(0, θ)</td><td>θ̂ = max(Xᵢ)(無法微分求解，要直接看 L(θ))</td></tr>
        </tbody></table>
        <p>MLE 具有<b>不變性</b>：θ̂ 是 θ 的 MLE，則 g(θ̂) 是 g(θ) 的 MLE。大樣本下 MLE 近似常態、一致且漸近有效。</p>`,
    },
    {
      title: '區間估計', st: ['frequentist-inference', 'Frequentist Inference'], live: 'ci',
      goals: ['建立單一母體 μ、p、σ² 的信賴區間', '建立兩母體差異與變異數比的信賴區間', '正確解讀信賴區間並估算需要的樣本數'],
      body: () => `
        <h3>信賴區間的意義</h3>
        <p>若重複抽樣很多次、每次都用同樣方法算區間，約有 (1 − α) 的區間會包含真正的參數。<b>常見誤解</b>：「μ 有 95% 機率在這個區間」— 頻率學派裡 μ 是固定值，算出來的區間要嘛包含、要嘛不包含。</p>
        <h3>單一母體</h3>
        <table class="stattable"><thead><tr><th>參數</th><th>條件</th><th>信賴區間</th></tr></thead><tbody>
          <tr><td>μ</td><td ${L}>σ 已知(或大樣本)</td><td ${L}>x̄ ± z_(α/2) · σ/√n</td></tr>
          <tr><td>μ</td><td ${L}>σ 未知、母體常態</td><td ${L}>x̄ ± t_(α/2, n−1) · s/√n</td></tr>
          <tr><td>p</td><td ${L}>大樣本</td><td ${L}>p̂ ± z_(α/2) · √[p̂(1 − p̂)/n]</td></tr>
          <tr><td>σ²</td><td ${L}>母體常態</td><td ${L}>[(n−1)s² / χ²_(α/2),　(n−1)s² / χ²_(1−α/2)]</td></tr>
        </tbody></table>
        <p>常用臨界值：z₀.₀₅ = 1.645、z₀.₀₂₅ = 1.96、z₀.₀₀₅ = 2.576。</p>
        <h3>兩母體</h3>
        <table class="stattable"><thead><tr><th>參數</th><th>條件</th><th>信賴區間</th></tr></thead><tbody>
          <tr><td>μ₁ − μ₂</td><td ${L}>獨立，σ 已知</td><td ${L}>(x̄₁ − x̄₂) ± z · √(σ₁²/n₁ + σ₂²/n₂)</td></tr>
          <tr><td>μ₁ − μ₂</td><td ${L}>獨立，σ 未知但相等</td><td ${L}>(x̄₁ − x̄₂) ± t_(n₁+n₂−2) · s_p√(1/n₁ + 1/n₂)，s_p² = [(n₁−1)s₁² + (n₂−1)s₂²] ÷ (n₁+n₂−2)</td></tr>
          <tr><td>μ₁ − μ₂</td><td ${L}>獨立，σ 未知且不等</td><td ${L}>(x̄₁ − x̄₂) ± t_(ν) · √(s₁²/n₁ + s₂²/n₂)，ν 用 Welch–Satterthwaite 公式</td></tr>
          <tr><td>μ_D</td><td ${L}>成對樣本</td><td ${L}>d̄ ± t_(n−1) · s_d/√n(把每對差值當成一組樣本)</td></tr>
          <tr><td>p₁ − p₂</td><td ${L}>獨立大樣本</td><td ${L}>(p̂₁ − p̂₂) ± z · √[p̂₁(1−p̂₁)/n₁ + p̂₂(1−p̂₂)/n₂]</td></tr>
          <tr><td>σ₁²/σ₂²</td><td ${L}>兩常態母體</td><td ${L}>[(s₁²/s₂²) / F_(α/2)(n₁−1, n₂−1),　(s₁²/s₂²) · F_(α/2)(n₂−1, n₁−1)]</td></tr>
        </tbody></table>
        <h3>樣本數的決定</h3>
        ${formula('估計 μ，誤差界限 E：n = (z_(α/2) · σ ÷ E)²　　估計 p：n = z_(α/2)² · p(1 − p) ÷ E²(p 未知時用 0.5 最保守)')}
        <p>結果一律<b>無條件進位</b>。誤差減半，樣本數要變 4 倍。</p>`,
    },
    {
      title: '假說檢定', st: null, live: 'ttest',
      goals: ['寫出虛無假說與對立假說，執行檢定步驟', '理解型一、型二錯誤、檢定力與 p 值', '進行單一母體與兩母體的 μ、p、σ² 檢定'],
      body: () => `
        <h3>檢定步驟</h3>
        <ol>
          <li>設立 <b>H₀</b>(含等號，「沒有差異」)與 <b>H₁</b>(研究者想證明的主張)。</li>
          <li>選定顯著水準 α，決定檢定統計量與拒絕域(右尾、左尾或雙尾，由 H₁ 的方向決定)。</li>
          <li>計算檢定統計量或 p 值。</li>
          <li>落入拒絕域(或 p 值 &lt; α)就拒絕 H₀；否則「不拒絕 H₀」— 不等於證明 H₀ 為真。</li>
        </ol>
        <h3>兩種錯誤與檢定力</h3>
        <table class="stattable"><thead><tr><th></th><th>H₀ 為真</th><th>H₀ 為假</th></tr></thead><tbody>
          <tr><td>拒絕 H₀</td><td>型一錯誤(機率 α)</td><td>正確(檢定力 1 − β)</td></tr>
          <tr><td>不拒絕 H₀</td><td>正確(1 − α)</td><td>型二錯誤(機率 β)</td></tr>
        </tbody></table>
        <ul>
          <li>n 固定時 α 與 β 此消彼長；要同時降低兩者只能增加樣本數。</li>
          <li>檢定力隨「真實值與 μ₀ 的距離」、n、α 增加而增加，隨 σ 增加而減少。畫出 1 − β 對真實值的曲線就是檢定力曲線(OC 曲線則是 β)。</li>
        </ul>
        <h3>p 值</h3>
        <p>H₀ 為真時，得到「至少和觀察值一樣極端」的機率。雙尾檢定要乘以 2。p 值<b>不是</b> H₀ 為真的機率；p 值很小也不代表效果很大。</p>
        <h3>常用檢定統計量</h3>
        <table class="stattable"><thead><tr><th>檢定</th><th>條件</th><th>檢定統計量</th></tr></thead><tbody>
          <tr><td>μ</td><td ${L}>σ 已知或大樣本</td><td ${L}>Z = (x̄ − μ₀) ÷ (σ/√n)</td></tr>
          <tr><td>μ</td><td ${L}>σ 未知、常態</td><td ${L}>t = (x̄ − μ₀) ÷ (s/√n)，df = n − 1</td></tr>
          <tr><td>p</td><td ${L}>大樣本</td><td ${L}>Z = (p̂ − p₀) ÷ √[p₀(1 − p₀)/n](分母用 p₀)</td></tr>
          <tr><td>σ²</td><td ${L}>常態</td><td ${L}>χ² = (n − 1)s² ÷ σ₀²，df = n − 1</td></tr>
          <tr><td>μ₁ − μ₂</td><td ${L}>獨立、σ 未知相等</td><td ${L}>t = (x̄₁ − x̄₂ − D₀) ÷ [s_p√(1/n₁ + 1/n₂)]</td></tr>
          <tr><td>μ_D</td><td ${L}>成對</td><td ${L}>t = (d̄ − D₀) ÷ (s_d/√n)</td></tr>
          <tr><td>p₁ − p₂</td><td ${L}>H₀：p₁ = p₂</td><td ${L}>Z = (p̂₁ − p̂₂) ÷ √[p̄(1 − p̄)(1/n₁ + 1/n₂)]，p̄ 為合併比例</td></tr>
          <tr><td>σ₁² = σ₂²</td><td ${L}>兩常態</td><td ${L}>F = s₁² ÷ s₂²，df = (n₁ − 1, n₂ − 1)</td></tr>
        </tbody></table>
        <p><b>檢定與區間的關係</b>：雙尾檢定在 α 下不拒絕 H₀：μ = μ₀，等價於 μ₀ 落在 (1 − α) 信賴區間內。</p>
        ${tip('<b>交易者特別注意 · 多重比較</b>：同時回測 100 個策略，就算全部無效，在 α = 0.05 下平均也有 5 個「顯著」。挑最好的那個去實戰，常常是被運氣騙了。樣本外驗證很重要。')}`,
    },
    {
      title: '變異數分析', st: null, live: 'anova',
      goals: ['用單因子 ANOVA 檢定多個母體平均數是否相等', '理解隨機集區設計與二因子 ANOVA(交互作用)', '用多重比較找出哪些組別有差異'],
      body: () => `
        <h3>為什麼不兩兩做 t 檢定</h3>
        <p>k 組兩兩比較要做 C(k, 2) 次檢定，整體型一錯誤會遠大於 α(5 組做 10 次，至少錯一次的機率約 40%)。ANOVA 用一次 F 檢定回答「這些平均數是否全部相等」。</p>
        <h3>單因子變異數分析</h3>
        ${formula('H₀：μ₁ = μ₂ = ⋯ = μₖ　　H₁：至少有一個 μᵢ 不同')}
        <p><b>假設</b>：各組母體為常態、變異數相等、樣本彼此獨立。</p>
        ${formula('SST = ΣΣ(xᵢⱼ − x̿)² = SSTR + SSE　　SSTR = Σnᵢ(x̄ᵢ − x̿)²(組間)　　SSE = ΣΣ(xᵢⱼ − x̄ᵢ)²(組內)')}
        <table class="stattable"><thead><tr><th>變異來源</th><th>SS</th><th>df</th><th>MS</th><th>F</th></tr></thead><tbody>
          <tr><td>處理(組間)</td><td>SSTR</td><td>k − 1</td><td>MSTR = SSTR/(k − 1)</td><td>MSTR / MSE</td></tr>
          <tr><td>誤差(組內)</td><td>SSE</td><td>n − k</td><td>MSE = SSE/(n − k)</td><td></td></tr>
          <tr><td>總和</td><td>SST</td><td>n − 1</td><td></td><td></td></tr>
        </tbody></table>
        <p>F &gt; F_α(k − 1, n − k) 就拒絕 H₀。直覺：組間差異相對於組內雜訊夠大，才算平均數真的不同。k = 2 時 F = t²，與合併變異數 t 檢定相同。</p>
        <h3>多重比較</h3>
        <ul>
          <li><b>Fisher LSD</b>：|x̄ᵢ − x̄ⱼ| &gt; t_(α/2, n−k)·√[MSE(1/nᵢ + 1/nⱼ)]，F 檢定顯著後才使用。</li>
          <li><b>Bonferroni</b>：做 m 次比較，每次用 α/m，控制整體型一錯誤。</li>
          <li><b>Tukey HSD</b>：用學生化全距分配 q，適合所有成對比較。</li>
        </ul>
        <h3>隨機集區設計</h3>
        <p>把干擾因素(例如不同的人、不同的年度)當成「集區」，每個集區內都做所有處理，從誤差中扣掉集區造成的變異：</p>
        ${formula('SST = SSTR + SSBL + SSE　　df：(k − 1) + (b − 1) + (k − 1)(b − 1)')}
        <h3>二因子變異數分析</h3>
        ${formula('SST = SSA + SSB + SSAB + SSE　　分別檢定 A 主效果、B 主效果、A×B 交互作用')}
        <p>有<b>交互作用</b>時，A 的效果會因 B 的水準而不同(畫交互作用圖會看到線條不平行)，這時單獨解讀主效果容易誤導。</p>`,
    },
    {
      title: '線性迴歸', st: ['regression-analysis', 'Regression Analysis'], live: 'regress',
      goals: ['用最小平方法建立簡單線性迴歸並解讀係數', '用 R²、t 檢定、F 檢定評估模型', '區分信賴區間與預測區間、做殘差分析並認識複迴歸'],
      body: () => `
        <h3>相關係數</h3>
        ${formula('r = Sxy ÷ √(Sxx · Syy)　　Sxy = Σ(xᵢ − x̄)(yᵢ − ȳ)，Sxx = Σ(xᵢ − x̄)²')}
        <p>r 只衡量<b>線性</b>關係，對離群值敏感；檢定 ρ = 0 用 t = r√(n − 2) ÷ √(1 − r²)，df = n − 2。</p>
        <h3>簡單線性迴歸模型</h3>
        ${formula('Y = β₀ + β₁X + ε，ε ~ iid N(0, σ²)')}
        <p>假設(LINE)：線性、誤差獨立、常態、變異數相等。</p>
        <h3>最小平方法</h3>
        ${formula('b₁ = Sxy ÷ Sxx = r · s_y ÷ sₓ　　b₀ = ȳ − b₁x̄　　迴歸線一定通過 (x̄, ȳ)')}
        <p>斜率 b₁：x 每增加 1 單位，y 平均增加 b₁ 單位。不要在資料範圍以外<b>外插</b>預測。</p>
        <h3>變異分解與配適度</h3>
        ${formula('SST = SSR + SSE　　R² = SSR ÷ SST(簡單迴歸時 R² = r²)　　s_e = √[SSE ÷ (n − 2)]')}
        <h3>迴歸的推論</h3>
        ${formula('t = b₁ ÷ s_b₁，s_b₁ = s_e ÷ √Sxx，df = n − 2　　F = MSR ÷ MSE，df = (1, n − 2)，簡單迴歸 F = t²')}
        <ul>
          <li><b>平均反應的信賴區間</b>：ŷ ± t · s_e√[1/n + (x₀ − x̄)²/Sxx]</li>
          <li><b>個別值的預測區間</b>：ŷ ± t · s_e√[1 + 1/n + (x₀ − x̄)²/Sxx]，比信賴區間寬；x₀ 離 x̄ 越遠兩者都越寬。</li>
        </ul>
        <h3>殘差分析</h3>
        <ul>
          <li>殘差對 x 或 ŷ 的圖應該隨機散布；呈喇叭形代表<b>異質變異</b>，呈曲線代表模型不是線性。</li>
          <li>常態機率圖檢查常態性；Durbin–Watson 檢查時間序列資料的<b>自我相關</b>。</li>
          <li>標準化殘差 |e| &gt; 2 或 3 為離群值；高槓桿點與影響點(Cook's D)會大幅改變迴歸線。</li>
        </ul>
        <h3>複迴歸</h3>
        ${formula('Y = β₀ + β₁X₁ + ⋯ + βₖXₖ + ε　　調整後 R²ₐ = 1 − (1 − R²)(n − 1) ÷ (n − k − 1)')}
        <ul>
          <li>bᵢ：<b>其他變數固定</b>時，Xᵢ 增加 1 單位 y 的平均變化。</li>
          <li>整體 F 檢定 H₀：β₁ = ⋯ = βₖ = 0；個別 t 檢定 H₀：βᵢ = 0。</li>
          <li>加入變數 R² 一定不會下降，所以比較模型要用調整後 R²。</li>
          <li><b>多重共線性</b>：自變數彼此高度相關，係數的標準誤變大、正負號可能怪異(VIF &gt; 10 要注意)；類別變數用虛擬變數(k 類用 k − 1 個)。</li>
        </ul>
        ${tip('<b>金融用語 · Beta</b>：個股報酬對大盤報酬做迴歸，斜率就是 β。β = 1.2 代表大盤漲 1%，這檔股票平均漲 1.2%；R² 代表系統性風險占總風險的比例。<b>相關不等於因果</b>：冰淇淋銷量和溺水人數正相關，真正原因是天氣熱。')}`,
    },
    {
      title: '卡方檢定', st: null, live: 'chi2',
      goals: ['用適合度檢定判斷資料是否符合某個分配', '用獨立性檢定判斷兩個類別變數是否相關', '分辨獨立性檢定與齊一性檢定'],
      body: () => `
        <h3>共同的檢定統計量</h3>
        ${formula('χ² = Σ (Oᵢ − Eᵢ)² ÷ Eᵢ　　O：觀察次數，E：H₀ 為真時的期望次數')}
        <p>差距越大 χ² 越大，所以一律是<b>右尾檢定</b>。使用條件：每格期望次數 Eᵢ ≥ 5，不足時要合併相鄰組別。</p>
        <h3>適合度檢定</h3>
        <p>H₀：母體符合某個指定的分配(例如骰子公平、各星期的上漲機率相同、資料服從卜瓦松)。</p>
        ${formula('df = k − 1 − m　　k：組數，m：從樣本估計的參數個數')}
        <p>例：檢定資料是否為卜瓦松分配，λ 用 x̄ 估計，m = 1；檢定常態且 μ、σ 都用樣本估計，m = 2。</p>
        <h3>獨立性檢定</h3>
        <p>一組樣本、同時觀察兩個類別變數，整理成 r × c 列聯表。H₀：兩變數獨立。</p>
        ${formula('Eᵢⱼ = (第 i 列總和 × 第 j 行總和) ÷ n　　df = (r − 1)(c − 1)')}
        <p>2 × 2 表格 df = 1，樣本小時可做葉茲連續性校正 Σ(|O − E| − 0.5)² ÷ E。</p>
        <h3>齊一性檢定</h3>
        <p>從<b>多個母體</b>各抽一組樣本(每組樣本數事先固定)，檢定各母體在某類別變數上的比例是否相同。計算方式和獨立性檢定完全一樣，差別在抽樣方式與 H₀ 的敘述。</p>
        <table class="stattable"><thead><tr><th></th><th>獨立性檢定</th><th>齊一性檢定</th></tr></thead><tbody>
          <tr><td>抽樣</td><td ${L}>一個母體抽一組樣本</td><td ${L}>多個母體各抽一組，列(或行)總和固定</td></tr>
          <tr><td>H₀</td><td ${L}>兩變數獨立</td><td ${L}>各母體的比例分配相同</td></tr>
        </tbody></table>
        <p>k 個母體比例相等的檢定(H₀：p₁ = ⋯ = pₖ)就是 2 × k 的齊一性檢定；k = 2 時 χ² = Z²。</p>`,
    },
    {
      title: '其他', st: ['bayesian-inference', 'Bayesian Inference'], live: 'runs',
      goals: ['認識無母數統計方法及其使用時機', '使用符號檢定、魏克森檢定、克-瓦檢定、等級相關與連檢定', '認識自助法與貝氏推論'],
      body: () => `
        <h3>無母數統計</h3>
        <p>不需要假設母體是常態等特定分配，常用資料的<b>等級(排名)</b>或<b>正負號</b>。適合小樣本、母體明顯非常態、有離群值或只有順序尺度的資料；代價是母體真的是常態時，檢定力比有母數方法低。</p>
        <table class="stattable"><thead><tr><th>無母數方法</th><th>對應的有母數方法</th><th>用途</th></tr></thead><tbody>
          <tr><td>符號檢定</td><td>單樣本 / 成對 t</td><td ${L}>中位數檢定，只看差值正負號，正號個數 ~ B(n, 0.5)</td></tr>
          <tr><td>魏克森符號等級檢定</td><td>成對 t</td><td ${L}>差值取絕對值排等級，再分別加總正、負號的等級和</td></tr>
          <tr><td>魏克森等級和 / 曼–惠尼 U</td><td>兩獨立樣本 t</td><td ${L}>兩組混合排等級，比較其中一組的等級和</td></tr>
          <tr><td>克魯斯卡–瓦歷斯 H</td><td>單因子 ANOVA</td><td ${L}>k 組混合排等級，H 近似 χ²(k − 1)</td></tr>
          <tr><td>弗里德曼檢定</td><td>隨機集區 ANOVA</td><td ${L}>每個集區內排等級</td></tr>
          <tr><td>斯皮爾曼等級相關 r_s</td><td>皮爾森 r</td><td ${L}>r_s = 1 − 6Σdᵢ² ÷ [n(n² − 1)]，衡量單調關係</td></tr>
          <tr><td>連檢定</td><td>—</td><td ${L}>檢定序列是否隨機</td></tr>
        </tbody></table>
        <h3>連檢定</h3>
        <p>「連」是連續出現相同符號的一段。連數太少代表有趨勢或群聚，太多代表規律交替，兩者都不隨機。n₁、n₂ 為兩種符號的個數，n = n₁ + n₂：</p>
        ${formula('E[R] = 2n₁n₂ ÷ n + 1　　Var(R) = 2n₁n₂(2n₁n₂ − n) ÷ [n²(n − 1)]　　大樣本 Z = (R − E[R]) ÷ √Var(R)')}
        <h3>自助法(Bootstrap)</h3>
        <p>公式難以推導時，從手上的樣本<b>有放回地</b>重複抽出大小為 n 的樣本上千次，每次計算統計量，用這些結果的分布估計標準誤與信賴區間(例如取第 2.5 與 97.5 百分位數)。</p>
        <h3>貝氏推論</h3>
        ${formula('後驗 ∝ 概似 × 先驗　　P(θ | 資料) ∝ P(資料 | θ) · P(θ)')}
        <p>貝氏學派把參數也看成隨機變數，用機率分配表達信念，看到資料後再更新。例：交易策略勝率 θ 的先驗為 Beta(1, 1)(均勻)，觀察到 w 賺 l 賠後，後驗為 Beta(1 + w, 1 + l)，後驗平均 (1 + w) ÷ (2 + w + l)。10 筆 7 賺時後驗平均 8/12 ≈ 66.7%，比 70% 保守；1000 筆 700 賺時 ≈ 69.9%，資料越多先驗影響越小。</p>
        <table class="stattable"><thead><tr><th></th><th>頻率學派</th><th>貝氏學派</th></tr></thead><tbody>
          <tr><td>參數</td><td ${L}>固定但未知</td><td ${L}>用機率分配描述的不確定量</td></tr>
          <tr><td>機率的意義</td><td ${L}>長期重複的相對次數</td><td ${L}>信念的程度</td></tr>
          <tr><td>區間</td><td ${L}>信賴區間</td><td ${L}>可信區間(可直接說參數有 95% 機率在其中)</td></tr>
          <tr><td>先驗資訊</td><td ${L}>不使用</td><td ${L}>明確納入</td></tr>
        </tbody></table>`,
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
          <div class="goals"><b>學習目標</b><ul>${ch.goals.map(g => `<li>${g}</li>`).join('')}</ul></div>
          ${ch.body()}
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
