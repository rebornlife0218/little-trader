/* 後台(只給管理員：users.role = 'admin'；這支程式本身也只有管理員下載得到)
   網址 #/other/admin，不列在側欄與首頁；資料來自 api/admin/stats */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = v => Number.isFinite(+v) ? (+v).toLocaleString() : '—';
  const table = (heads, rows) => `<div class="tablewrap"><table class="stattable"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="mute">沒有資料</td></tr>`}</tbody></table></div>`;
  const who = r => `${r.kind === 'member' ? '👤 ' : ''}${esc(r.kind === 'guest' ? '訪客 ' + String(r.who).slice(0, 8) : r.who)}`;

  LT.register({
    section: 'other', key: 'admin', name: '後台', hidden: true,
    async mount(el, ctx) {
      let days = 7;
      el.innerHTML = `
        <header class="top"><div><h1>後台</h1><p>誰在查資料、熱門股票、API 用量與效能(時間皆為台北時間)；保留中的功能：<a href="#/stock/query">股價查詢(預覽)</a></p></div></header>
        <div class="btnrow-l adm-days">${[1, 7, 30, 90].map(d => `<button type="button" data-d="${d}" class="${d === days ? 'active' : ''}">${d === 1 ? '24 小時' : `近 ${d} 天`}</button>`).join('')}</div>
        <div id="admOut" style="margin-top:14px;"><div class="panel"><p class="mute">載入中…</p></div></div>`;
      const out = el.querySelector('#admOut');
      async function load() {
        const r = await fetch(`api/admin/stats?days=${days}`);
        if (!ctx.alive()) return;
        if (!r.ok) { out.innerHTML = `<div class="panel"><p class="mute">無法載入(HTTP ${r.status})</p></div>`; return; }
        const S = await r.json(), T = S.totals;
        out.innerHTML = `
          <div class="statgrid" style="margin-bottom:16px;">
            <div class="stat"><div class="v">${n0(T.requests)}</div><div class="l">API 請求數</div></div>
            <div class="stat"><div class="v">${n0(T.active_members)} / ${n0(T.members)}</div><div class="l">期間有登入的會員 / 全部會員</div></div>
            <div class="stat"><div class="v">${n0(T.guests)}</div><div class="l">呼叫 API 的訪客</div></div>
          </div>
          <div class="panel"><h3 style="margin-top:0;">每日請求數</h3><div id="admChart"></div></div>
          <div class="adm-grid">
            <div class="panel"><h3 style="margin-top:0;">熱門股票</h3>${table(['#', '股票', '查詢次數', '查詢人數', '會員 / 訪客'],
              S.symbols.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.symbol)} ${esc(r.name || '')}</td><td>${n0(r.n)}</td><td>${n0(r.users)}</td><td>${n0(r.member)} / ${n0(r.guest)}</td></tr>`))}</div>
            <div class="panel"><h3 style="margin-top:0;">誰在查資料</h3>${table(['使用者', '請求數', '查過幾檔', '最後一次'],
              S.users.map(r => `<tr><td>${who(r)}</td><td>${n0(r.n)}</td><td>${n0(r.symbols)}</td><td>${esc(r.last)}</td></tr>`))}</div>
          </div>
          <div class="panel"><h3 style="margin-top:0;">用量與效能</h3>${table(['日期', '請求數', '使用者', '錯誤', '超過額度', '平均(ms)', '最慢(ms)'],
            S.daily.slice().reverse().map(r => `<tr><td>${esc(r.day)}</td><td>${n0(r.n)}</td><td>${n0(r.users)}</td><td>${n0(r.errors)}</td><td>${n0(r.throttled)}</td><td>${n0(r.avg_ms)}</td><td>${n0(r.max_ms)}</td></tr>`))}</div>
          <div class="panel"><h3 style="margin-top:0;">最近的請求(最多 100 筆)</h3>${table(['時間', '使用者', 'API', '股票', '期間', '狀態', 'ms', 'IP'],
            S.recent.map(r => `<tr><td>${esc(r.ts)}</td><td>${who(r)}</td><td>${esc(r.endpoint)}</td><td>${esc(r.symbol || '')}</td><td>${r.range_from ? `${esc(r.range_from)} ～ ${esc(r.range_to)}` : ''}</td><td>${r.status}</td><td>${n0(r.duration_ms)}</td><td>${esc(r.ip || '')} ${esc(r.country || '')}</td></tr>`))}</div>`;
        if (S.daily.length) LTChart.bars(out.querySelector('#admChart'), { x: S.daily.map(r => r.day), height: 200, label: '每日請求數',
          series: [{ name: '請求數', y: S.daily.map(r => r.n), color: 'var(--amber)' }], yFmt: v => n0(v), xFmt: d => String(d).slice(5) });
      }
      el.querySelector('.adm-days').onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        days = +b.dataset.d;
        el.querySelectorAll('.adm-days button').forEach(x => x.classList.toggle('active', x === b));
        load();
      };
      load();
    },
  });
})();
