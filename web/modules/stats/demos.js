/* 統計學 · 章節內嵌的互動動畫
   在 Markdown 章節裡寫一行 [[demo 名稱]]，載入器(basic.js)會在該位置放一個容器並呼叫 LTStatDemos[名稱](el)。
   新增動畫：在下方加一個函數即可。 */
window.LTStatDemos = (() => {
  /* ---------- 排容原理：逐步加減，看每個區域被算了幾次 ---------- */
  const SETS3 = {
    circles: { A: [110, 95], B: [170, 95], C: [140, 148] }, r: 55, view: '0 0 280 230',
    // 每個區域：屬於哪些事件、標籤位置、例子中的人數
    regions: [
      { m: 'A', at: [78, 80], n: 14 }, { m: 'B', at: [202, 80], n: 10 }, { m: 'C', at: [140, 188], n: 7 },
      { m: 'AB', at: [140, 68], n: 5 }, { m: 'AC', at: [104, 136], n: 3 }, { m: 'BC', at: [176, 136], n: 2 },
      { m: 'ABC', at: [140, 112], n: 3 },
    ],
    names: { A: '數學', B: '英文', C: '國文' },
    total: 50,
  };
  const SETS2 = {
    circles: { A: [112, 108], B: [168, 108] }, r: 62, view: '0 0 280 216',
    regions: [{ m: 'A', at: [82, 108], n: 17 }, { m: 'B', at: [198, 108], n: 12 }, { m: 'AB', at: [140, 108], n: 8 }],
    names: { A: '數學', B: '英文' },
    total: 50,
  };
  // 每一步：加(+1)或減(−1)哪個交集
  const steps = sets => {
    const ev = Object.keys(sets.circles), out = [];
    for (let k = 1; k <= ev.length; k++) {
      combos(ev, k).forEach(c => out.push({ term: c.join(''), sign: k % 2 ? 1 : -1, order: k }));
    }
    return out;
  };
  function combos(arr, k) {
    if (k === 0) return [[]];
    return arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map(c => [x, ...c]));
  }
  const inTerm = (region, term) => [...term].every(e => region.includes(e));
  const tex = s => window.katex ? katex.renderToString(s, { throwOnError: false }) : s;
  const P = term => `P(${[...term].join(' \\cap ')})`;
  const COLOR = { 1: 'var(--blue)', 2: 'var(--amber)', 3: 'var(--up)' };

  function inclusionExclusion(el) {
    let n3 = true, at = 0, timer = null;
    el.innerHTML = `
      <h3>互動動畫 · 排容原理</h3>
      <div class="btnrow-l ie-ctrl">
        <button data-a="prev">◀ 上一步</button><button data-a="next">下一步 ▶</button><button data-a="play">▶ 自動播放</button><button data-a="reset">重來</button>
        <span style="flex:1"></span>
        <button data-a="n2">兩個事件</button><button data-a="n3">三個事件</button>
      </div>
      <div class="ie-wrap">
        <svg class="ie-svg" role="img" aria-label="排容原理文氏圖"></svg>
        <div class="ie-side">
          <div class="ie-formula"></div>
          <div class="ie-text"></div>
          <div class="ie-legend"><span><i style="background:var(--blue)"></i>算 1 次(正確)</span><span><i style="background:var(--amber)"></i>算 2 次</span><span><i style="background:var(--up)"></i>算 3 次</span><span><i class="ie-miss"></i>漏算(0 次)</span></div>
        </div>
      </div>`;
    const svg = el.querySelector('.ie-svg');
    const q = a => el.querySelector(`[data-a="${a}"]`);

    function draw() {
      const S = n3 ? SETS3 : SETS2, st = steps(S), done = st.slice(0, at), cur = st[at - 1];
      const ev = Object.keys(S.circles), id = 'ie' + (n3 ? 3 : 2);
      const count = rg => done.reduce((a, s) => a + (inTerm(rg.m, s.term) ? s.sign : 0), 0);
      // 區域圖形：在所屬圓內(巢狀 clipPath)且在其他圓外(mask)
      const defs = ev.map(e => `<clipPath id="${id}c${e}"><circle cx="${S.circles[e][0]}" cy="${S.circles[e][1]}" r="${S.r}"/></clipPath>`).join('')
        + S.regions.map(rg => `<mask id="${id}m${rg.m}"><rect width="280" height="240" fill="#fff"/>${ev.filter(e => !rg.m.includes(e)).map(e => `<circle cx="${S.circles[e][0]}" cy="${S.circles[e][1]}" r="${S.r}" fill="#000"/>`).join('')}</mask>`).join('');
      const regionShape = (rg, fill, extra = '') => [...rg.m].reduceRight((inner, e) => `<g clip-path="url(#${id}c${e})">${inner}</g>`,
        `<rect width="280" height="240" fill="${fill}" mask="url(#${id}m${rg.m})" ${extra}/>`);
      const fills = S.regions.map(rg => {
        const c = count(rg);
        if (c > 0) return regionShape(rg, COLOR[Math.min(c, 3)], 'fill-opacity=".55"');
        return at >= ev.length ? regionShape(rg, 'var(--up)', 'fill-opacity=".16"') : '';   // 漏算的區域
      }).join('');
      // 目前這一步的項目：閃爍外框
      const flash = cur ? S.regions.filter(rg => inTerm(rg.m, cur.term)).map(rg => regionShape(rg, cur.sign > 0 ? 'var(--text)' : 'var(--down)', 'class="ie-flash"')).join('') : '';
      const outlines = ev.map(e => `<circle cx="${S.circles[e][0]}" cy="${S.circles[e][1]}" r="${S.r}" fill="none" stroke="var(--text)" stroke-width="1.4"/>`).join('');
      const labels = ev.map(e => { const [x, y] = S.circles[e], dx = x < 140 ? -1 : x > 140 ? 1 : 0, dy = dx ? -1 : 1;
        return `<text x="${x + dx * S.r * 0.78}" y="${y + dy * S.r * (dx ? 0.92 : 1.15) + (dx ? 0 : 6)}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--text)">${e}</text>`; }).join('');
      const counts = at ? S.regions.map(rg => { const c = count(rg), miss = c === 0 && at >= ev.length;
        return `<text x="${rg.at[0]}" y="${rg.at[1] + 4}" font-size="12" font-weight="700" text-anchor="middle" fill="${miss ? 'var(--up)' : 'var(--text)'}">${miss ? '漏' : c ? '×' + c : ''}</text>`; }).join('') : '';
      svg.setAttribute('viewBox', S.view);
      svg.innerHTML = `<defs>${defs}</defs><rect x="4" y="4" width="272" height="${S.view.split(' ')[3] - 8}" rx="8" fill="none" stroke="var(--border-strong)"/>
        <text x="16" y="22" font-size="12" fill="var(--mute)">S</text>${fills}${flash}${outlines}${labels}${counts}`;

      // 公式：已經做到的項目亮起來
      const terms = st.map((s, i) => `<span class="ie-term ${i < at ? 'on' : ''} ${i === at - 1 ? 'cur' : ''}">${tex((i === 0 ? '' : s.sign > 0 ? '+\\,' : '-\\,') + P(s.term))}</span>`).join(' ');
      el.querySelector('.ie-formula').innerHTML = `${tex(`P(${ev.join(' \\cup ')}) =`)} ${terms}`;
      // 例子：某班 50 人，喜歡各科目的人數
      const size = term => S.regions.filter(rg => inTerm(rg.m, term)).reduce((a, rg) => a + rg.n, 0);
      const running = done.reduce((a, s) => a + s.sign * size(s.term), 0), union = S.regions.reduce((a, rg) => a + rg.n, 0);
      const people = ev.map(e => `喜歡${S.names[e]} ${size(e)} 人`).join('、');
      const pairs = st.filter(s => s.order > 1).map(s => `${[...s.term].map(e => S.names[e]).join('與')}都喜歡 ${size(s.term)} 人`).join('、');
      let msg;
      if (!at) msg = `每個區域上的數字表示它<b>被算了幾次</b>。按「下一步」開始。`;
      else if (at < ev.length) msg = `${cur.sign > 0 ? '加上' : '減去'} ${tex(P(cur.term))}：${cur.term} 範圍內的每一區都多算一次。`;
      else if (at === ev.length) msg = n3 ? `三個機率直接相加後，兩兩重疊的區域被算了 <b>2 次</b>，中間三者重疊的區域被算了 <b>3 次</b>，要把多算的扣掉。`
        : `兩個機率直接相加後，重疊的區域被算了 <b>2 次</b>，要扣掉一次。`;
      else if (at === st.length) msg = n3 ? `把 ${tex(P(cur.term))} 加回來，<b>每個區域都剛好算 1 次</b>，就是聯集的機率。`
        : `減去 ${tex(P(cur.term))}：重疊區域從 2 次變成 1 次，<b>每個區域都剛好算 1 次</b>，就是聯集的機率。`;
      else if (n3 && at === st.length - 1) msg = `三個兩兩交集都扣掉後，兩兩重疊的區域剛好剩 1 次，但中間區域被 <b>加了 3 次、又扣了 3 次</b>，變成 0 次 → 漏算了！`;
      else msg = `減去 ${tex(P(cur.term))}：這個交集裡的區域各少算一次。`;
      el.querySelector('.ie-text').innerHTML = `<p>${msg}</p>
        <div class="ie-example">例：某班 ${S.total} 人，${people}；${pairs}。至少喜歡一科的人數，依目前的式子計算 = <b>${running}</b>${at === st.length ? ` ✓(實際 ${union} 人)` : ''}</div>
        <div class="mute" style="font-size:12px;">第 ${at} / ${st.length} 步</div>`;
      q('prev').disabled = at === 0; q('next').disabled = at === st.length;
      q('n2').classList.toggle('active', !n3); q('n3').classList.toggle('active', n3);
    }
    function stop() { clearInterval(timer); timer = null; q('play').textContent = '▶ 自動播放'; }
    function go(k) { const total = steps(n3 ? SETS3 : SETS2).length; at = Math.max(0, Math.min(total, k)); draw(); }
    el.querySelector('.ie-ctrl').onclick = ev => {
      const a = ev.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'next') { stop(); go(at + 1); }
      if (a === 'prev') { stop(); go(at - 1); }
      if (a === 'reset') { stop(); go(0); }
      if (a === 'n2' || a === 'n3') { stop(); n3 = a === 'n3'; go(0); }
      if (a === 'play') {
        if (timer) { stop(); return; }
        const total = steps(n3 ? SETS3 : SETS2).length;
        if (at === total) go(0);
        q('play').textContent = '❚❚ 暫停';
        timer = setInterval(() => { if (!el.isConnected || at >= total) { stop(); return; } go(at + 1); if (at >= total) stop(); }, 1800);
      }
    };
    draw();
  }

  /* ---------- 機率樹：全機率定理與貝氏定理 ---------- */
  const TREE_PRESETS = {
    factory: { title: '工廠與不良品', a: ['甲廠', '乙廠', '丙廠'], b: '不良品', bc: '良品', pa: [0.5, 0.3, 0.2], pb: [0.01, 0.02, 0.03] },
    medical: { title: '醫學檢驗(第 2 章例二)', a: ['有病', '沒病'], b: '陽性', bc: '陰性', pa: [0.01, 0.99], pb: [0.99, 0.01] },
  };
  const pct = (v, d = 2) => (v * 100).toFixed(d).replace(/\.?0+$/, '') + '%';
  function probabilityTree(el) {
    let preset = 'factory', S = JSON.parse(JSON.stringify(TREE_PRESETS.factory));
    el.innerHTML = `
      <h3>互動機率樹 · 全機率定理</h3>
      <div class="btnrow-l pt-ctrl"><button data-p="factory">工廠與不良品</button><button data-p="medical">醫學檢驗</button></div>
      <div class="pt-inputs"></div>
      <svg class="pt-svg" role="img" aria-label="機率樹"></svg>
      <div class="pt-calc"></div>`;
    const inputs = el.querySelector('.pt-inputs'), svg = el.querySelector('.pt-svg'), calc = el.querySelector('.pt-calc');
    function buildInputs() {
      const k = S.a.length;
      inputs.innerHTML = `<div class="paramgrid">${S.a.map((name, i) => `
        <div class="paramitem"><label>P(${name}) ${i === k - 1 ? '<small class="mute">= 1 − 其他</small>' : ''}</label>
          <input type="number" min="0" max="1" step="0.01" data-k="pa" data-i="${i}" value="${S.pa[i]}" ${i === k - 1 ? 'disabled' : ''}></div>
        <div class="paramitem"><label>P(${S.b} | ${name})</label><input type="number" min="0" max="1" step="0.01" data-k="pb" data-i="${i}" value="${S.pb[i]}"></div>`).join('')}</div>`;
      inputs.querySelectorAll('input').forEach(inp => inp.oninput = () => {
        const v = Math.min(1, Math.max(0, +inp.value || 0));
        S[inp.dataset.k][+inp.dataset.i] = v;
        if (inp.dataset.k === 'pa') {   // 最後一個分支 = 1 − 其他，維持分割
          const last = S.a.length - 1;
          S.pa[last] = Math.max(0, +(1 - S.pa.slice(0, last).reduce((a, b) => a + b, 0)).toFixed(6));
          inputs.querySelector(`[data-k=pa][data-i="${last}"]`).value = S.pa[last];
        }
        draw();
      });
    }
    function draw() {
      // 窄螢幕(手機)：縮短間距、只寫路徑機率，字才不會太小
      const narrow = (el.clientWidth || 600) < 560;
      const k = S.a.length, rowH = narrow ? 84 : 92, H = k * rowH + 16, W = narrow ? 300 : 560;
      const x0 = narrow ? 12 : 24, x1 = narrow ? 104 : 200, x2 = narrow ? 186 : 330, x3 = narrow ? 238 : 400;
      const y1 = i => 8 + rowH * (i + 0.5), y2 = (i, j) => y1(i) + (j ? 22 : -22);
      const leaf = S.a.map((_, i) => [S.pa[i] * S.pb[i], S.pa[i] * (1 - S.pb[i])]);
      const pB = leaf.reduce((a, l) => a + l[0], 0), yr = H / 2;
      let g = '';
      S.a.forEach((name, i) => {
        g += `<line x1="${x0 + 8}" y1="${yr}" x2="${x1 - 30}" y2="${y1(i)}" stroke="var(--border-strong)" stroke-width="1.5"/>
          <text x="${(x0 + x1) / 2 - 6}" y="${(yr + y1(i)) / 2 - 6}" font-size="13" text-anchor="middle" fill="var(--dim)">${pct(S.pa[i])}</text>
          <text x="${x1 - 24}" y="${y1(i) + 5}" font-size="14" font-weight="700" fill="var(--text)">${name}</text>`;
        [0, 1].forEach(j => {
          const isB = j === 0, p = isB ? S.pb[i] : 1 - S.pb[i];
          g += `<line x1="${x1 + 26}" y1="${y1(i)}" x2="${x2 - 6}" y2="${y2(i, j)}" stroke="${isB ? 'var(--amber)' : 'var(--border-strong)'}" stroke-width="${isB ? 2.2 : 1.5}"/>
            <text x="${(x1 + x2) / 2 + 10}" y="${(y1(i) + y2(i, j)) / 2 + (j ? 14 : -5)}" font-size="12" text-anchor="middle" fill="var(--dim)">${pct(p)}</text>
            <text x="${x2}" y="${y2(i, j) + 5}" font-size="13" font-weight="${isB ? 700 : 400}" fill="${isB ? 'var(--amber)' : 'var(--mute)'}">${isB ? S.b : S.bc}</text>
            <text x="${x3 + 10}" y="${y2(i, j) + 5}" font-size="12.5" fill="${isB ? 'var(--amber)' : 'var(--mute)'}">${narrow ? '' : `${pct(S.pa[i])} × ${pct(p)} = `}<tspan font-weight="700">${pct(leaf[i][j], 3)}</tspan></text>`;
        });
      });
      svg.setAttribute('viewBox', `0 0 ${W + (narrow ? 20 : 60)} ${H}`);
      svg.innerHTML = `<circle cx="${x0}" cy="${yr}" r="6" fill="var(--text)"/>${g}`;
      const post = leaf.map(l => pB > 0 ? l[0] / pB : NaN);
      calc.innerHTML = `
        <p><b>全機率定理</b>：把所有通往「${S.b}」的路徑(橘色)機率相加，
          P(${S.b}) = ${S.a.map((n, i) => `${pct(leaf[i][0], 3)}`).join(' + ')} = <b>${pct(pB, 3)}</b></p>
        <p><b>反推(貝氏定理)</b>：已知結果是「${S.b}」，來自各分支的機率 = 該路徑 ÷ 全部橘色路徑：
          ${S.a.map((n, i) => `P(${n} | ${S.b}) = ${pct(leaf[i][0], 3)} ÷ ${pct(pB, 3)} = <b>${Number.isFinite(post[i]) ? pct(post[i], 1) : '—'}</b>`).join('；')}</p>`;
      el.querySelectorAll('.pt-ctrl button').forEach(b => b.classList.toggle('active', b.dataset.p === preset));
    }
    el.querySelector('.pt-ctrl').onclick = ev => {
      const p = ev.target.closest('button')?.dataset.p; if (!p) return;
      preset = p; S = JSON.parse(JSON.stringify(TREE_PRESETS[p])); buildInputs(); draw();
    };
    buildInputs(); draw();
    let lastNarrow = (el.clientWidth || 600) < 560;
    new ResizeObserver(() => { const n = el.clientWidth < 560; if (n !== lastNarrow) { lastNarrow = n; draw(); } }).observe(el);
  }

  /* ---------- 生日問題 ---------- */
  const sameBirthday = n => { let q = 1; for (let i = 0; i < n; i++) q *= (365 - i) / 365; return 1 - q; };
  function birthday(el) {
    const N = 80, xs = Array.from({ length: N }, (_, i) => i + 1);
    el.innerHTML = `
      <h3>互動模擬 · 生日問題</h3>
      <div class="paramitem bd-slider"><label for="bdN">班上人數 n <b id="bdNv">23</b></label><input id="bdN" type="range" min="2" max="${N}" value="23"></div>
      <div class="statgrid" id="bdStats" style="margin:12px 0;"></div>
      <div id="bdChart"></div>
      <div class="btnrow-l" style="margin-top:10px;"><button data-a="one">模擬一個班級</button></div>
      <div id="bdOut" class="note" style="margin-top:8px;">按下按鈕，隨機產生 n 個人的生日。</div>`;
    const $ = s => el.querySelector(s);
    function draw() {
      const n = +$('#bdN').value;
      $('#bdNv').textContent = n;
      $('#bdStats').innerHTML = `
        <div class="stat"><div class="v">${pct(sameBirthday(n), 1)}</div><div class="l">至少兩人同一天生日</div></div>
        <div class="stat"><div class="v">${(n * (n - 1) / 2).toLocaleString()}</div><div class="l">兩兩配對的組數 C(n, 2)</div></div>
        <div class="stat"><div class="v">${pct(1 - (364 / 365) ** (n - 1), 1)}</div><div class="l">有人和「你」同一天生日</div></div>`;
      LTChart.line($('#bdChart'), {
        x: xs, height: 220, label: '生日問題機率', xFmt: v => v + ' 人', yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => pct(v, 1),
        series: [{ name: '至少兩人同一天', y: xs.map(sameBirthday), color: 'var(--amber)' }, { name: '有人和你同一天', y: xs.map(m => 1 - (364 / 365) ** (m - 1)), color: 'var(--blue)', width: 1.5 }],
        refY: [{ y: 0.5, label: '50%' }], points: [{ x: n, y: sameBirthday(n), color: 'var(--amber)', label: pct(sameBirthday(n), 1) }],
      });
    }
    const randomClass = n => Array.from({ length: n }, () => Math.floor(Math.random() * 365));
    const md = d => { const t = new Date(2025, 0, 1 + d); return `${t.getMonth() + 1}/${t.getDate()}`; };
    el.querySelector('.btnrow-l').onclick = ev => {
      const a = ev.target.closest('button')?.dataset.a, n = +$('#bdN').value; if (!a) return;
      if (a === 'one') {
        const days = randomClass(n), cnt = {};
        days.forEach(d => { cnt[d] = (cnt[d] || 0) + 1; });
        const dup = Object.entries(cnt).filter(([, c]) => c > 1);
        $('#bdOut').innerHTML = `${n} 人的生日：${days.slice().sort((x, y) => x - y).map(d => cnt[d] > 1 ? `<b style="color:var(--amber)">${md(d)}</b>` : md(d)).join('、')}<br>
          ${dup.length ? `有 <b>${dup.length}</b> 組同一天生日：${dup.map(([d, c]) => `${md(+d)}(${c} 人)`).join('、')}` : '這一班沒有人同一天生日。'}`;
      }
    };
    $('#bdN').oninput = draw;
    draw();
  }

  /* ---------- 圖解：樣本空間的分割與事件 B 被切成的小塊 ---------- */
  function partition(el) {
    const xs = [20, 150, 250, 370, 460], names = ['A₁', 'A₂', 'A₃', 'A₄'];
    const id = 'pt' + Math.random().toString(36).slice(2, 7);
    el.innerHTML = `
      <svg viewBox="0 0 480 220" class="part-svg" role="img" aria-label="樣本空間 S 被分割成 A1 到 A4，事件 B 被切成四塊">
        <defs><clipPath id="${id}"><ellipse cx="240" cy="128" rx="190" ry="52"/></clipPath></defs>
        <rect x="20" y="30" width="440" height="170" rx="8" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>
        <text x="28" y="22" font-size="13" fill="var(--mute)">S</text>
        ${names.map((n, i) => `<rect x="${xs[i]}" y="30" width="${xs[i + 1] - xs[i]}" height="170" fill="${i % 2 ? 'var(--panel)' : 'var(--panel2)'}" stroke="var(--border-strong)"/>
          <text x="${(xs[i] + xs[i + 1]) / 2}" y="56" font-size="15" font-weight="700" text-anchor="middle" fill="var(--text)">${n}</text>`).join('')}
        <g clip-path="url(#${id})">${names.map((n, i) => `<rect x="${xs[i]}" y="30" width="${xs[i + 1] - xs[i]}" height="170" fill="var(--amber)" fill-opacity="${0.22 + i * 0.1}"/>`).join('')}</g>
        <ellipse cx="240" cy="128" rx="190" ry="52" fill="none" stroke="var(--amber)" stroke-width="2"/>
        ${names.map((n, i) => `<text x="${(xs[i] + xs[i + 1]) / 2 + (i === 0 ? 22 : i === 3 ? -14 : 0)}" y="133" font-size="12" text-anchor="middle" fill="var(--text)">B∩${n}</text>`).join('')}
        <text x="440" y="96" font-size="14" font-weight="700" text-anchor="end" fill="var(--amber)">B</text>
      </svg>
      <div class="note" style="text-align:center;margin-top:4px;">A₁～A₄ 互不重疊、合起來剛好是 S；事件 B(橘色)因此被切成互斥的四塊 B∩A₁、…、B∩A₄。</div>`;
  }

  return { 'inclusion-exclusion': inclusionExclusion, 'probability-tree': probabilityTree, birthday, partition };
})();
