/* 股票 · 台股 · 股票查詢：上市櫃股票與 ETF 的價量、法人、融資券、借券與重要事件(2016 年起，含已下市櫃)
   資料在 Cloudflare D1(本機 pipeline/price_query/sync.py 每天同步)，經 api/prices 查詢；登入 Google 才能用(functions/_lib/access.json)
   api/prices 回傳欄式資料 rows = {d 日期, o h l c 開高低收(原始價格), a 還原收盤價, v 成交量, f 外資買賣超, t 投信買賣超,
   m 融資餘額, s 融券餘額, b 借券賣出餘額}(單位都是張)與 events = [[日期, 種類, 說明, 結束日期]]
   K 線圖：左上角切換原始價、還原價(開高低乘上當天的還原比例 a ÷ c)；點一下出現十字線，滾輪縮放、拖曳平移、← → 移動 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const int = v => Number.isFinite(v) ? Math.round(v).toLocaleString('zh-TW') : '—';
  const sint = v => Number.isFinite(v) ? (v > 0 ? '+' : '') + int(v) : '—';
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const ymd = d => d.toISOString().slice(0, 10);
  const short = v => { const a = Math.abs(v); return a >= 1e8 ? (v / 1e8).toFixed(1) + '億' : a >= 1e4 ? (v / 1e4).toFixed(a >= 1e5 ? 0 : 1) + '萬' : Math.round(v) + ''; };
  const RANGES = [['3m', '3 個月', 3], ['6m', '6 個月', 6], ['1y', '1 年', 12], ['3y', '3 年', 36], ['5y', '5 年', 60], ['all', '全部', 0]];
  const ERRORS = { bad_symbol: '股票代號格式不對', not_found: '查無這檔股票', bad_range: '日期區間不對', not_configured: '股票查詢尚未開放',
                   quota_exceeded: '今天的查詢次數已用完，明天再來', rate_limited: '查詢太頻繁，請稍等一下再查' };
  const MAS = [5, 20, 60];
  const MA_WARMUP = 120;     // 多抓 120 個日曆天，讓 60MA 從查詢期間第一天就有值；圖一開始只顯示查詢期間，往左拖可以看到
  // 下方的小圖：成交量、法人、融資券、借券(都是張)
  const PANELS = [
    { key: 'v', name: '成交量', kind: 'vol' },
    { key: 'f', name: '外資買賣超', kind: 'net' },
    { key: 't', name: '投信買賣超', kind: 'net' },
    { key: 'm', name: '融資餘額', kind: 'line', color: '--amber' },
    { key: 's', name: '融券餘額', kind: 'line', color: '--blue' },
    { key: 'b', name: '借券賣出餘額', kind: 'line', color: '--dim' },
  ];
  const EV_TAG = { div: '息', split: '分割', halt: '停' };
  let symbolsP = null;   // 股票清單只載入一次

  function loadSymbols() {
    if (!symbolsP) symbolsP = fetch('api/symbols').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .catch(e => { symbolsP = null; throw e; });
    return symbolsP;
  }
  const monthsAgo = m => { const d = new Date(); d.setMonth(d.getMonth() - m); return ymd(d); };
  const fromOf = key => { const m = RANGES.find(r => r[0] === key)[2]; return m ? monthsAgo(m) : '2016-01-01'; };
  const minusDays = (s, k) => { const d = new Date(s); d.setDate(d.getDate() - k); return ymd(d); };
  function sma(arr, p) {
    const out = new Array(arr.length).fill(NaN); let sum = 0;
    arr.forEach((v, i) => { sum += v; if (i >= p) sum -= arr[i - p]; if (i >= p - 1) out[i] = sum / p; });
    return out;
  }

  /* ---------- K 線圖(canvas)：價格＋均線＋事件，下面接各個小圖，十字線貫穿 ---------- */
  function kChart(wrap, J, opts) {
    const R = J.rows, n = R.d.length;
    const canvas = document.createElement('canvas');
    canvas.className = 'pq-canvas'; canvas.tabIndex = 0;
    wrap.innerHTML = ''; wrap.appendChild(canvas);
    const st = { view: { s: Math.max(0, R.d.findIndex(d => d >= J.view_from)), e: n - 1 }, cur: null };
    if (st.view.e - st.view.s < 10) st.view.s = Math.max(0, n - 120);
    let price, ma;
    function prepare() {
      const adj = opts.mode === 'adj';
      price = R.d.map((_, i) => { const k = adj && R.c[i] ? R.a[i] / R.c[i] : 1; return { o: R.o[i] * k, h: R.h[i] * k, l: R.l[i] * k, c: adj ? R.a[i] : R.c[i] }; });
      const closes = price.map(p => p.c);
      ma = Object.fromEntries(MAS.map(p => [p, sma(closes, p)]));
    }
    prepare();
    // 處置期間(起訖日)換成索引；事件依日期放到對應的 K 棒
    const lastIdx = d => { let k = -1; R.d.forEach((x, i) => { if (x <= d) k = i; }); return k; };
    const disp = J.events.filter(e => e[1] === 'disp').map(e => ({ s: R.d.findIndex(d => d >= e[0]), e: lastIdx(e[3] || e[0]), text: e[2] }))
      .filter(x => x.s >= 0 && x.e >= x.s);
    const evAt = {};
    J.events.forEach(e => { const i = R.d.indexOf(e[0]); if (i >= 0 && e[1] !== 'disp') (evAt[i] ||= []).push(e); });

    let geo = null;
    function draw() {
      const C = k => LT.cssVar(k);
      const dpr = window.devicePixelRatio || 1, W = Math.max(300, wrap.clientWidth);
      const panels = PANELS.filter(p => opts.panels.has(p.key) && R[p.key]);
      const PH = 300, SH = 66, GAP = 8, AX = 18;
      const H = PH + panels.length * (SH + GAP) + AX;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
      const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
      const { s, e } = st.view, cnt = e - s + 1, padL = 58, padR = 10, plotW = W - padL - padR, cw = plotW / cnt;
      const xAt = i => padL + (i - s + 0.5) * cw, bw = Math.max(cw * 0.62, 1);
      g.font = '10px IBM Plex Mono'; g.lineWidth = 1;

      // 價格區
      let lo = Infinity, hi = -Infinity;
      for (let i = s; i <= e; i++) {
        lo = Math.min(lo, price[i].l); hi = Math.max(hi, price[i].h);
        MAS.forEach(p => { const v = ma[p][i]; if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      }
      const pad = (hi - lo) * 0.1 || hi * 0.02; lo -= pad; hi += pad * 1.3;   // 上方多留空間畫月營收的符號
      const y = v => 8 + (PH - 16) * (1 - (v - lo) / (hi - lo));
      g.strokeStyle = C('--grid'); g.fillStyle = C('--mute');
      for (let k = 0; k <= 4; k++) {
        const v = lo + (hi - lo) * k / 4, yy = y(v);
        g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke();
        g.fillText(num(v, v >= 1000 ? 0 : v >= 100 ? 1 : 2), 4, yy + 3);
      }
      // 處置期間：淡色底＋標籤
      disp.forEach(d => {
        if (d.e < s || d.s > e) return;
        const x1 = xAt(Math.max(d.s, s)) - cw / 2, x2 = xAt(Math.min(d.e, e)) + cw / 2;
        g.fillStyle = C('--amber'); g.globalAlpha = 0.13; g.fillRect(x1, 8, x2 - x1, PH - 16); g.globalAlpha = 1;
        g.fillText('處置', x1 + 2, PH - 12);
      });
      // K 棒
      const up = C('--candle-up'), dn = C('--candle-down');
      for (let i = s; i <= e; i++) {
        const p = price[i], x = xAt(i), c = p.c >= p.o ? up : dn;
        g.strokeStyle = c; g.fillStyle = c;
        g.beginPath(); g.moveTo(x, y(p.h)); g.lineTo(x, y(p.l)); g.stroke();
        g.fillRect(x - bw / 2, Math.min(y(p.o), y(p.c)), bw, Math.max(Math.abs(y(p.c) - y(p.o)), 1));
      }
      // 均線
      MAS.forEach(p => {
        g.beginPath(); let on = false;
        for (let i = s; i <= e; i++) { const v = ma[p][i]; if (v !== v) { on = false; continue; } if (on) g.lineTo(xAt(i), y(v)); else g.moveTo(xAt(i), y(v)); on = true; }
        g.strokeStyle = C('--ma' + p); g.lineWidth = 1.2; g.stroke(); g.lineWidth = 1;
      });
      // 事件：月營收在 K 棒上方畫小菱形(紅 = 年成長、綠 = 年衰退，數字點 K 棒看)；除權息、分割、暫停交易在下方標小字
      g.textAlign = 'center';
      for (let i = s; i <= e; i++) {
        (evAt[i] || []).forEach(ev => {
          const x = xAt(i);
          if (ev[1] === 'rev') {
            const m = ev[2].match(/([+-][\d.]+)%/), v = m ? parseFloat(m[1]) : NaN, yy = y(price[i].h) - 8, r = 3.5;
            g.fillStyle = !m ? C('--mute') : v >= 0 ? up : dn;
            g.beginPath(); g.moveTo(x, yy - r); g.lineTo(x + r, yy); g.lineTo(x, yy + r); g.lineTo(x - r, yy); g.closePath(); g.fill();
          } else if (EV_TAG[ev[1]]) {
            g.fillStyle = ev[1] === 'halt' ? C('--mute') : C('--blue');
            g.fillText(EV_TAG[ev[1]], x, Math.min(y(price[i].l) + 13, PH - 2));
          }
        });
      }
      g.textAlign = 'left';

      // 小圖
      let top = PH + GAP;
      panels.forEach(pn => {
        const vals = R[pn.key].slice(s, e + 1).filter(Number.isFinite);
        let a = pn.kind === 'line' ? Math.min(...vals) : Math.min(0, ...vals), b = pn.kind === 'line' ? Math.max(...vals) : Math.max(0, ...vals);
        if (!vals.length) { a = 0; b = 1; }
        if (!(b > a)) b = a + 1;
        const t0 = top, ys = v => t0 + 12 + (SH - 14) * (1 - (v - a) / (b - a));
        g.strokeStyle = C('--grid'); g.strokeRect(padL, t0, plotW, SH);
        if (pn.kind !== 'line') { g.beginPath(); g.moveTo(padL, ys(0)); g.lineTo(W - padR, ys(0)); g.stroke(); }
        for (let i = s; i <= e; i++) {
          const v = R[pn.key][i]; if (!Number.isFinite(v) || pn.kind === 'line') continue;
          g.fillStyle = pn.kind === 'vol' ? (price[i].c >= price[i].o ? up : dn) : (v >= 0 ? C('--up') : C('--down'));
          g.globalAlpha = pn.kind === 'vol' ? 0.55 : 0.75;
          g.fillRect(xAt(i) - bw / 2, Math.min(ys(v), ys(0)), bw, Math.max(Math.abs(ys(v) - ys(0)), 0.5));
          g.globalAlpha = 1;
        }
        if (pn.kind === 'line') {
          g.beginPath(); let on = false;
          for (let i = s; i <= e; i++) { const v = R[pn.key][i]; if (!Number.isFinite(v)) { on = false; continue; } if (on) g.lineTo(xAt(i), ys(v)); else g.moveTo(xAt(i), ys(v)); on = true; }
          g.strokeStyle = C(pn.color); g.lineWidth = 1.4; g.stroke(); g.lineWidth = 1;
        }
        g.fillStyle = C('--dim'); g.fillText(pn.name + '(張)', padL + 4, t0 + 10);
        g.fillStyle = C('--mute'); g.fillText(short(b), 4, t0 + 10); g.fillText(short(a), 4, t0 + SH - 2);
        top += SH + GAP;
      });
      // 日期
      g.fillStyle = C('--mute');
      const every = Math.max(1, Math.ceil(cnt / Math.max(2, Math.floor(plotW / 90))));
      for (let i = s; i <= e; i += every) g.fillText(R.d[i], Math.min(Math.max(xAt(i) - 28, padL), W - 70), H - 5);

      // 十字線：垂直線貫穿所有圖、水平線在收盤價，左側價格軸標收盤價(不框 K 棒)
      if (st.cur != null && st.cur >= s && st.cur <= e) {
        const x = xAt(st.cur), yc = y(price[st.cur].c);
        g.save(); g.strokeStyle = C('--text'); g.globalAlpha = 0.55; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(x, 8); g.lineTo(x, H - AX); g.moveTo(padL, yc); g.lineTo(W - padR, yc); g.stroke();
        g.restore();
        const label = num(price[st.cur].c, price[st.cur].c >= 1000 ? 0 : 2);
        g.font = '600 11px IBM Plex Mono';
        const tw = g.measureText(label).width + 8;
        g.fillStyle = C('--amber'); g.fillRect(padL - tw - 2, yc - 8, tw, 16);
        g.fillStyle = C('--on-amber'); g.fillText(label, padL - tw + 2, yc + 4);
      }
      geo = { s, e, padL, plotW, cw };
    }

    function setCursor(i, keepVisible) {
      i = Math.max(0, Math.min(n - 1, i)); st.cur = i;
      if (keepVisible) {
        const r = st.view.e - st.view.s;
        if (i < st.view.s) st.view = { s: i, e: i + r }; else if (i > st.view.e) st.view = { s: i - r, e: i };
      }
      draw(); opts.onCursor(i, price, ma, evAt[i] || [], disp.filter(d => i >= d.s && i <= d.e));
    }
    // 互動：滾輪縮放、拖曳平移、點一下出現十字線、← → 移動、Esc 取消
    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = st.view.e - st.view.s, nr = Math.max(20, Math.min(n - 1, Math.round(r * (ev.deltaY > 0 ? 1.15 : 0.87))));
      const rel = Math.max(0, Math.min(1, (ev.clientX - canvas.getBoundingClientRect().left - geo.padL) / geo.plotW));
      let s = Math.round(st.view.s + rel * r - rel * nr); s = Math.max(0, Math.min(n - 1 - nr, s));
      st.view = { s, e: s + nr }; draw();
    }, { passive: false });
    let drag = null;
    canvas.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, v: { ...st.view }, moved: false }; canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener('pointermove', ev => {
      if (!drag) return;
      const dx = ev.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; if (!drag.moved) return;
      const r = drag.v.e - drag.v.s, s = Math.max(0, Math.min(n - 1 - r, drag.v.s - Math.round(dx / geo.cw)));
      st.view = { s, e: s + r }; draw();
    });
    canvas.addEventListener('pointerup', ev => {
      if (drag && !drag.moved) {
        const i = geo.s + Math.floor((ev.clientX - canvas.getBoundingClientRect().left - geo.padL) / geo.cw);
        if (i >= geo.s && i <= geo.e) { setCursor(i); canvas.focus({ preventScroll: true }); }
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('keydown', ev => {
      if (st.cur == null) return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); setCursor(st.cur - 1, true); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); setCursor(st.cur + 1, true); }
      else if (ev.key === 'Escape') { st.cur = null; draw(); opts.onCursor(null); }
    });
    let lastW = wrap.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - lastW) > 2) { lastW = wrap.clientWidth; draw(); } });
    ro.observe(wrap);
    const onResize = () => draw();
    window.addEventListener('resize', onResize);   // 切換主題時 app.js 會送 resize，依新配色重畫
    draw();
    return {
      redraw() { prepare(); draw(); if (st.cur != null) setCursor(st.cur); },
      destroy() { ro.disconnect(); window.removeEventListener('resize', onResize); },
    };
  }

  LT.register({
    section: 'stock', group: '台股', key: 'query', name: '股票查詢', hidden: true,   // 不列在側欄：從 LOGO 下方的搜尋框或代號連結進來
    async mount(el, ctx) {
      let last = '2330', range = '1y';
      try { last = localStorage.getItem('lt.query.symbol') || last; range = localStorage.getItem('lt.query.range') || range; } catch (e) {}
      // 從其他頁面的代號連結過來(#/stock/query/<代號>)：直接查這一檔，並顯示「返回」按鈕
      const fromLink = decodeURIComponent(location.hash.split('/')[3] || '').toUpperCase();
      if (/^[0-9A-Z]{4,6}$/.test(fromLink)) last = fromLink;
      let back = null;
      try { back = JSON.parse(sessionStorage.getItem('lt.query.back') || 'null'); } catch (e) {}
      if (!fromLink || !back || back.hash.startsWith('#/stock/query')) back = null;
      if (!RANGES.some(r => r[0] === range)) range = '1y';
      const opts = { mode: 'raw', panels: new Set(PANELS.map(p => p.key)), onCursor: () => {} };
      try { opts.mode = localStorage.getItem('lt.query.mode') === 'adj' ? 'adj' : 'raw'; } catch (e) {}
      el.innerHTML = `
        ${back ? `<button type="button" class="pq-back acct-link">← 返回${esc(back.name)}</button>` : ''}
        <header class="top"><div>
          <h1>股票查詢</h1>
          <p>上市櫃股票與 ETF 的價量、外資與投信買賣超、融資券、借券，以及月營收、除權息、暫停交易、處置，2016 年起(含已下市櫃)</p>
        </div></header>
        <div class="panel">
          <form class="pq-form" autocomplete="off">
            <label class="pq-sym"><span>股票代號或名稱</span><input id="pqSym" list="pqList" value="${esc(last)}" placeholder="例如 2330 或 台積電" required><datalist id="pqList"></datalist></label>
            <div class="pq-range btnrow-l">${RANGES.map(([k, t]) => `<button type="button" data-r="${k}" class="${k === range ? 'active' : ''}">${t}</button>`).join('')}</div>
            <label><span>起</span><input id="pqFrom" type="date" min="2016-01-01"></label>
            <label><span>迄</span><input id="pqTo" type="date" min="2016-01-01"></label>
            <button type="submit" class="login-btn">查詢</button>
          </form>
          <p id="pqNote" class="note" style="margin:10px 0 0;"></p>
        </div>
        <div id="pqOut"></div>`;
      const $ = s => el.querySelector(s);
      if (back) $('.pq-back').onclick = () => LT.goBack(back);
      let chart = null;
      const setRange = k => {
        range = k;
        el.querySelectorAll('.pq-range button').forEach(b => b.classList.toggle('active', b.dataset.r === k));
        $('#pqFrom').value = fromOf(k) < '2016-01-01' ? '2016-01-01' : fromOf(k);
        $('#pqTo').value = ymd(new Date());
      };
      setRange(range);

      let list = [];
      loadSymbols().then(s => {
        if (!ctx.alive()) return;
        list = s.symbols;
        $('#pqList').innerHTML = list.map(x => `<option value="${esc(x.symbol)}">${esc(x.name)}${x.delisted ? '(已下市櫃)' : ''}</option>`).join('');
        $('#pqNote').textContent = `共 ${list.length.toLocaleString()} 檔。`;
      }).catch(() => { if (ctx.alive()) $('#pqNote').textContent = '股票清單載入失敗，仍可直接輸入代號查詢。'; });

      // 輸入名稱時換成代號
      const toSymbol = v => {
        v = v.trim();
        const m = v.match(/^([0-9A-Za-z]{4,6})\b/);
        if (m) return m[1].toUpperCase();
        const hit = list.find(x => x.name === v) || list.find(x => x.name && x.name.includes(v));
        return hit ? hit.symbol : v;
      };

      async function query() {
        const symbol = toSymbol($('#pqSym').value);
        $('#pqSym').value = symbol;
        try { localStorage.setItem('lt.query.symbol', symbol); localStorage.setItem('lt.query.range', range); } catch (e) {}
        if (fromLink) history.replaceState(null, '', `#/stock/query/${encodeURIComponent(symbol)}`);   // 重新整理時查同一檔
        if (chart) { chart.destroy(); chart = null; }
        $('#pqOut').innerHTML = '<div class="panel"><p class="mute"><span class="spinner"></span>查詢中…</p></div>';
        const from = $('#pqFrom').value, to = $('#pqTo').value;
        let r, j;
        try {
          r = await fetch(`api/prices?${new URLSearchParams({ symbol, from: minusDays(from, MA_WARMUP), to })}`);
          j = await r.json();
        } catch (e) { j = { error: `連線失敗(${e.message})` }; }
        if (!ctx.alive()) return;
        if (!r || !r.ok) { $('#pqOut').innerHTML = `<div class="panel"><p class="mute">${esc(ERRORS[j.error] || j.error || `HTTP ${r.status}`)}</p></div>`; return; }
        j.view_from = from;
        render(j);
      }

      function render(j) {
        const R = j.rows, n = R.d.length;
        const tags = [j.market && `<span class="pq-tag">${esc(j.market)}</span>`, j.capital && `<span class="pq-cap">股本 ${num(j.capital)} 億</span>`,
                      j.delisted && '<span class="soon-tag">已下市櫃</span>'].filter(Boolean).join('');
        const title = `<span class="pq-code">${esc(j.symbol)}</span> ${esc(j.name)} ${tags}`;
        if (!n) { $('#pqOut').innerHTML = `<div class="panel"><h3>${title}</h3><p class="mute">這段期間沒有成交資料(資料期間 ${esc(j.first_date)} ～ ${esc(j.last_date)})。</p></div>`; return; }
        const i0 = Math.max(0, R.d.findIndex(d => d >= j.view_from)), last = n - 1;
        const a0 = R.a[i0], a1 = R.a[last];
        const years = (Date.parse(R.d[last]) - Date.parse(R.d[i0])) / (365.25 * 86400e3);
        const card = (v, l, c = '') => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${l}</div></div>`;
        const sum = k => R[k] ? R[k].slice(i0).reduce((s, v) => s + (v || 0), 0) : NaN;
        $('#pqOut').innerHTML = `
          <div class="panel">
            <h3 class="pq-title">${title}</h3>
            <p class="mute" style="margin-top:-4px;">${R.d[i0]} ～ ${R.d[last]}，${(n - i0).toLocaleString()} 個交易日${j.truncated ? '(訪客只能查最近 1 個月)' : ''}</p>
            <div class="statgrid" style="margin:12px 0;">
              ${card(num(R.c[last]), `最新收盤(${R.d[last].slice(5).replace('-', '/')})`)}
              ${card(pct(a1 / a0 - 1), '含息報酬(還原股價)', cls(a1 / a0 - 1))}
              ${years >= 1 ? card(pct((a1 / a0) ** (1 / years) - 1), '年化含息報酬', cls(a1 / a0 - 1)) : ''}
              ${card(sint(sum('f')), '外資累計買賣超(張)', cls(sum('f')))}
              ${card(sint(sum('t')), '投信累計買賣超(張)', cls(sum('t')))}
            </div>
            <div class="pq-toolbar">
              <div class="btnrow-l pq-mode">${[['raw', '原始價'], ['adj', '還原價']].map(([k, t]) => `<button type="button" data-m="${k}" class="${opts.mode === k ? 'active' : ''}">${t}</button>`).join('')}</div>
              <div class="pq-legend">${MAS.map(p => `<span><i class="dot" style="background:var(--ma${p})"></i>${p}MA</span>`).join('')}
                <span><b class="up">◆</b><b class="down">◆</b> 月營收公告(年成長 / 衰退)</span><span><b style="color:var(--blue)">息</b> 除權息</span><span><b class="mute">停</b> 暫停交易</span><span><i class="dot" style="background:var(--amber)"></i>處置期間</span></div>
            </div>
            <div class="btnrow-l pq-panels">${PANELS.map(p => `<button type="button" data-p="${p.key}" class="${opts.panels.has(p.key) ? 'active' : ''}">${p.name}</button>`).join('')}</div>
            <div id="pqInfo" class="ohlc-info pq-info"></div>
            <div id="pqChart" class="pq-chart"></div>
            <p class="note">點一下圖出現十字線，之後可用鍵盤 ← → 移動、Esc 取消；滾輪縮放、左右拖曳平移；上方按鈕可隱藏或顯示下方的小圖。
              還原價：把除權息與分割調整回去的價格(開高低乘上當天的還原收盤價 ÷ 收盤價)。月營收的菱形標在公告日，紅色是單月營收比去年同期成長、綠色是衰退，點那天可看年成長(%)；
              「息」標在除權息日，點那天可看還原比例的變化(約等於殖利率)。外資、投信、融資券、借券都是張數。
              今天還可以查詢 ${j.remaining.toLocaleString()} 次(每天 ${j.limit.toLocaleString()} 次)。</p>
          </div>`;

        const info = $('#pqInfo');
        const showInfo = (i, price, ma, evs, disps) => {
          if (i == null) { info.innerHTML = '<span class="mute">點選 K 棒可查看當天的價量、法人、融資券與事件</span>'; return; }
          const p = price[i], prev = i > 0 ? R.a[i] / R.a[i - 1] - 1 : NaN, f = v => num(v, v >= 1000 ? 0 : 2);
          const arrow = (arr, k) => k > 0 && arr[k] === arr[k] && arr[k - 1] === arr[k - 1] ? (arr[k] > arr[k - 1] ? '<b class="up">↑</b>' : arr[k] < arr[k - 1] ? '<b class="down">↓</b>' : '') : '';
          const mas = MAS.map(m => ma[m][i] === ma[m][i] ? `<span><i class="dot" style="background:var(--ma${m})"></i>${m}MA <em>${f(ma[m][i])}</em>${arrow(ma[m], i)}</span>` : '').join('');
          const at = k => R[k] ? R[k][i] : NaN;
          const evText = [...evs.map(e => e[2]), ...disps.map(d => `處置中(${d.text})`)];
          info.innerHTML = `<b>${R.d[i]}</b>
            <span>開 <em>${f(p.o)}</em></span><span>高 <em>${f(p.h)}</em></span><span>低 <em>${f(p.l)}</em></span>
            <span>收 <em class="${cls(prev)}">${f(p.c)}</em></span><span class="${cls(prev)}">${pct(prev)}</span>${mas}
            <span>量 <em>${int(at('v'))}</em></span><span>外資 <em class="${cls(at('f'))}">${sint(at('f'))}</em></span>
            <span>投信 <em class="${cls(at('t'))}">${sint(at('t'))}</em></span><span>融資 <em>${int(at('m'))}</em></span>
            <span>融券 <em>${int(at('s'))}</em></span><span>借券 <em>${int(at('b'))}</em></span>
            ${evText.length ? `<span class="pq-ev">${evText.map(esc).join('、')}</span>` : ''}`;
        };
        opts.onCursor = showInfo;
        showInfo(null);
        chart = kChart($('#pqChart'), j, opts);
        el.querySelector('.pq-mode').onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          opts.mode = b.dataset.m;
          try { localStorage.setItem('lt.query.mode', opts.mode); } catch (er) {}
          el.querySelectorAll('.pq-mode button').forEach(x => x.classList.toggle('active', x === b));
          chart.redraw();
        };
        el.querySelector('.pq-panels').onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          if (opts.panels.has(b.dataset.p)) opts.panels.delete(b.dataset.p); else opts.panels.add(b.dataset.p);
          b.classList.toggle('active', opts.panels.has(b.dataset.p));
          chart.redraw();
        };
      }

      el.querySelector('.pq-range').onclick = e => { const b = e.target.closest('button'); if (b) { setRange(b.dataset.r); query(); } };
      el.querySelector('.pq-form').onsubmit = e => { e.preventDefault(); query(); };
      ['#pqFrom', '#pqTo'].forEach(s => $(s).addEventListener('change', () => el.querySelectorAll('.pq-range button').forEach(b => b.classList.remove('active'))));
      this.unmount = () => { if (chart) chart.destroy(); };
      query();
    },
  });
})();
