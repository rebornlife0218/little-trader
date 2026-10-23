/* 後台(只給管理員：users.role = 'admin'；這支程式本身也只有管理員下載得到)
   網址 #/other/admin，不列在側欄與首頁；資料來自 api/admin/stats */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = v => Number.isFinite(+v) ? (+v).toLocaleString() : '—';
  const table = (heads, rows) => `<div class="tablewrap"><table class="stattable"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="mute">沒有資料</td></tr>`}</tbody></table></div>`;
  const who = r => `${r.kind === 'member' ? '👤 ' : ''}${esc(r.kind === 'guest' ? '訪客 ' + String(r.who).slice(0, 8) : r.who)}`;
  const secName = k => k === 'home' ? '首頁' : (LT.SECTIONS.find(s => s.key === k) || {}).name || k;

  /* 最受歡迎的主題：區塊 › 頁面 › 細項(最多三層)，用 <details> 一層一層點開；同一層依瀏覽次數排序
     區塊、頁面是「換頁」的次數；細項是切換到那個畫面的次數，上層 = 底下所有細項的加總 */
  function topicTree(S) {
    const kids = (rows, match) => rows.filter(match).sort((a, b) => b.n - a.n);
    const cells = r => `<span class="tr-n">${n0(r.n)}</span><span class="tr-p">${n0(r.people)}</span><span class="tr-m">${n0(r.member)} / ${n0(r.guest)}</span>`;
    const node = (name, r, children, extra = '') => children
      ? `<details class="tr-node"><summary><span class="tr-name">${name}${extra}</span>${cells(r)}</summary><div class="tr-kids">${children}</div></details>`
      : `<div class="tr-node tr-leaf"><span class="tr-name">${name}${extra}</span>${cells(r)}</div>`;
    const [L1, L2, L3] = S.levels;
    const level = (sec, page, depth, prefix) => {
      const rows = [L1, L2, L3][depth];
      if (!rows) return '';
      const same = r => r.section === sec && r.page === page && [r.l1, r.l2].slice(0, depth).every((v, i) => v === prefix[i]);
      const key = ['l1', 'l2', 'l3'][depth];
      return kids(rows, same).map(r => {
        const sub = level(sec, page, depth + 1, [...prefix, r[key]]);
        return node(esc(r[key]), r, sub);
      }).join('');
    };
    const html = kids(S.sections, () => true).filter(r => r.section !== 'home').map(sec => {
      const pages = kids(S.pages, r => r.section === sec.section).map(pg => node(esc(pg.title || pg.page), pg, level(sec.section, pg.page, 0, []))).join('');
      return node(esc(secName(sec.section)), sec, pages, sec.locked ? ` <small class="mute">訪客被擋 ${n0(sec.locked)}</small>` : '');
    }).join('');
    const home = S.sections.find(r => r.section === 'home');
    return `<div class="adm-tree">
      <div class="tr-head"><span class="tr-name">主題</span><span class="tr-n">瀏覽次數</span><span class="tr-p">人數</span><span class="tr-m">登入 / 訪客</span></div>
      ${html || '<p class="mute">沒有資料</p>'}
      ${home ? node('首頁', home, '') : ''}
    </div>`;
  }

  LT.register({
    section: 'other', key: 'admin', name: '後台', hidden: true,
    async mount(el, ctx) {
      let days = 7;
      el.innerHTML = `
        <header class="top"><div><h1>後台</h1><p>最受歡迎的主題、誰在查資料、熱門股票、API 用量與效能(時間皆為台北時間；不含管理員自己的紀錄)</p></div></header>
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
            <div class="stat"><div class="v">${n0(T.active_members)} / ${n0(T.members)}</div><div class="l">期間有登入 / 登入過 Google 的人</div></div>
            <div class="stat"><div class="v">${n0(T.views)}</div><div class="l">頁面瀏覽次數</div></div>
            <div class="stat"><div class="v">${n0(T.viewers)}</div><div class="l">瀏覽人數(不重複)</div></div>
          </div>
          <div class="panel"><h3 style="margin-top:0;">最受歡迎的主題 <small class="mute">(點 ▸ 一層一層展開)</small></h3>${topicTree(S)}
            <p class="note">區塊、頁面的次數是進入那一頁的次數；頁面底下的細項(分頁、研究、下拉選單)是切換到那個畫面的次數，每一層是底下所有細項的加總，快速連續切換只算最後停下來的畫面。
              「訪客被擋」：沒登入的人點進需要登入的區塊的次數，可以看出大家想看但被擋住的主題。</p></div>
          <div class="panel"><h3 style="margin-top:0;">每日請求數</h3><div id="admChart"></div></div>
          <div class="adm-grid">
            <div class="panel"><h3 style="margin-top:0;">熱門股票</h3>${table(['#', '股票', '查詢次數', '查詢人數', '登入 / 訪客'],
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
