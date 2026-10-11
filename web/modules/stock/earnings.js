/* 股票 · 美股 · 財報：上週、本週、下週的財報行事曆(盤前/盤後、預估與實際 EPS、驚喜幅度)與參考網站
   資料集：data/earnings/(pipeline/earnings/update.py，排程見 .github/workflows/data-earnings.yml) */
(() => {
  const DATASET = 'earnings';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  const WEEKS = [['prev', '上週'], ['this', '本週'], ['next', '下週']];
  const CAPS = [[1e11, '市值 ≥ 1000 億美元'], [1e10, '市值 ≥ 100 億美元'], [2e9, '市值 ≥ 20 億美元'], [0, '全部']];
  const SLOT = { bmo: '盤前', amc: '盤後', na: '時間未定' };
  const REFS = [
    { name: 'Earnings Hub · 財報行事曆', url: 'https://earningshub.com/earnings-calendar/this-week',
      desc: '以週曆呈現每天盤前、盤後公布財報的公司，可看預估與實際 EPS、營收，並提供財報電話會議的即時收聽與重點。免費使用。' },
    { name: 'App Economy Insights', url: 'https://www.appeconomyinsights.com/',
      desc: '把大型科技、消費公司的財報畫成視覺化圖表(營收流向的桑基圖、各事業部成長)，搭配重點解讀，一眼看懂公司賺錢的結構。以電子報形式發布。' },
    { name: 'Seeking Alpha · 最新文章', url: 'https://seekingalpha.com/latest-articles',
      desc: '美股分析文章、財報新聞與電話會議逐字稿，作者多為投資人與分析師，觀點多元。部分內容需付費訂閱。' },
  ];
  const fmtCap = v => !v ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 1e11 ? 0 : 1)}B` : `$${(v / 1e6).toFixed(0)}M`;
  const fmtEps = v => v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  // 美東與台灣的時差(夏令 12 小時、冬令 13 小時)
  function twOffset(d) {
    const t = new Date(d + 'T12:00:00Z');
    const ny = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(t);
    return 20 - ny;   // 台灣 12:00Z = 20 時
  }
  const slotNote = (slot, d) => {
    const off = twOffset(d);
    if (slot === 'bmo') return `美東開盤前 · 台灣 ${9 + off}:30 前`;
    if (slot === 'amc') return `美東收盤後 · 台灣隔天 ${16 + off - 24}:00 後`;
    return '公司未公布時段';
  };
  const links = r => `<a href="https://earningshub.com/quote/${encodeURIComponent(r.s)}" target="_blank" rel="noopener" title="Earnings Hub">EH</a><a href="https://seekingalpha.com/symbol/${encodeURIComponent(r.s)}/earnings" target="_blank" rel="noopener" title="Seeking Alpha">SA</a>`;

  LT.register({
    section: 'stock', group: '美股', key: 'earnings', name: '財報',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入財報行事曆…</p></div></div>`;
      let meta, data;
      try { ({ meta, data } = await LT.loadJSON(DATASET, 'earnings.json')); } catch (err) {
        if (ctx.alive()) el.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(err.message)}</p></div></div>`;
        return;
      }
      if (!ctx.alive()) return;
      let week = 'this', minCap = 1e10, query = '';
      el.innerHTML = `
        <header class="top"><div>
          <h1>美股財報</h1>
          <p>上週、本週、下週的財報行事曆：盤前或盤後公布、市場預估與實際 EPS</p>
          ${LT.sourceLine(meta)}
        </div></header>
        <div class="panel">
          <div class="er-ctrl">
            <div class="mode-tabs er-weeks">${WEEKS.map(([k, n]) => `<button class="mode-tab" data-w="${k}"><b>${n}</b><small>${md(data.weeks[k][0])} ～ ${md(data.weeks[k][4])}</small></button>`).join('')}</div>
            <div class="er-filters">
              <select id="erCap">${CAPS.map(([v, n]) => `<option value="${v}" ${v === minCap ? 'selected' : ''}>${n}</option>`).join('')}</select>
              <input id="erQ" type="search" placeholder="搜尋代號或公司名稱" autocomplete="off">
            </div>
          </div>
          <div class="statgrid" id="erStats" style="margin:14px 0;"></div>
          <div class="er-grid" id="erGrid"></div>
          <p class="note">每張卡片：代號、市值、市場預估 EPS；已公布的公司另有實際 EPS 與驚喜幅度(實際相對預估，紅色高於預估、綠色低於預估)。點 <b>EH</b> 到 Earnings Hub、<b>SA</b> 到 Seeking Alpha 看該公司的財報細節。</p>
        </div>
        <div class="panel">
          <h3 id="erTopTitle"></h3>
          <div class="tablewrap"><table class="stattable er-top" id="erTop"></table></div>
        </div>
        <div class="panel">
          <h3>參考網站</h3>
          ${REFS.map(r => `<a class="linkcard" href="${r.url}" target="_blank" rel="noopener">
            <div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${esc(r.url)}</small></div><span class="go">前往 ↗</span></a>`).join('')}
        </div>
        <div class="panel doc">
          <h3>怎麼看財報行事曆</h3>
          <ul>
            <li><b>盤前(BMO)</b>：美東開盤 9:30 前公布，台灣是當天晚上；<b>盤後(AMC)</b>：美東收盤 16:00 後公布，台灣是隔天清晨。美國夏令時間(3 月中～11 月初)與台灣差 12 小時，其餘差 13 小時。</li>
            <li><b>EPS</b>(每股盈餘)是市場最關注的數字，<b>預估 EPS</b> 是分析師預估的共識平均。財報公布後股價的反應，常取決於實際數字「比預估好還是差」(驚喜幅度)，以及公司對下一季的財測，而不只是有沒有賺錢。</li>
            <li>大型公司(例如蘋果、輝達、台積電 ADR)的財報會影響整個產業與台股相關供應鏈，財報季(每季結束後約 2～6 週)前後波動通常較大。</li>
          </ul>
        </div>`;
      const $ = id => document.getElementById(id);
      const pick = rows => rows.filter(r => (r.cap || 0) >= minCap && (!query || r.s.toLowerCase().includes(query) || r.n.toLowerCase().includes(query)));
      function draw() {
        el.querySelectorAll('.er-weeks .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.w === week));
        const dates = data.weeks[week], all = dates.flatMap(d => pick(data.days[d] || []).map(r => ({ ...r, d })));
        const done = all.filter(r => r.eps != null), beat = done.filter(r => r.sur > 0);
        $('erStats').innerHTML = `
          <div class="stat"><div class="v">${all.length}</div><div class="l">家公司公布財報</div></div>
          <div class="stat"><div class="v">${done.length}</div><div class="l">已公布</div></div>
          <div class="stat"><div class="v">${done.length ? (beat.length / done.length * 100).toFixed(0) + '%' : '—'}</div><div class="l">EPS 優於預估的比例</div></div>
          <div class="stat"><div class="v">${all.filter(r => (r.cap || 0) >= 1e11).length}</div><div class="l">市值 ≥ 1000 億美元</div></div>`;
        $('erGrid').innerHTML = dates.map(d => {
          const rows = pick(data.days[d] || []), wd = WEEKDAY[new Date(d + 'T12:00:00Z').getUTCDay()];
          const isToday = d === data.today;
          const slots = ['bmo', 'amc', 'na'].map(slot => {
            const rs = rows.filter(r => r.t === slot);
            if (!rs.length) return '';
            return `<div class="er-slot"><div class="er-slot-h">${SLOT[slot]}<small>${slotNote(slot, d)}</small></div>
              ${rs.map(r => `<div class="er-card">
                <div class="er-top-row"><b>${esc(r.s)}</b><span class="er-cap">${fmtCap(r.cap)}</span><span class="er-links">${links(r)}</span></div>
                <div class="er-name" title="${esc(r.n)}">${esc(r.n)}</div>
                <div class="er-eps">${r.eps != null
                  ? `實際 <b>${fmtEps(r.eps)}</b> · 預估 ${fmtEps(r.est)} · <b class="${cls(r.sur)}">${fmtPct(r.sur)}</b>`
                  : `預估 EPS <b>${fmtEps(r.est)}</b>${r.ly != null ? ` · 去年 ${fmtEps(r.ly)}` : ''}`}</div>
              </div>`).join('')}</div>`;
          }).join('');
          return `<div class="er-day ${isToday ? 'today' : ''}"><div class="er-day-h">${md(d)}(${wd})<span>${rows.length} 家</span></div>${slots || '<div class="mute er-empty">沒有符合條件的公司</div>'}</div>`;
        }).join('');
        // 市值前 10 大
        const top = all.slice().sort((a, b) => (b.cap || 0) - (a.cap || 0)).slice(0, 10);
        const reported = top.some(r => r.eps != null);
        $('erTopTitle').textContent = `${WEEKS.find(w => w[0] === week)[1]}市值前 10 大`;
        $('erTop').innerHTML = top.length ? `<thead><tr><th>日期</th><th>時段</th><th>代號</th><th>公司</th><th>市值</th><th>財報季度</th><th>預估 EPS</th>${reported ? '<th>實際 EPS</th><th>驚喜幅度</th>' : '<th>去年同期 EPS</th><th>預估年增</th>'}</tr></thead>
          <tbody>${top.map(r => `<tr><td>${md(r.d)}(${WEEKDAY[new Date(r.d + 'T12:00:00Z').getUTCDay()]})</td><td>${SLOT[r.t]}</td>
            <td><a href="https://earningshub.com/quote/${encodeURIComponent(r.s)}" target="_blank" rel="noopener">${esc(r.s)}</a></td><td style="text-align:left">${esc(r.n)}</td>
            <td>${fmtCap(r.cap)}</td><td>${esc(r.q)}</td><td>${fmtEps(r.est)}</td>
            ${reported ? `<td>${fmtEps(r.eps)}</td><td class="${cls(r.sur)}">${fmtPct(r.sur)}</td>`
              : `<td>${fmtEps(r.ly)}</td><td class="${r.ly > 0 ? cls(r.est / r.ly - 1) : ''}">${r.ly > 0 && r.est != null ? fmtPct((r.est / r.ly - 1) * 100) : '—'}</td>`}</tr>`).join('')}</tbody>`
          : '<tbody><tr><td class="mute">沒有符合條件的公司</td></tr></tbody>';
      }
      el.querySelector('.er-weeks').onclick = e => { const b = e.target.closest('[data-w]'); if (b) { week = b.dataset.w; draw(); } };
      $('erCap').onchange = () => { minCap = +$('erCap').value; draw(); };
      $('erQ').oninput = () => { query = $('erQ').value.trim().toLowerCase(); draw(); };
      draw();
    },
  });
})();
