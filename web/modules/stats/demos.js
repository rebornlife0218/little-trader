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

  return { 'inclusion-exclusion': inclusionExclusion };
})();
