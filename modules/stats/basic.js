/* 統計學 · 初級統計學
   給第一次修統計學的學生：章節架構參考 Seeing Theory 與常見教科書，
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
  const returns = rows => rows.slice(1).map((r, i) => r.close / rows[i].close - 1);
  async function loadIndex(key) {
    const { data } = await LT.loadJSON('indices', key + '.json');
    return data.d.map((d, i) => ({ date: d, close: data.c[i] }));
  }
  const formula = s => `<div class="formula">${s}</div>`;
  const tip = s => `<div class="callout">${s}</div>`;
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

  /* ---------- 章節 ---------- */
  const CHAPTERS = [
    {
      title: '認識統計學', st: null,
      goals: ['分辨敘述統計與推論統計', '理解母體、樣本、參數與統計量', '認識變數的類型與資料蒐集方式'],
      body: () => `
        <h3>統計學在做什麼</h3>
        <p>統計學是「從資料中學習，並在不確定的情況下做出合理結論」的方法。它分成兩大部分：</p>
        <ul>
          <li><b>敘述統計</b>：把手上的資料整理成表格、圖形與數字(平均、標準差…)，讓人一眼看懂。</li>
          <li><b>推論統計</b>：用一部分資料(樣本)去推估、檢驗整體(母體)的特性，並說明推論有多可靠。</li>
        </ul>
        <h3>母體與樣本</h3>
        <ul>
          <li><b>母體(population)</b>：我們想研究的全部對象，例如「所有台股上市公司」。描述母體的數字叫<b>參數</b>，通常用希臘字母表示：平均 μ、標準差 σ。</li>
          <li><b>樣本(sample)</b>：實際蒐集到的那一部分資料。描述樣本的數字叫<b>統計量</b>，用英文字母表示：樣本平均 x̄、樣本標準差 s。</li>
        </ul>
        <p>參數通常未知且固定；統計量會隨著抽到的樣本不同而改變，這個「會變」的特性正是推論統計的核心。</p>
        <h3>變數的類型</h3>
        <table class="stattable"><thead><tr><th>類型</th><th>細分</th><th>例子</th></tr></thead><tbody>
          <tr><td>類別(質性)</td><td>名目：沒有順序</td><td style="text-align:left">產業別、交易所</td></tr>
          <tr><td></td><td>順序：有順序但差距無意義</td><td style="text-align:left">信用評等 AAA、AA、A</td></tr>
          <tr><td>數值(量化)</td><td>離散：可數</td><td style="text-align:left">一天的成交筆數</td></tr>
          <tr><td></td><td>連續：可無限細分</td><td style="text-align:left">股價、報酬率</td></tr>
        </tbody></table>
        <h3>資料怎麼來</h3>
        <ul>
          <li><b>觀察研究</b>：只記錄、不介入(大部分金融資料都是)。只能看到「相關」，很難證明「因果」。</li>
          <li><b>實驗</b>：研究者主動分配處理，並用<b>隨機分派</b>排除其他因素，才能推論因果。</li>
        </ul>
        ${tip('<b>市場實例 · 倖存者偏差</b>：只統計「現在還存在」的基金績效，會漏掉已經清算的爛基金，平均績效就被高估了。樣本怎麼選，比樣本有多大更重要。')}`,
    },
    {
      title: '資料整理與圖表', st: null,
      goals: ['製作次數分配表', '依資料類型選擇適當圖表', '描述分配的形狀並找出離群值'],
      body: () => `
        <h3>次數分配表</h3>
        <p>把資料分成幾個組別，計算每組出現的<b>次數</b>、<b>相對次數</b>(次數÷總數)與<b>累積次數</b>。組數通常取 5～20 組，組距相同較容易比較。</p>
        <h3>選對圖表</h3>
        <table class="stattable"><thead><tr><th>資料</th><th>適合的圖</th><th>看什麼</th></tr></thead><tbody>
          <tr><td>類別</td><td>長條圖、圓餅圖</td><td style="text-align:left">各類別的多寡與占比</td></tr>
          <tr><td>數值</td><td>直方圖、莖葉圖</td><td style="text-align:left">分配的中心、散布與形狀</td></tr>
          <tr><td>數值</td><td>盒形圖</td><td style="text-align:left">五數摘要、離群值，適合多組比較</td></tr>
          <tr><td>時間序列</td><td>折線圖、K線圖</td><td style="text-align:left">趨勢、週期、轉折</td></tr>
          <tr><td>兩個數值變數</td><td>散佈圖</td><td style="text-align:left">兩者的關係(第9章)</td></tr>
        </tbody></table>
        <h3>分配的形狀</h3>
        <ul>
          <li><b>對稱</b>：左右大致一樣，平均數 ≈ 中位數。</li>
          <li><b>右偏(正偏)</b>：右邊拖著長尾巴，平均數 &gt; 中位數，例如所得、個股市值。</li>
          <li><b>左偏(負偏)</b>：左邊拖長尾巴，平均數 &lt; 中位數，例如股市崩跌時的報酬。</li>
          <li><b>單峰／雙峰</b>：出現兩個高峰時，常代表資料混了兩種不同的群體。</li>
        </ul>
        <h3>盒形圖與離群值</h3>
        <p>五數摘要：最小值、第一四分位數 Q1、中位數、第三四分位數 Q3、最大值。四分位距 IQR = Q3 − Q1。</p>
        ${formula('離群值：小於 Q1 − 1.5×IQR，或大於 Q3 + 1.5×IQR')}
        ${tip('<b>小心誤導的圖</b>：把縱軸從某個數字開始畫(截斷縱軸)，小小的漲跌會看起來像暴漲暴跌。看圖先看座標軸。')}`,
    },
    {
      title: '敘述統計量', st: null, live: 'describe',
      goals: ['計算平均數、中位數、眾數', '計算變異數、標準差與四分位距', '用 z 分數、偏態與峰態描述資料'],
      body: () => `
        <h3>集中趨勢：資料的「中心」在哪裡</h3>
        ${formula('樣本平均數 x̄ = Σxᵢ ÷ n')}
        <ul>
          <li><b>中位數</b>：由小到大排序後最中間的值，不受極端值影響。</li>
          <li><b>眾數</b>：出現次數最多的值，類別資料也能用。</li>
          <li>資料偏態時，中位數通常比平均數更能代表「典型」的值。</li>
        </ul>
        <h3>離散程度：資料有多「分散」</h3>
        ${formula('樣本變異數 s² = Σ(xᵢ − x̄)² ÷ (n − 1)　　樣本標準差 s = √s²')}
        <ul>
          <li>分母用 <b>n − 1</b> 而不是 n：因為 x̄ 是用同一組資料算出來的，會讓離差平方和偏小，除以 n−1 才能讓 s² 成為母體變異數的<b>不偏估計</b>。</li>
          <li><b>全距</b> = 最大值 − 最小值；<b>四分位距 IQR</b> = Q3 − Q1(較不受離群值影響)。</li>
          <li><b>變異係數 CV</b> = s ÷ x̄，用來比較單位或規模不同的資料。</li>
        </ul>
        <h3>相對位置與形狀</h3>
        ${formula('z 分數 = (x − x̄) ÷ s　→　這個值離平均數幾個標準差')}
        <ul>
          <li><b>偏態係數</b>：&gt;0 右偏、&lt;0 左偏、≈0 對稱。</li>
          <li><b>超額峰度</b>：常態分配為 0；&gt;0 代表「肥尾」，極端值比常態分配預期的更常出現。</li>
        </ul>
        ${tip('<b>金融用語</b>：報酬率的標準差就是「波動度」。日報酬標準差 × √252 ≈ 年化波動度(一年約 252 個交易日)。')}`,
    },
    {
      title: '機率基礎', st: ['basic-probability', 'Basic Probability'], demo: 'coin',
      goals: ['理解樣本空間、事件與機率的公理', '用大數法則解釋「機率」的意義', '計算期望值與變異數'],
      body: () => `
        <h3>基本名詞</h3>
        <ul>
          <li><b>隨機試驗</b>：結果事先無法確定的過程，例如擲骰子、明天大盤漲或跌。</li>
          <li><b>樣本空間 S</b>：所有可能結果的集合，擲一顆骰子 S = {1,2,3,4,5,6}。</li>
          <li><b>事件</b>：樣本空間的子集合，例如「擲出偶數」= {2,4,6}。</li>
        </ul>
        <h3>機率的三種觀點</h3>
        <ul>
          <li><b>古典</b>：每個結果同樣可能時，P(A) = A 的結果數 ÷ 全部結果數。</li>
          <li><b>相對次數(頻率)</b>：重複很多次後，事件發生的比例。</li>
          <li><b>主觀</b>：個人根據資訊對事件的信心程度，例如分析師估計升息機率。</li>
        </ul>
        <h3>機率公理</h3>
        ${formula('0 ≤ P(A) ≤ 1　　P(S) = 1　　A、B 互斥時 P(A 或 B) = P(A) + P(B)')}
        <h3>大數法則</h3>
        <p>試驗次數越多，事件發生的相對次數會越接近真正的機率。下方的擲硬幣模擬可以親眼看到：擲 10 次時正面比例可能差很多，擲幾千次後就會穩定在 50% 附近。</p>
        <h3>期望值與變異數</h3>
        ${formula('E[X] = Σ x · P(x)　　Var(X) = E[(X − μ)²] = Σ (x − μ)² · P(x)')}
        <p>擲一顆公平骰子：E[X] = (1+2+3+4+5+6)÷6 = <b>3.5</b>；Var(X) = 35/12 ≈ <b>2.92</b>。期望值是「長期平均」，不代表單次一定擲出 3.5。</p>
        ${tip('<b>賭徒謬誤</b>：連續擲出 5 次反面，下一次正面的機率仍是 50%。大數法則靠的是「次數多」把偏差稀釋，而不是「之後會補回來」。連跌好幾天的大盤，也不代表明天一定反彈。')}`,
    },
    {
      title: '複合機率與條件機率', st: ['compound-probability', 'Compound Probability'],
      goals: ['運用加法與乘法法則', '計算排列與組合', '理解條件機率、獨立與貝氏定理'],
      body: () => `
        <h3>集合與加法法則</h3>
        ${formula('P(A ∪ B) = P(A) + P(B) − P(A ∩ B)　　P(Aᶜ) = 1 − P(A)')}
        <p>減掉 P(A ∩ B) 是因為兩事件重疊的部分被算了兩次。</p>
        <h3>排列與組合</h3>
        ${formula('排列 nPr = n! ÷ (n − r)!(有順序)　　組合 nCr = n! ÷ [r!(n − r)!](不管順序)')}
        <p>例：從 10 檔股票挑 3 檔組成投資組合(不管順序)，共有 10C3 = 120 種選法。</p>
        <h3>條件機率</h3>
        ${formula('P(A | B) = P(A ∩ B) ÷ P(B)　→　「已知 B 發生」之下 A 發生的機率')}
        <p><b>乘法法則</b>：P(A ∩ B) = P(B) · P(A | B)。若 P(A | B) = P(A)，表示 B 發生與否不影響 A，稱兩事件<b>獨立</b>，此時 P(A ∩ B) = P(A) · P(B)。</p>
        <h3>貝氏定理</h3>
        ${formula('P(A | B) = P(B | A) · P(A) ÷ P(B)')}
        <p><b>經典例子</b>：某疾病盛行率 1%，檢驗的準確率 99%(有病時 99% 呈陽性、沒病時 1% 誤判為陽性)。檢驗陽性的人真的有病的機率是多少？</p>
        ${formula('P(陽性) = 0.01×0.99 + 0.99×0.01 = 0.0198　→　P(有病 | 陽性) = 0.0099 ÷ 0.0198 = 50%')}
        <p>只有一半！因為沒病的人太多，1% 的誤判就產生和真陽性一樣多的假陽性。<b>基礎比率(先驗)</b>非常重要。</p>
        ${tip('<b>市場實例</b>：「出現某個K棒型態後上漲的機率」就是條件機率 P(上漲 | 型態出現)。要拿它和「任意一天上漲的機率」比較，才知道這個型態有沒有額外資訊。可以到「指數 → K棒型態分析」實際看看。')}`,
    },
    {
      title: '機率分配', st: ['probability-distributions', 'Probability Distributions'], demo: 'clt', live: 'normal',
      goals: ['區分離散與連續隨機變數', '使用二項分配與常態分配', '理解中央極限定理'],
      body: () => `
        <h3>隨機變數</h3>
        <p>把隨機試驗的結果對應成數字的函數。<b>離散</b>隨機變數用機率質量函數(PMF)描述；<b>連續</b>隨機變數用機率密度函數(PDF)描述，機率是曲線下的面積。</p>
        <h3>二項分配 B(n, p)</h3>
        <p>做 n 次獨立試驗、每次成功機率 p，成功次數 X 的分配：</p>
        ${formula('P(X = k) = nCk · pᵏ · (1 − p)ⁿ⁻ᵏ　　E[X] = np　　Var(X) = np(1 − p)')}
        <p>例：一個策略單筆勝率 55%，做 20 筆，平均會贏 11 筆，標準差 √(20×0.55×0.45) ≈ 2.2 筆。</p>
        <h3>常態分配 N(μ, σ²)</h3>
        <p>對稱的鐘形曲線，由平均 μ 與標準差 σ 決定。任何常態變數都可標準化成 Z = (X − μ) ÷ σ ~ N(0, 1)。</p>
        ${formula('68–95–99.7 法則：約 68% 落在 μ±1σ、95% 落在 μ±2σ、99.7% 落在 μ±3σ')}
        <h3>中央極限定理(CLT)</h3>
        <p>不管母體長什麼樣子，只要樣本數 n 夠大(常用 n ≥ 30)，<b>樣本平均數</b>的分配會近似常態，平均為 μ、標準差為 σ/√n(稱為<b>標準誤</b>)。這是信賴區間與假設檢定能夠成立的基礎。下方的擲骰子模擬可以看到：一顆骰子的點數是平坦分配，但「多顆骰子的平均」就會變成鐘形。</p>`,
    },
    {
      title: '抽樣分配與估計', st: ['frequentist-inference', 'Frequentist Inference'], live: 'ci',
      goals: ['理解點估計與標準誤', '建立並正確解讀信賴區間', '估算需要的樣本數'],
      body: () => `
        <h3>點估計</h3>
        <p>用一個統計量去猜參數，例如用 x̄ 估計 μ、用 s 估計 σ。好的估計量應該<b>不偏</b>(平均而言猜得準)且<b>有效</b>(變異小)。</p>
        ${formula('標準誤 SE(x̄) = s ÷ √n　→　樣本數變成 4 倍，誤差只縮小一半')}
        <h3>信賴區間</h3>
        ${formula('μ 的 95% 信賴區間 ≈ x̄ ± 1.96 × s ÷ √n　(樣本小時把 1.96 換成 t 分配的臨界值)')}
        <p><b>正確解讀</b>：如果重複抽樣很多次、每次都用同樣方法算一個區間，大約 95% 的區間會包含真正的 μ。<br>
        <b>常見誤解</b>：「μ 有 95% 機率在這個區間內」— 在頻率學派裡 μ 是固定值，它要嘛在、要嘛不在。</p>
        <h3>需要多少樣本</h3>
        ${formula('希望誤差界限為 E：n = (z × σ ÷ E)²')}
        <h3>自助法(Bootstrap)</h3>
        <p>當公式難推導時，可以從手上的樣本「有放回地重複抽樣」上千次，每次算一次統計量，用這些結果的分布來估計標準誤與信賴區間。電腦普及後非常常用。</p>`,
    },
    {
      title: '假設檢定', st: null, live: 'ttest',
      goals: ['寫出虛無假設與對立假設', '正確解讀 p 值', '分辨型一、型二錯誤與統計顯著的限制'],
      body: () => `
        <h3>檢定的步驟</h3>
        <ol>
          <li>寫出<b>虛無假設 H₀</b>(通常是「沒有效果、沒有差異」)與<b>對立假設 H₁</b>。</li>
          <li>決定<b>顯著水準 α</b>(常用 0.05)。</li>
          <li>計算<b>檢定統計量</b>，例如單樣本 t 檢定：</li>
        </ol>
        ${formula('t = (x̄ − μ₀) ÷ (s ÷ √n)，自由度 n − 1')}
        <ol start="4">
          <li>求出 <b>p 值</b>：假設 H₀ 為真時，看到「至少這麼極端」結果的機率。</li>
          <li>p &lt; α 就拒絕 H₀；否則「沒有足夠證據拒絕 H₀」(不等於證明 H₀ 為真)。</li>
        </ol>
        <h3>p 值不是什麼</h3>
        <ul>
          <li>p 值<b>不是</b>「H₀ 為真的機率」，也不是「結果是巧合的機率」。</li>
          <li>p 值很小只代表資料和 H₀ 不太吻合，不代表效果很大或很重要。</li>
        </ul>
        <h3>兩種錯誤</h3>
        <table class="stattable"><thead><tr><th></th><th>H₀ 為真</th><th>H₀ 為假</th></tr></thead><tbody>
          <tr><td>拒絕 H₀</td><td>型一錯誤(機率 α)</td><td>正確(檢定力 1 − β)</td></tr>
          <tr><td>不拒絕 H₀</td><td>正確</td><td>型二錯誤(機率 β)</td></tr>
        </tbody></table>
        ${tip('<b>交易者特別注意 · 多重比較</b>：同時回測 100 個策略，就算全部都沒用，在 α = 0.05 下平均也會有 5 個「顯著」。挑出最好的那個去實戰，常常就是被運氣騙了。樣本外驗證很重要。')}`,
    },
    {
      title: '相關與迴歸', st: ['regression-analysis', 'Regression Analysis'], live: 'regress',
      goals: ['用散佈圖與相關係數描述兩變數的關係', '建立並解讀簡單線性迴歸', '理解 R² 與「相關不等於因果」'],
      body: () => `
        <h3>相關係數 r</h3>
        ${formula('r = Σ(xᵢ − x̄)(yᵢ − ȳ) ÷ [(n − 1) · sₓ · s_y]，介於 −1 與 1 之間')}
        <ul>
          <li>r 接近 1：強正相關；接近 −1：強負相關；接近 0：沒有<b>線性</b>關係(可能有曲線關係)。</li>
          <li>r 對離群值很敏感，一定要搭配散佈圖看。</li>
        </ul>
        <h3>簡單線性迴歸</h3>
        ${formula('ŷ = b₀ + b₁x　　b₁ = r × s_y ÷ sₓ　　b₀ = ȳ − b₁x̄')}
        <p><b>最小平方法</b>：找一條讓「殘差平方和 Σ(y − ŷ)²」最小的直線。斜率 b₁ 的意思是：x 每增加 1 單位，y 平均增加 b₁ 單位。</p>
        ${formula('判定係數 R² = r²　→　y 的變異中，有多少比例可以被 x 解釋')}
        <h3>使用迴歸要小心</h3>
        <ul>
          <li><b>相關不等於因果</b>：冰淇淋銷量和溺水人數正相關，真正的原因是天氣熱(第三變數)。</li>
          <li><b>外插</b>：在資料範圍以外做預測非常危險。</li>
          <li>檢查殘差：殘差應該隨機分布、沒有明顯型態。</li>
        </ul>
        ${tip('<b>金融用語 · Beta</b>：把個股報酬對大盤報酬做迴歸，斜率就是 β。β = 1.2 代表大盤漲 1%，這檔股票平均漲 1.2%。')}`,
    },
    {
      title: '貝氏推論入門', st: ['bayesian-inference', 'Bayesian Inference'],
      goals: ['理解先驗、概似與後驗', '用新資料更新信念', '比較頻率學派與貝氏學派'],
      body: () => `
        <h3>核心想法</h3>
        <p>貝氏推論把「參數」也看成不確定的量，用機率分配表達我們的信念，看到資料後再更新：</p>
        ${formula('後驗 ∝ 概似 × 先驗　　P(θ | 資料) ∝ P(資料 | θ) · P(θ)')}
        <ul>
          <li><b>先驗(prior)</b>：看資料之前對參數的信念。</li>
          <li><b>概似(likelihood)</b>：在不同參數值下，觀察到這筆資料的可能性。</li>
          <li><b>後驗(posterior)</b>：結合兩者後的新信念，可作為下一次的先驗。</li>
        </ul>
        <h3>例子：估計一個交易策略的勝率</h3>
        <p>勝率 θ 用 Beta(a, b) 分配表示信念。一開始完全沒概念，用 Beta(1, 1)(0～1 均勻)。觀察到 w 次賺、l 次賠之後：</p>
        ${formula('後驗 = Beta(a + w, b + l)　　後驗平均 = (a + w) ÷ (a + b + w + l)')}
        <p>回測 10 筆、7 賺 3 賠：後驗平均 = 8 ÷ 12 ≈ 66.7%，比直接算的 70% 保守一些；做到 1000 筆、700 賺時，後驗平均 ≈ 69.9%，資料多了先驗的影響就變小。樣本少時不輕易相信漂亮的勝率，這正是貝氏方法的好處。</p>
        <h3>頻率學派 vs 貝氏學派</h3>
        <table class="stattable"><thead><tr><th></th><th>頻率學派</th><th>貝氏學派</th></tr></thead><tbody>
          <tr><td>參數</td><td style="text-align:left">固定但未知</td><td style="text-align:left">用機率分配描述的不確定量</td></tr>
          <tr><td>機率的意義</td><td style="text-align:left">長期重複的相對次數</td><td style="text-align:left">信念的程度</td></tr>
          <tr><td>區間</td><td style="text-align:left">信賴區間</td><td style="text-align:left">可信區間(可直接說「參數有 95% 機率在其中」)</td></tr>
          <tr><td>先驗資訊</td><td style="text-align:left">不使用</td><td style="text-align:left">明確納入</td></tr>
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
      const p = 2 * (1 - normCdf(Math.abs(t)));
      return `<h3>市場實例 · 台股長期平均日報酬顯著不為 0 嗎？</h3>
        ${formula(`H₀：μ = 0　H₁：μ ≠ 0　　t = ${pc(m, 4)} ÷ (${pc(s, 3)} ÷ √${n}) = ${fmt(t)}`)}
        <p>自由度很大時 t 分配接近標準常態，雙尾 p 值 ≈ <b>${p < 0.0001 ? '< 0.0001' : fmt(p, 4)}</b>，在 α = 0.05 下${p < 0.05 ? '<b>拒絕</b> H₀：長期平均日報酬顯著不為 0' : '<b>無法拒絕</b> H₀：沒有足夠證據說長期平均日報酬不為 0'}。</p>
        <p class="note">即使統計上顯著，平均日報酬只有約 ${pc(m, 3)}，遠小於單日波動 ${pc(s)}：「統計顯著」和「實務上好不好賺」是兩回事。</p>`;
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
    coin: {
      html: `<h3>互動模擬 · 擲硬幣與大數法則</h3>
        <div class="btnrow-l"><button onclick="LTStat.coin(1)">擲 1 次</button><button onclick="LTStat.coin(10)">擲 10 次</button><button onclick="LTStat.coin(100)">擲 100 次</button><button onclick="LTStat.coin(1000)">擲 1000 次</button><button onclick="LTStat.coin(0)">重來</button></div>
        <div id="coinOut" class="mute" style="margin-top:10px;">按下按鈕開始擲硬幣</div>`,
    },
    clt: {
      html: `<h3>互動模擬 · 中央極限定理(擲骰子取平均)</h3>
        <div class="btnrow-l">每次擲 <select id="cltN"><option>1</option><option>2</option><option selected>5</option><option>30</option></select> 顆骰子取平均，重複
          <button onclick="LTStat.clt(100)">100 次</button><button onclick="LTStat.clt(1000)">1000 次</button><button onclick="LTStat.clt(0)">重來</button></div>
        <div id="cltOut" style="margin-top:10px;"></div>`,
    },
  };
  let coinFlips = [];
  let cltMeans = [];
  window.LTStat = {
    coin(k) {
      if (k === 0) coinFlips = []; else for (let i = 0; i < k; i++) coinFlips.push(Math.random() < 0.5 ? 1 : 0);
      const el = document.getElementById('coinOut'); if (!el) return;
      if (!coinFlips.length) { el.textContent = '按下按鈕開始擲硬幣'; return; }
      let h = 0; const path = coinFlips.map((f, i) => { h += f; return h / (i + 1); });
      const W = 640, H = 160, step = Math.max(1, Math.floor(path.length / 400));
      const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1).map((p, i, a) => `${(i / Math.max(a.length - 1, 1)) * W},${H - p * H}`).join(' ');
      el.innerHTML = `<div>擲了 <b>${coinFlips.length}</b> 次，正面 <b>${h}</b> 次，正面比例 <b>${(h / coinFlips.length * 100).toFixed(1)}%</b></div>
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--amber)" stroke-dasharray="4 3"/>
        <polyline points="${pts}" fill="none" stroke="var(--blue)" stroke-width="2"/></svg>
        <div class="note">藍線為累積正面比例，橘色虛線為真實機率 50%。次數越多，藍線越貼近 50%。</div>`;
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
          ${ch.demo ? `<div class="demo-box">${DEMOS[ch.demo].html}</div>` : ''}
          ${ch.live ? `<div class="live-box" id="liveBox"><span class="mute">正在用台股資料計算市場實例…</span></div>` : ''}
          <div class="chap-foot">${nav(idx - 1, '← 上一章')}${nav(idx + 1, '下一章 →')}</div>
        </article>
        <div class="panel doc">
          <h3>參考教材</h3>
          <ul>${BOOKS.map(b => `<li><b>${b[0]}</b> ${b[1]}：${b[2]}</li>`).join('')}
            <li><b>Seeing Theory</b>(布朗大學)：<a href="${ST}" target="_blank" rel="noopener">${ST} ↗</a> 互動視覺化教材，第 4～6、9、10 章可搭配使用</li></ul>
        </div>`;
      if (ch.demo === 'coin') { coinFlips = []; }
      if (ch.demo === 'clt') { cltMeans = []; window.LTStat.clt(0); }
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
