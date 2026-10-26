/* 後台(只給管理員：users.role = 'admin'；這支程式本身也只有管理員下載得到)
   網址 other/admin，不列在側欄與首頁；資料來自 api/admin/stats */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = v => Number.isFinite(+v) ? (+v).toLocaleString() : '—';
  const table = (heads, rows) => `<div class="tablewrap"><table class="stattable"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="mute">沒有資料</td></tr>`}</tbody></table></div>`;
  const who = r => `${r.kind === 'member' ? '👤 ' : ''}${esc(r.kind === 'guest' ? '訪客 ' + String(r.who).slice(0, 8) : r.who)}`;
  const secName = k => k === 'home' ? '首頁' : (LT.SECTIONS.find(s => s.key === k) || {}).name || k;

  /* 最受歡迎的主題：區塊 › 頁面 › 細項，用 <details> 一層一層點開
     1. 先依網站目前的結構列出所有主題(還沒有人看過的顯示 0)：側欄的頁面、目錄頁的分組與項目(LT.catalog)、
        頁面註冊時的 topics(分頁、指數、章節…；名稱和頁面裡 LT.view 記錄的一樣)
     2. 再把瀏覽次數填進去；結構裡找不到的紀錄(改版前的舊頁面或舊名稱)另外列在「舊版紀錄」
     區塊、頁面是「換頁」的次數；細項是切換到那個畫面的次數，上層 = 底下所有細項的加總；同一層依瀏覽次數排序 */
  function topicTree(S) {
    const ZERO = { n: 0, people: 0, member: 0, guest: 0 };
    const mk = (name, known) => ({ name, known, r: null, kids: new Map() });
    const root = mk('', true);
    const at = (path, name, known) => {                 // 依路徑找節點，沒有就建立
      let nd = root;
      path.forEach((k, i) => {
        if (!nd.kids.has(k)) nd.kids.set(k, mk(i === path.length - 1 && name ? name : k, known));
        nd = nd.kids.get(k);
      });
      return nd;
    };
    const addTopics = (path, topics) => (topics || []).forEach(t => {
      if (typeof t === 'string') at([...path, t], t, true);
      else { at([...path, t.name], t.name, true); addTopics([...path, t.name], t.items); }
    });
    // 1. 網站目前的結構
    LT.SECTIONS.forEach(sec => {
      at([sec.key], secName(sec.key), true);
      LT.listPages().filter(pg => pg.section === sec.key && pg.mount && !pg.redirect && pg.key !== 'admin').forEach(pg => {
        const pp = [sec.key, pg.key];
        at(pp, pg.name, true);
        if (pg.catalog) pg.catalog.groups.forEach(g => g.items.filter(it => !it.soon).forEach(it => {
          const ip = [...pp, ...(g.name ? [g.name] : []), it.name];
          if (g.name) at([...pp, g.name], g.name, true);
          at(ip, it.name, true);
          addTopics(ip, it.topics);
        }));
        addTopics(pp, pg.topics);
      });
    });
    at(['home'], '首頁', true);
    // 2. 填入瀏覽次數
    S.sections.forEach(r => { at([r.section], secName(r.section), false).r = r; });
    S.pages.forEach(r => { at([r.section, r.page], r.title || r.page, false).r = r; });
    S.levels.forEach((rows, d) => rows.forEach(r => {
      const labels = ['l1', 'l2', 'l3'].slice(0, d + 1).map(k => r[k]);
      at([r.section, r.page, ...labels], labels[d], false).r = r;
    }));
    // 輸出：已知的依次數排序；舊版紀錄(結構裡沒有的)放在同一層最後
    const cells = r => `<span class="tr-n">${n0(r.n)}</span><span class="tr-p">${n0(r.people)}</span><span class="tr-m">${n0(r.member)} / ${n0(r.guest)}</span>`;
    const order = nd => [...nd.kids.values()].sort((a, b) => (b.known - a.known) || ((b.r || ZERO).n - (a.r || ZERO).n));
    const render = nd => {
      const r = nd.r || ZERO, kids = order(nd).map(render).join('');
      const extra = (nd.r && nd.r.locked ? ` <small class="mute">訪客被擋 ${n0(nd.r.locked)}</small>` : '') + (nd.known ? '' : ' <small class="mute">(舊版紀錄)</small>');
      const cls = r.n ? '' : ' tr-zero';
      return kids
        ? `<details class="tr-node${cls}"><summary><span class="tr-name">${esc(nd.name)}${extra}</span>${cells(r)}</summary><div class="tr-kids">${kids}</div></details>`
        : `<div class="tr-node tr-leaf${cls}"><span class="tr-name">${esc(nd.name)}${extra}</span>${cells(r)}</div>`;
    };
    return `<div class="adm-tree">
      <div class="tr-head"><span class="tr-name">主題</span><span class="tr-n">瀏覽次數</span><span class="tr-p">人數</span><span class="tr-m">登入 / 訪客</span></div>
      ${order(root).map(render).join('')}
    </div>`;
  }

  /* 登入用戶分析：每位會員期間內看了哪些主題(主題 = 頁面 › 最深一層的細項，例如「台股策略 › 月營收年增率…」)，
     以及登入用戶最常看的主題(依人數排序) */
  function memberPanel(S) {
    const base = r => { const pg = LT.listPages().find(p => p.section === r.section && p.key === r.page);
      return pg ? (pg.catalog && pg.catalog.title) || pg.name : r.title || r.page; };
    const label = r => [base(r), r.l3 || r.l2 || r.l1].filter(Boolean).join(' › ');
    const per = new Map(), all = new Map();
    (S.mviews || []).forEach(r => {
      const k = label(r), u = per.get(r.uid) || per.set(r.uid, { n: 0, t: new Map() }).get(r.uid);
      u.n += r.n; u.t.set(k, (u.t.get(k) || 0) + r.n);
      const a = all.get(k) || all.set(k, { n: 0, people: new Set() }).get(k);
      a.n += r.n; a.people.add(r.uid);
    });
    const top = [...all].sort((a, b) => b[1].people.size - a[1].people.size || b[1].n - a[1].n).slice(0, 20);
    const ms = (S.members || []).map(m => ({ ...m, v: per.get(m.uid) || { n: 0, t: new Map() } })).sort((a, b) => b.v.n - a.v.n);
    const topics = v => { const t = [...v.t].sort((a, b) => b[1] - a[1]);
      if (!t.length) return '<span class="mute">—</span>';
      const li = ([k, n]) => `${esc(k)} <small class="mute">×${n0(n)}</small>`;
      return t.slice(0, 3).map(li).join('<br>') + (t.length > 3 ? `<details><summary class="mute">全部 ${t.length} 個主題</summary>${t.slice(3).map(li).join('<br>')}</details>` : ''); };
    const seen = ms.filter(m => m.v.n).length;
    return `<div class="panel"><h3 style="margin-top:0;">登入用戶分析</h3>
      <p class="mute">期間內有瀏覽紀錄的會員 ${n0(seen)} 人(登入過的會員共 ${n0(ms.length)} 人)</p>
      <h4>登入用戶最常看的主題</h4>
      ${table(['#', '主題', '人數', '瀏覽次數'], top.map(([k, a], i) => `<tr><td>${i + 1}</td><td style="text-align:left">${esc(k)}</td><td>${n0(a.people.size)}</td><td>${n0(a.n)}</td></tr>`))}
      <h4>每位會員看了哪些主題</h4>
      ${table(['會員', '第一次登入', '最後上線', '瀏覽次數', '最常看的主題'], ms.map(m => `<tr><td style="text-align:left">${esc(m.email || m.uid)}${m.name ? `<br><small class="mute">${esc(m.name)}</small>` : ''}</td>
        <td>${esc(m.created || '')}</td><td>${esc(m.last_seen || '')}</td><td>${n0(m.v.n)}</td><td style="text-align:left;white-space:normal">${topics(m.v)}</td></tr>`))}
      <p class="note">只算登入後的瀏覽(登入前用訪客身分看的不算)；主題 = 頁面 › 看到的最深一層(研究、策略、分頁)，只進入頁面沒有切換細項的記成頁面本身。Google 登入只提供 email 與名稱，沒有年齡、性別。</p></div>`;
  }

  LT.register({
    section: 'other', key: 'admin', name: '後台', hidden: true,
    async mount(el, ctx) {
      let days = 7;
      el.innerHTML = `
        <header class="top"><div><h1>後台</h1><p>最受歡迎的主題、登入用戶分析、分享紀錄、誰在查資料、熱門股票、API 用量與效能(時間皆為台北時間；不含管理員自己與測試帳號的紀錄)</p></div></header>
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
            <p class="note">列出網站上所有的主題，還沒有人看過的顯示 0(灰色)；結構裡已經沒有的舊頁面或舊名稱標「舊版紀錄」。區塊、頁面的次數是進入那一頁的次數；頁面底下的細項(分頁、研究、下拉選單)是切換到那個畫面的次數，每一層是底下所有細項的加總，快速連續切換只算最後停下來的畫面。
              「訪客被擋」：沒登入的人點進需要登入的區塊的次數，可以看出大家想看但被擋住的主題。</p></div>
          ${memberPanel(S)}
          <div class="panel"><h3 style="margin-top:0;">分享紀錄 <small class="mute">(全部期間)</small></h3>${(S.shares || []).length ? table(['分享的人', '報告', '分享時間', '點開次數', '登入後看的人', '新會員', '看的人是誰'],
              S.shares.map(r => `<tr><td>${esc(r.sharer || '')}</td><td><a href="${esc(r.path)}">${esc(r.title || r.path)}</a></td><td>${esc(r.created)}</td><td>${n0(r.clicks)}</td><td>${n0(r.viewers)}<small class="mute">(${n0(r.views)} 次)</small></td><td>${n0(r.new_members)}</td><td style="text-align:left;white-space:normal">${esc(r.who || '—')}</td></tr>`))
              : '<p class="mute">還沒有人分享報告。</p>'}
            <p class="note">研究、策略頁的「分享」按鈕會產生專屬連結(同一個人分享同一份報告是同一個連結)。點開次數含沒登入的人(社群網站抓預覽不算)；「登入後看的人」是透過這個連結進來、登入 Google 後看了報告的帳號(分享的人自己不算)；「新會員」是點了這個連結才第一次登入的人。</p></div>
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
