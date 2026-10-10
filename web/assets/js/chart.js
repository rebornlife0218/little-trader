/* ==========================================================================
   LTChart：共用的 SVG 圖表(折線、長條)，自動跟隨暗色/淺色主題與容器寬度。
     LTChart.line(el, { x, series:[{ name, y, color, dash, width, fill }], ... })
     LTChart.bars(el, { x, series:[{ name, y, color }], ... })
   共通選項：height、xFmt(x)、yFmt(y)、xType:'date'|'num'、refY:[{ y, label, color }]、
            refX:[{ x, label, color }]、points:[{ x, y, label, color }]、yMin、yMax、tipFmt
   顏色請用 CSS 變數(例如 'var(--amber)')，切換主題時不必重畫。
   ========================================================================== */
const LTChart = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PAD = { l: 58, r: 16, t: 14, b: 28 };

  // 漂亮的刻度：1、2、5 × 10ⁿ
  function ticks(lo, hi, n = 5) {
    if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
    const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const toNum = (v, type) => type === 'date' ? Date.parse(v) : +v;
  const defaultFmt = v => Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString() : +v.toFixed(4) + '';

  // 每個容器只掛一個 ResizeObserver，寬度改變時重畫
  const observers = new WeakMap();
  function watch(el, draw) {
    draw();
    if (observers.has(el)) observers.get(el).disconnect();
    let w = el.clientWidth, timer;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) < 2) return;
      w = el.clientWidth; clearTimeout(timer); timer = setTimeout(draw, 80);
    });
    ro.observe(el); observers.set(el, ro);
  }

  function frame(el, o, kind) {
    const W = Math.max(280, el.clientWidth || 600), H = o.height || 260;
    const xs = o.x.map(v => toNum(v, o.xType));
    const ys = o.series.flatMap(s => s.y).concat((o.refY || []).map(r => r.y)).filter(Number.isFinite);
    if (kind === 'bars') ys.push(0);
    let yLo = o.yMin ?? Math.min(...ys), yHi = o.yMax ?? Math.max(...ys);
    const padY = (yHi - yLo || Math.abs(yHi) || 1) * 0.06;
    if (o.yMin == null) yLo -= padY;
    if (o.yMax == null) yHi += padY;
    if (kind === 'bars' && o.yMin == null) yLo = Math.min(0, yLo);
    const yt = ticks(yLo, yHi);
    yLo = Math.min(yLo, yt[0]); yHi = Math.max(yHi, yt[yt.length - 1]);
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const band = kind === 'bars' ? iw / xs.length : 0;
    const X = kind === 'bars'
      ? i => PAD.l + band * (i + 0.5)
      : v => PAD.l + (xHi === xLo ? iw / 2 : (v - xLo) / (xHi - xLo) * iw);
    const Y = v => PAD.t + (yHi - v) / (yHi - yLo) * ih;
    const yFmt = o.yFmt || defaultFmt;
    const xFmt = o.xFmt || (o.xType === 'date' ? v => String(v).slice(0, 7) : defaultFmt);
    let g = yt.map(v => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/>
      <text x="${PAD.l - 6}" y="${Y(v) + 3.5}" font-size="10.5" text-anchor="end" fill="var(--mute)">${esc(yFmt(v))}</text>`).join('');
    // x 軸刻度：依寬度挑選約 6 個
    const nx = Math.max(2, Math.min(8, Math.floor(iw / 90)));
    const idx = [...new Set(Array.from({ length: nx }, (_, k) => Math.round(k * (xs.length - 1) / (nx - 1))))];
    g += idx.map(i => `<text x="${kind === 'bars' ? X(i) : X(xs[i])}" y="${H - 8}" font-size="10.5" text-anchor="middle" fill="var(--mute)">${esc(xFmt(o.x[i]))}</text>`).join('');
    return { W, H, xs, X, Y, yLo, yHi, iw, ih, band, g, yFmt, xFmt };
  }

  function refs(o, f, kind) {
    const xPos = v => kind === 'bars' ? f.X(nearest(f.xs, toNum(v, o.xType))) : f.X(toNum(v, o.xType));
    let g = (o.refY || []).map(r => `<line x1="${PAD.l}" x2="${f.W - PAD.r}" y1="${f.Y(r.y)}" y2="${f.Y(r.y)}" stroke="${r.color || 'var(--border-strong)'}" stroke-dasharray="4 4"/>
      ${r.label ? `<text x="${f.W - PAD.r - 4}" y="${f.Y(r.y) - 4}" font-size="10.5" text-anchor="end" fill="${r.color || 'var(--mute)'}">${esc(r.label)}</text>` : ''}`).join('');
    g += (o.refX || []).map(r => `<line x1="${xPos(r.x)}" x2="${xPos(r.x)}" y1="${PAD.t}" y2="${f.H - PAD.b}" stroke="${r.color || 'var(--border-strong)'}" stroke-dasharray="4 4"/>
      ${r.label ? `<text x="${xPos(r.x) + 4}" y="${PAD.t + 10}" font-size="10.5" fill="${r.color || 'var(--mute)'}">${esc(r.label)}</text>` : ''}`).join('');
    g += (o.points || []).map(p => `<circle cx="${xPos(p.x)}" cy="${f.Y(p.y)}" r="4" fill="${p.color || 'var(--text)'}" stroke="var(--panel)" stroke-width="1.5"/>
      ${p.label ? `<text x="${xPos(p.x)}" y="${f.Y(p.y) - 8}" font-size="10.5" text-anchor="middle" fill="${p.color || 'var(--text)'}">${esc(p.label)}</text>` : ''}`).join('');
    return g;
  }
  const nearest = (xs, v) => xs.reduce((b, x, i) => Math.abs(x - v) < Math.abs(xs[b] - v) ? i : b, 0);

  // 滑鼠移動時顯示十字線與數值
  function hover(el, o, f, kind) {
    const svg = el.querySelector('svg'), tip = el.querySelector('.lt-tip'), cross = svg.querySelector('.lt-cross');
    const tipFmt = o.tipFmt || ((s, v) => f.yFmt(v));
    const move = ev => {
      const rect = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      if (px < PAD.l || px > f.W - PAD.r) { leave(); return; }
      const i = kind === 'bars'
        ? Math.min(f.xs.length - 1, Math.max(0, Math.floor((px - PAD.l) / f.band)))
        : nearest(f.xs, f.xs[0] + (px - PAD.l) / f.iw * (f.xs[f.xs.length - 1] - f.xs[0]));
      const cx = kind === 'bars' ? f.X(i) : f.X(f.xs[i]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
      tip.innerHTML = `<b>${esc(f.xFmt(o.x[i], true))}</b>` + o.series.filter(s => !s.noTip).map(s => Number.isFinite(s.y[i])
        ? `<div><i style="background:${s.color}"></i>${esc(s.name)}　${esc(tipFmt(s, s.y[i], i))}</div>` : '').join('');
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      tip.style.left = (cx + 12 + tw > f.W ? cx - tw - 12 : cx + 12) + 'px';
      tip.style.top = PAD.t + 'px';
    };
    const leave = () => { tip.style.display = 'none'; cross.style.display = 'none'; };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', leave);
  }

  function render(el, o, kind, body) {
    watch(el, () => {
      const f = frame(el, o, kind);
      el.classList.add('lt-chart');
      el.innerHTML = `<svg width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || '圖表')}">
        ${f.g}${body(f)}${refs(o, f, kind)}
        <line class="lt-cross" y1="${PAD.t}" y2="${f.H - PAD.b}" stroke="var(--dim)" stroke-width="1" style="display:none"/>
      </svg><div class="lt-tip"></div>`;
      hover(el, o, f, kind);
    });
  }

  function line(el, o) {
    render(el, o, 'line', f => o.series.map(s => {
      const segs = []; let cur = [];
      s.y.forEach((v, i) => { if (Number.isFinite(v)) cur.push([f.X(f.xs[i]), f.Y(v)]); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      let g = '';
      if (s.fill === 'sign') {   // 損益圖：0 以上紅色(獲利)、以下綠色(虧損)，台股紅漲綠跌
        const y0 = f.Y(0), pts = segs.flat().map(p => p.join(',')).join(' ');
        const first = segs[0][0][0], last = segs[segs.length - 1].slice(-1)[0][0];
        const id = 'c' + Math.random().toString(36).slice(2, 8);
        g += `<clipPath id="${id}a"><rect x="0" y="0" width="${f.W}" height="${y0}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${y0}" width="${f.W}" height="${f.H}"/></clipPath>
          <polygon points="${first},${y0} ${pts} ${last},${y0}" fill="var(--up)" fill-opacity=".14" clip-path="url(#${id}a)"/>
          <polygon points="${first},${y0} ${pts} ${last},${y0}" fill="var(--down)" fill-opacity=".14" clip-path="url(#${id}b)"/>`;
      }
      return g + segs.map(seg => `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`).join('');
    }).join(''));
  }

  function bars(el, o) {
    render(el, o, 'bars', f => {
      const n = o.series.length, bw = Math.max(1, f.band * 0.8 / n);
      return o.series.map((s, j) => s.y.map((v, i) => {
        if (!Number.isFinite(v)) return '';
        const x = f.X(i) - f.band * 0.4 + j * bw, y = f.Y(Math.max(v, 0)), h = Math.abs(f.Y(v) - f.Y(0));
        return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 0.5)}" fill="${s.color}" opacity=".85"/>`;
      }).join('')).join('');
    });
  }

  // 圖例
  const legend = series => `<div class="legend">${series.map(s => `<span><i style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;

  return { line, bars, legend, ticks };
})();
