/* ==========================================================================
   LTChart：共用的 SVG 圖表(折線、長條)，自動跟隨暗色/淺色主題與容器寬度。
     LTChart.line(el, { x, series:[{ name, y, color, dash, width, fill }], ... })
     LTChart.bars(el, { x, series:[{ name, y, color, colors }], ... })(colors：每根長條各自的顏色，可省略)
   共通選項：height、xFmt(x)、yFmt(y)、xType:'date'|'num'、refY:[{ y, label, color }]、
            refX:[{ x, label, color }]、points:[{ x, y, label, color }]、yMin、yMax、tipFmt、
            yTicks(lo, hi)(自訂 y 軸刻度，例如對數座標)、title(主圖左上角的小標)、xAll(每個 x 都標刻度，適合 12 個月份這種少量類別；長條圖放不下時刻度文字自動斜放 45°)
   右側 y 軸：series 加 axis:'right'(長條圖中畫成折線＋圓點)，搭配 y2Min、y2Max、y2Fmt；refY 也可加 axis:'right'
   下方子圖(折線圖)：lower:{ height, series:[{ name, y, color, width }], yMin, yMax, yFmt, tipFmt, label, fill }
            畫在同一張圖的下方，共用 x 軸與十字線，例如權益曲線下方接回撤(fill:true 時從 0 往下塗色)
   縱軸可切換對數/一般刻度：LTChart.line(el, log => ({ ...選項 }))(傳函式)，主圖左上角的小標旁會出現「對數｜一般」切換鈕；
            設定全站共用(記在瀏覽器)，切換時同一頁所有可切換的圖一起重畫。
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
    const L0 = o.lower, gap = L0 ? 22 : 0, lh = L0 ? (L0.height || 120) : 0;
    const W = Math.max(280, el.clientWidth || 600);
    const R2 = o.series.filter(s => s.axis === 'right'), r = R2.length ? 46 : PAD.r;
    const xs = o.x.map(v => toNum(v, o.xType));
    const xFmt = o.xFmt || (o.xType === 'date' ? v => String(v).slice(0, 7) : defaultFmt);
    // 長條圖每個類別都標刻度(xAll)時，類別太窄(手機)放不下就把刻度文字斜放 45°，底部多留空間
    const textW = s => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 10.5 : 6.2), 0);
    const labelW = kind === 'bars' && o.xAll ? Math.max(...o.x.map(v => textW(String(xFmt(v))))) : 0;
    const tilt = labelW > 0 && labelW > (W - PAD.l - r) / xs.length - 6, extra = tilt ? Math.ceil(labelW * 0.71) : 0;
    const H = (o.height || 260) + lh + gap + extra, pb = PAD.b + extra;
    const ys = o.series.filter(s => s.axis !== 'right').flatMap(s => s.y).concat((o.refY || []).filter(q => q.axis !== 'right').map(q => q.y)).filter(Number.isFinite);
    if (kind === 'bars') ys.push(0);
    let yLo = o.yMin ?? Math.min(...ys), yHi = o.yMax ?? Math.max(...ys);
    const padY = (yHi - yLo || Math.abs(yHi) || 1) * 0.06;
    if (o.yMin == null) yLo -= padY;
    if (o.yMax == null) yHi += padY;
    if (kind === 'bars' && o.yMin == null) yLo = Math.min(0, yLo);
    // yTicks(lo, hi)：自訂刻度(例如對數座標)，只保留範圍內的刻度
    const yt = o.yTicks ? o.yTicks(yLo, yHi).filter(v => v >= yLo && v <= yHi) : ticks(yLo, yHi);
    if (!o.yTicks) { yLo = Math.min(yLo, yt[0]); yHi = Math.max(yHi, yt[yt.length - 1]); }
    const iw = W - PAD.l - r, ih = H - PAD.t - pb - lh - gap;
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const band = kind === 'bars' ? iw / xs.length : 0;
    const X = kind === 'bars'
      ? i => PAD.l + band * (i + 0.5)
      : v => PAD.l + (xHi === xLo ? iw / 2 : (v - xLo) / (xHi - xLo) * iw);
    const Y = v => PAD.t + (yHi - v) / (yHi - yLo) * ih;
    const yFmt = o.yFmt || defaultFmt;
    let g = yt.map(v => `<line x1="${PAD.l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/>
      <text x="${PAD.l - 6}" y="${Y(v) + 3.5}" font-size="10.5" text-anchor="end" fill="var(--mute)">${esc(yFmt(v))}</text>`).join('');
    // x 軸刻度：依寬度挑選約 6 個
    const nx = Math.max(2, Math.min(8, Math.floor(iw / 90)));
    const idx = o.xAll ? xs.map((_, i) => i) : [...new Set(Array.from({ length: nx }, (_, k) => Math.round(k * (xs.length - 1) / (nx - 1))))];
    g += idx.map(i => {
      const x = kind === 'bars' ? X(i) : X(xs[i]);
      if (!tilt) {   // 最左、最右的刻度文字超出圖框時往內對齊，不被截掉
        const t = String(xFmt(o.x[i])), half = textW(t) / 2;
        const anchor = x + half > W - 2 ? 'end' : x - half < 2 ? 'start' : 'middle';
        const ax = anchor === 'end' ? W - 2 : anchor === 'start' ? 2 : x;
        return `<text x="${ax}" y="${H - 8}" font-size="10.5" text-anchor="${anchor}" fill="var(--mute)">${esc(t)}</text>`;
      }
      const y = H - pb + 12;   // 從刻度下方往左下斜放
      return `<text x="${x + 4}" y="${y}" font-size="10.5" text-anchor="end" transform="rotate(-45 ${x + 4} ${y})" fill="var(--mute)">${esc(xFmt(o.x[i]))}</text>`;
    }).join('');
    // 右側 y 軸(只標刻度文字，不另畫格線)
    let Y2 = Y;
    if (R2.length) {
      const v2 = R2.flatMap(s => s.y).filter(Number.isFinite);
      let lo2 = o.y2Min ?? Math.min(...v2), hi2 = o.y2Max ?? Math.max(...v2);
      const t2 = ticks(lo2, hi2, 4); lo2 = Math.min(lo2, t2[0]); hi2 = Math.max(hi2, t2[t2.length - 1]);
      Y2 = v => PAD.t + (hi2 - v) / (hi2 - lo2 || 1) * ih;
      const y2Fmt = o.y2Fmt || defaultFmt;
      g += t2.map(v => `<text x="${W - r + 6}" y="${Y2(v) + 3.5}" font-size="10.5" text-anchor="start" fill="var(--mute)">${esc(y2Fmt(v))}</text>`).join('');
    }
    // 下方子圖：自己的 y 軸與格線，畫在主圖下方
    let L = null;
    if (L0) {
      const v = L0.series.flatMap(s => s.y).filter(Number.isFinite);
      let lo = L0.yMin ?? Math.min(...v), hi = L0.yMax ?? Math.max(...v);
      const tl = ticks(lo, hi, 3); lo = Math.min(lo, tl[0]); hi = Math.max(hi, tl[tl.length - 1]);
      const top = PAD.t + ih + gap, fmt = L0.yFmt || defaultFmt;
      L = { top, Y: v => top + (hi - v) / (hi - lo || 1) * lh, fmt };
      g += `<line x1="${PAD.l}" x2="${W - r}" y1="${top - gap / 2}" y2="${top - gap / 2}" stroke="var(--border)"/>`;
      g += tl.map(t => `<line x1="${PAD.l}" x2="${W - r}" y1="${L.Y(t)}" y2="${L.Y(t)}" stroke="var(--grid)"/>
        <text x="${PAD.l - 6}" y="${L.Y(t) + 3.5}" font-size="10.5" text-anchor="end" fill="var(--mute)">${esc(fmt(t))}</text>`).join('');
      if (L0.label) g += `<text x="${PAD.l + 6}" y="${top + 14}" font-size="12.5" font-weight="600" fill="var(--mute)">${esc(L0.label)}</text>`;
    }
    // 主圖左上角的小標(例如有下方子圖時，上半寫「報酬」、下半寫「回撤」)
    if (o.title) g += `<text x="${PAD.l + 6}" y="${PAD.t + 14}" font-size="12.5" font-weight="600" fill="var(--mute)">${esc(o.title)}</text>`;
    return { W, H, pb, r, xs, X, Y, Y2, L, yLo, yHi, iw, ih, band, g, yFmt, xFmt };
  }

  function refs(o, f, kind) {
    const xPos = v => kind === 'bars' ? f.X(nearest(f.xs, toNum(v, o.xType))) : f.X(toNum(v, o.xType));
    const yOf = r => r.axis === 'right' ? f.Y2(r.y) : f.Y(r.y);
    let g = (o.refY || []).map(r => `<line x1="${PAD.l}" x2="${f.W - f.r}" y1="${yOf(r)}" y2="${yOf(r)}" stroke="${r.color || 'var(--border-strong)'}" stroke-dasharray="4 4"/>
      ${r.label ? `<text x="${f.W - f.r - 4}" y="${yOf(r) - 4}" font-size="10.5" text-anchor="end" fill="${r.color || 'var(--mute)'}">${esc(r.label)}</text>` : ''}`).join('');
    g += (o.refX || []).map(r => `<line x1="${xPos(r.x)}" x2="${xPos(r.x)}" y1="${PAD.t}" y2="${f.H - f.pb}" stroke="${r.color || 'var(--border-strong)'}" stroke-dasharray="4 4"/>
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
      if (px < PAD.l || px > f.W - f.r) { leave(); return; }
      const i = kind === 'bars'
        ? Math.min(f.xs.length - 1, Math.max(0, Math.floor((px - PAD.l) / f.band)))
        : nearest(f.xs, f.xs[0] + (px - PAD.l) / f.iw * (f.xs[f.xs.length - 1] - f.xs[0]));
      const cx = kind === 'bars' ? f.X(i) : f.X(f.xs[i]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
      tip.innerHTML = `<b>${esc(f.xFmt(o.x[i], true))}</b>` + o.series.filter(s => !s.noTip).map(s => Number.isFinite(s.y[i])
        ? `<div><i style="background:${s.color}"></i>${esc(s.name)}　${esc(tipFmt(s, s.y[i], i))}</div>` : '').join('')
        + (o.lower ? o.lower.series.filter(s => Number.isFinite(s.y[i])).map(s => `<div><i style="background:${s.color}"></i>${esc(s.name)}　${esc((o.lower.tipFmt || ((_, v) => f.L.fmt(v)))(s, s.y[i], i))}</div>`).join('') : '');
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

  // 縱軸刻度設定(true = 對數)：全站共用，記在 localStorage
  let logPref = true;
  try { logPref = localStorage.getItem('lt-scale') !== 'lin'; } catch (e) {}
  const scaleBtns = (o, f) => {
    const left = PAD.l + 6 + (o.title ? [...o.title].length * 13 + 6 : 0);
    return `<div class="lt-scale" role="group" aria-label="縱軸刻度" style="left:${left}px;top:${PAD.t + 1}px">${[[true, '對數'], [false, '一般']].map(([v, t]) =>
      `<button type="button" data-log="${v ? 1 : 0}" aria-pressed="${logPref === v}">${t}</button>`).join('')}</div>`;
  };
  function setScale(log) {
    logPref = log;
    try { localStorage.setItem('lt-scale', log ? 'log' : 'lin'); } catch (e) {}
    document.querySelectorAll('.lt-scaled').forEach(e => { if (e._ltScale) line(e, e._ltScale); });
  }

  function render(el, o, kind, body, scaled) {
    watch(el, () => {
      const f = frame(el, o, kind);
      el.classList.add('lt-chart');
      el.innerHTML = `<svg width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || '圖表')}">
        ${f.g}${body(f)}${refs(o, f, kind)}
        <line class="lt-cross" y1="${PAD.t}" y2="${f.H - f.pb}" stroke="var(--dim)" stroke-width="1" style="display:none"/>
      </svg><div class="lt-tip"></div>${scaled ? scaleBtns(o, f) : ''}`;
      if (scaled) el.querySelectorAll('.lt-scale button').forEach(b => { b.onclick = () => setScale(b.dataset.log === '1'); });
      hover(el, o, f, kind);
    });
  }

  function line(el, o) {
    const scaled = typeof o === 'function';
    if (scaled) { el._ltScale = o; el.classList.add('lt-scaled'); o = o(logPref); }
    else { delete el._ltScale; el.classList.remove('lt-scaled'); }
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
    }).join('') + (f.L ? o.lower.series.map(s => {
      const pts = s.y.map((v, i) => Number.isFinite(v) ? [f.X(f.xs[i]), f.L.Y(v)] : null).filter(Boolean);
      if (!pts.length) return '';
      const line = pts.map(p => p.join(',')).join(' '), y0 = f.L.Y(0);
      return (o.lower.fill ? `<polygon points="${pts[0][0]},${y0} ${line} ${pts[pts.length - 1][0]},${y0}" fill="${s.color}" fill-opacity=".12"/>` : '')
        + `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.4}" stroke-linejoin="round"/>`;
    }).join('') : ''), scaled);
  }

  function bars(el, o) {
    render(el, o, 'bars', f => {
      const B = o.series.filter(s => s.axis !== 'right'), n = B.length, bw = Math.max(1, f.band * 0.8 / n);
      const g = B.map((s, j) => s.y.map((v, i) => {
        if (!Number.isFinite(v)) return '';
        const x = f.X(i) - f.band * 0.4 + j * bw, y = f.Y(Math.max(v, 0)), h = Math.abs(f.Y(v) - f.Y(0));
        return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 0.5)}" fill="${(s.colors && s.colors[i]) || s.color}" opacity=".85"/>`;
      }).join('')).join('');
      // 右側 y 軸的數列畫成折線＋圓點
      return g + o.series.filter(s => s.axis === 'right').map(s => {
        const pts = s.y.map((v, i) => Number.isFinite(v) ? [f.X(i), f.Y2(v)] : null).filter(Boolean);
        return `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`
          + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${s.color}" stroke="var(--panel)" stroke-width="1.5"/>`).join('');
      }).join('');
    });
  }

  // 圖例
  const legend = series => `<div class="legend">${series.map(s => `<span><i style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;

  return { line, bars, legend, ticks };
})();
