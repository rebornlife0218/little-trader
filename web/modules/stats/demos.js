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

  /* ---------- 準確度與精確度：四個靶(靶心 = 真值 θ，每個點 = 一次抽樣得到的估計值) ---------- */
  function targets(el) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
    const CASES = [
      { t: '準確又精確', s: '不偏、變異數小', dx: 0, dy: 0, sd: 5 },
      { t: '準確不精確', s: '不偏、變異數大', dx: 0, dy: 0, sd: 17 },
      { t: '精確不準確', s: '有偏誤、變異數小', dx: 22, dy: -20, sd: 5 },
      { t: '不準確也不精確', s: '有偏誤、變異數大', dx: 22, dy: -20, sd: 17 },
    ];
    const W = 150, cy = 72;
    el.innerHTML = `
      <svg viewBox="0 0 ${W * 4} 176" class="part-svg" role="img" aria-label="四個靶：準確又精確、準確不精確、精確不準確、不準確也不精確">
        ${CASES.map((c, k) => {
          const cx = W * k + W / 2;
          const pts = Array.from({ length: 12 }, () => [cx + c.dx + gauss() * c.sd, cy + c.dy + gauss() * c.sd]);
          return [56, 40, 24, 9].map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 ? 'var(--panel)' : 'var(--panel2)'}" stroke="var(--border-strong)"/>`).join('')
            + `<circle cx="${cx}" cy="${cy}" r="2.5" fill="var(--text)"/>`
            + pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="var(--amber)" stroke="var(--panel)" stroke-width="1"/>`).join('')
            + `<text x="${cx}" y="150" font-size="13" font-weight="700" text-anchor="middle" fill="var(--text)">${c.t}</text>
               <text x="${cx}" y="168" font-size="11.5" text-anchor="middle" fill="var(--mute)">${c.s}</text>`;
        }).join('')}
      </svg>
      <div class="note" style="text-align:center;margin-top:4px;">靶心是真值 θ，每個橘點是一次抽樣算出的估計值 θ̂。點群的中心離靶心多遠是<b>準確度</b>(偏誤)，點彼此有多集中是<b>精確度</b>(變異數)。</div>`;
  }

  /* ---------- 機率模型關係圖：點選分配，看它和其他分配的連結 ---------- */
  const DIST_NODES = {
    bern:   { x: 90,  y: 70,  name: '伯努利', kind: 'd', desc: '一次試驗，成功記 1、失敗記 0。所有「成功次數」類分配的基本單位。' },
    binom:  { x: 280, y: 70,  name: '二項', kind: 'd', desc: 'n 次獨立伯努利試驗的成功次數。' },
    hyper:  { x: 280, y: 180, name: '超幾何', kind: 'd', desc: '不放回抽樣的成功次數；母體很大時接近二項。' },
    geom:   { x: 90,  y: 230, name: '幾何', kind: 'd', desc: '第一次成功發生在第幾次；離散分配中唯一有無記憶性的。' },
    nbin:   { x: 90,  y: 380, name: '負二項', kind: 'd', desc: '第 r 次成功發生在第幾次 = r 個獨立幾何分配相加。' },
    pois:   { x: 450, y: 180, name: '卜瓦松', kind: 'd', desc: '單位時間(空間)內事件發生的次數；稀有事件的二項分配極限。' },
    unif:   { x: 280, y: 330, name: '均勻', kind: 'c', desc: '區間內每個值機會相同；電腦產生隨機數的起點，可轉換成其他分配。' },
    expo:   { x: 450, y: 330, name: '指數', kind: 'c', desc: '卜瓦松過程中兩次事件的間隔時間；連續分配中唯一有無記憶性的。' },
    sexp:   { x: 450, y: 470, name: '平移指數', kind: 'c', desc: '指數分配往右平移 θ：至少要等 θ，超過 θ 之後才是指數分配。' },
    lap:    { x: 650, y: 470, name: '雙指數', kind: 'c', desc: '以 μ 為中心、左右各一個指數分配(Laplace)；峰尖尾厚，比常態更像日報酬。' },
    gamma:  { x: 650, y: 330, name: '伽瑪', kind: 'c', desc: '第 α 個事件發生的等待時間 = α 個獨立指數分配相加。' },
    chi2:   { x: 850, y: 330, name: '卡方', kind: 'c', desc: 'k 個獨立標準常態的平方和；是伽瑪分配的特例，用於變異數推論(第 6 章)。' },
    norm:   { x: 650, y: 70,  name: '常態', kind: 'c', desc: '大量獨立因素相加的結果(中央極限定理)；許多分配的極限。' },
    snorm:  { x: 850, y: 70,  name: '標準常態', kind: 'c', desc: '平均 0、標準差 1 的常態；任何常態標準化後都是它，查表只需要這一張。' },
    lnorm:  { x: 760, y: 200, name: '對數常態', kind: 'c', desc: '取對數後是常態；恆為正、右偏，常用來描述股價、所得。' },
  };
  // [起點, 終點, 說明, 類型]：rel 關係(變換、特例、相加)、lim 極限近似、ana 類比
  const DIST_EDGES = [
    ['bern', 'binom', 'n 個獨立相加', 'rel'], ['bern', 'geom', '第一次成功的次數', 'rel'], ['geom', 'nbin', 'r 個獨立相加', 'rel'],
    ['hyper', 'binom', 'N 很大(n/N 小)', 'lim'], ['binom', 'pois', 'n→∞、p→0、np=λ', 'lim'], ['binom', 'norm', 'n 大(中央極限定理)', 'lim'],
    ['pois', 'norm', 'λ 大', 'lim'], ['pois', 'expo', '事件間隔時間', 'rel'], ['geom', 'expo', '連續版本(無記憶性)', 'ana'],
    ['unif', 'expo', '−ln(U) ÷ λ', 'rel'], ['expo', 'gamma', 'α 個獨立相加', 'rel'], ['gamma', 'chi2', 'λ = ½、α = k/2', 'rel'],
    ['snorm', 'chi2', 'k 個平方相加', 'rel'], ['norm', 'snorm', '標準化 (X−μ)/σ', 'rel'], ['norm', 'lnorm', '取指數 eˣ', 'rel'],
    ['expo', 'sexp', '加上常數 θ', 'rel'], ['expo', 'lap', '兩個獨立指數相減', 'rel'],
  ];
  function distMap(el) {
    const W = 940, H = 530, BW = 92, BH = 34;
    let sel = null;
    el.innerHTML = `
      <h3>互動圖 · 機率模型之間的連結</h3>
      <p class="note" style="margin-top:0;">點選任一個分配，會標出它和哪些分配有關係；再點一次或點空白處取消。</p>
      <div class="dm-wrap"><svg class="dm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="機率模型關係圖"></svg></div>
      <div class="dm-legend"><span><i class="dm-l rel"></i>變換、特例或相加</span><span><i class="dm-l lim"></i>極限(近似)</span><span><i class="dm-l ana"></i>類比</span><span><i class="dm-n d"></i>離散</span><span><i class="dm-n c"></i>連續</span></div>
      <div class="dm-info"></div>`;
    const svg = el.querySelector('.dm-svg'), info = el.querySelector('.dm-info');
    // 從方塊邊緣出發的線段端點
    const edgePt = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, sx = (BW / 2 + 4) / Math.abs(dx || 1e-9), sy = (BH / 2 + 4) / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
      return [a.x + dx * s, a.y + dy * s];
    };
    function draw() {
      const related = new Set(sel ? [sel] : []);
      DIST_EDGES.forEach(([a, b]) => { if (a === sel) related.add(b); if (b === sel) related.add(a); });
      const lines = DIST_EDGES.map(([a, b, label, type]) => {
        const A = DIST_NODES[a], B = DIST_NODES[b], [x1, y1] = edgePt(A, B), [x2, y2] = edgePt(B, A);
        const on = !sel || a === sel || b === sel, horiz = Math.abs(y2 - y1) < 8;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - (horiz ? 12 : 0);   // 水平線的說明放在線的上方，不蓋住箭頭
        const color = type === 'lim' ? 'var(--amber)' : type === 'ana' ? 'var(--dim)' : 'var(--blue)';
        return `<g class="dm-edge" opacity="${on ? 1 : 0.12}">
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sel && on ? 2.4 : 1.6}" ${type === 'ana' ? 'stroke-dasharray="5 4"' : type === 'lim' ? 'stroke-dasharray="2 3"' : ''} marker-end="url(#dm-arrow-${type})"/>
          <rect x="${mx - label.length * 6.2 - 4}" y="${my - 9}" width="${label.length * 12.4 + 8}" height="18" rx="4" fill="var(--panel)" opacity=".92"/>
          <text x="${mx}" y="${my + 4}" font-size="11.5" text-anchor="middle" fill="${color}">${label}</text></g>`;
      }).join('');
      const nodes = Object.entries(DIST_NODES).map(([k, n]) => {
        const on = !sel || related.has(k);
        return `<g class="dm-node" data-k="${k}" opacity="${on ? 1 : 0.25}" style="cursor:pointer">
          <rect x="${n.x - BW / 2}" y="${n.y - BH / 2}" width="${BW}" height="${BH}" rx="${n.kind === 'd' ? 4 : 17}" fill="${k === sel ? 'var(--amber-soft)' : 'var(--panel2)'}" stroke="${k === sel ? 'var(--amber)' : n.kind === 'd' ? 'var(--border-strong)' : 'var(--blue)'}" stroke-width="${k === sel ? 2.4 : 1.4}"/>
          <text x="${n.x}" y="${n.y + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="var(--text)">${n.name}</text></g>`;
      }).join('');
      const arrow = (id, c) => `<marker id="dm-arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
      svg.innerHTML = `<defs>${arrow('rel', 'var(--blue)')}${arrow('lim', 'var(--amber)')}${arrow('ana', 'var(--dim)')}</defs>
        <text x="20" y="${H - 14}" font-size="12" fill="var(--mute)">方角 = 離散　圓角 = 連續　箭頭：從 A 得到 B</text>${lines}${nodes}`;
      if (!sel) { info.innerHTML = '<span class="mute">尚未選取分配。</span>'; return; }
      const n = DIST_NODES[sel];
      const rel = DIST_EDGES.filter(([a, b]) => a === sel || b === sel).map(([a, b, label]) => `<li>${a === sel ? `${n.name} → <b>${DIST_NODES[b].name}</b>` : `<b>${DIST_NODES[a].name}</b> → ${n.name}`}：${label}</li>`).join('');
      info.innerHTML = `<b>${n.name}分配</b>(${n.kind === 'd' ? '離散' : '連續'})：${n.desc}<ul>${rel}</ul>`;
    }
    svg.addEventListener('click', e => {
      const g = e.target.closest('.dm-node');
      sel = g ? (g.dataset.k === sel ? null : g.dataset.k) : null;
      draw();
    });
    draw();
  }

  /* ---------- 標準常態的尾點：選右尾、左尾或雙尾與 α，畫出尾巴面積與臨界值 ---------- */
  const Z_CRIT = [[0.10, 1.2816], [0.05, 1.6449], [0.025, 1.9600], [0.01, 2.3263], [0.005, 2.5758]];   // [右尾面積, z]
  function zTail(el) {
    const H = 250, padX = 16, padT = 22, padB = 34, LO = -4, HI = 4;
    let W = 560;   // 手機寬度改用較窄的畫布，文字才不會縮得太小
    const pdf = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    const sx = z => padX + (z - LO) / (HI - LO) * (W - padX * 2), sy = d => H - padB - d / pdf(0) * (H - padT - padB - 30);
    const num = v => String(+v.toFixed(3));
    let mode = 'right', k = 1;   // k = Z_CRIT 的位置；切換單、雙尾時臨界值不變(右尾 0.05 ↔ 雙尾 0.10)
    el.innerHTML = `
      <h3>互動圖 · 標準常態的尾點</h3>
      <div class="btnrow-l zt-mode">${[['right', '右尾'], ['left', '左尾'], ['two', '雙尾']].map(([m, t]) => `<button data-m="${m}">${t}</button>`).join('')}</div>
      <div class="btnrow-l zt-alpha" style="margin-top:8px;"></div>
      <svg class="part-svg zt-svg" role="img" aria-label="標準常態密度曲線與尾巴面積" style="max-width:640px;margin-top:8px;"></svg>
      <div class="zt-text" style="margin-top:6px;font-size:13.5px;line-height:1.9;"></div>`;
    const svg = el.querySelector('.zt-svg'), text = el.querySelector('.zt-text');
    const area = (a, b) => {   // a 到 b 之間曲線下的面積(多邊形)
      const pts = []; for (let i = 0; i <= 80; i++) { const z = a + (b - a) * i / 80; pts.push(`${sx(z).toFixed(1)},${sy(pdf(z)).toFixed(1)}`); }
      return `<polygon points="${sx(a).toFixed(1)},${sy(0)} ${pts.join(' ')} ${sx(b).toFixed(1)},${sy(0)}" fill="var(--amber)" fill-opacity=".45"/>`;
    };
    const zName = (neg, a, rest) => `${neg ? '−' : ''}z<tspan font-size="11" dy="4">${a}</tspan><tspan dy="-4">${rest}</tspan>`;   // z 加下標
    function draw() {
      W = (el.clientWidth || 600) < 520 ? 380 : 560;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const two = mode === 'two', [a1, z] = Z_CRIT[k], alpha = two ? a1 * 2 : a1, tail = two ? alpha / 2 : alpha;
      el.querySelectorAll('.zt-mode button').forEach(b => b.classList.toggle('active', b.dataset.m === mode));
      el.querySelector('.zt-alpha').innerHTML = '<span class="mute" style="align-self:center;">α =</span>'
        + Z_CRIT.map(([a], i) => `<button data-k="${i}" class="${i === k ? 'active' : ''}">${num(two ? a * 2 : a)}</button>`).join('');
      const curve = []; for (let i = 0; i <= 160; i++) { const x = LO + (HI - LO) * i / 160; curve.push(`${sx(x).toFixed(1)},${sy(pdf(x)).toFixed(1)}`); }
      const cuts = mode === 'right' ? [z] : mode === 'left' ? [-z] : [-z, z];
      let g = (mode !== 'left' ? area(z, HI) : '') + (mode !== 'right' ? area(LO, -z) : '');
      g += `<line x1="${padX}" y1="${sy(0)}" x2="${W - padX}" y2="${sy(0)}" stroke="var(--border-strong)"/>`;
      g += `<polyline points="${curve.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.2"/>`;
      // 刻度：整數 z，和臨界值太近的不標，避免重疊
      for (let t = -3; t <= 3; t++) if (cuts.every(c => Math.abs(c - t) > (W < 500 ? 0.65 : 0.45)))
        g += `<text x="${sx(t)}" y="${sy(0) + 18}" font-size="13" text-anchor="middle" fill="var(--mute)">${t < 0 ? '−' + -t : t}</text>`;
      cuts.forEach(c => {
        const x = sx(c), label = (c < 0 ? '−' : '') + z.toFixed(3);
        g += `<line x1="${x}" y1="${sy(0)}" x2="${x}" y2="${sy(pdf(0)) - 18}" stroke="var(--amber)" stroke-width="1.6" stroke-dasharray="4 3"/>
          <text x="${x}" y="${sy(0) + 18}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--amber)">${label}</text>
          <text x="${Math.min(Math.max(x, padX + (two ? 24 : 62)), W - padX - (two ? 24 : 62))}" y="${sy(pdf(0)) - 24}" font-size="14" font-weight="700" text-anchor="middle" fill="var(--amber)">${zName(c < 0, num(tail), two ? '' : ' = ' + label)}</text>
          <text x="${sx(c + Math.sign(c) * 0.75)}" y="${sy(pdf(c + Math.sign(c) * 0.75)) - 12}" font-size="13" text-anchor="middle" fill="var(--text)">${num(tail)}</text>`;
      });
      const mid = mode === 'right' ? [LO, z] : mode === 'left' ? [-z, HI] : [-z, z];
      g += `<text x="${sx((mid[0] + mid[1]) / 2 + (mode === 'right' ? 1 : mode === 'left' ? -1 : 0))}" y="${sy(pdf(0) * 0.35)}" font-size="14" text-anchor="middle" fill="var(--text)">${num(1 - alpha)}</text>`;
      svg.innerHTML = g;
      const tex = s => katex.renderToString(s, { throwOnError: false }), zs = z.toFixed(3), ts = num(tail);
      const use = { 0.10: '單尾 10%', 0.05: '單尾 5%', 0.025: '單尾 2.5%', 0.01: '單尾 1%', 0.005: '單尾 0.5%' };
      text.innerHTML = mode === 'right'
        ? `${tex(`z_{${ts}} = ${zs}`)}：${tex(`P(Z > ${zs}) = ${ts}`)}，查表找 ${tex(`\\Phi(z) = ${num(1 - tail)}`)}。用在${use[a1]}的右尾檢定。`
        : mode === 'left'
        ? `${tex(`-z_{${ts}} = -${zs}`)}：${tex(`P(Z < -${zs}) = ${ts}`)}，由對稱性等於右尾的 ${tex(`P(Z > ${zs})`)}。用在${use[a1]}的左尾檢定。`
        : `${tex(`\\pm z_{${ts}} = \\pm ${zs}`)}：兩邊各 ${tex(`\\alpha/2 = ${ts}`)}，${tex(`P(-${zs} < Z < ${zs}) = ${num(1 - alpha)}`)}。用在 ${num((1 - alpha) * 100)}% 信賴區間與雙尾 ${num(alpha * 100)}% 檢定。`;
    }
    let narrow = (el.clientWidth || 600) < 520;
    new ResizeObserver(() => { const n = el.clientWidth < 520; if (n !== narrow) { narrow = n; draw(); } }).observe(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m) mode = b.dataset.m; else if (b.dataset.k) k = +b.dataset.k; else return;
      draw();
    });
    draw();
  }

  return { 'inclusion-exclusion': inclusionExclusion, 'probability-tree': probabilityTree, birthday, partition, targets, 'dist-map': distMap, 'z-tail': zTail };
})();
