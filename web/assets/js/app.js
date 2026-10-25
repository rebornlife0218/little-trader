/* ==========================================================================
   Little Trader 網站框架：區塊(側欄)註冊、頁面路由
   新增研究內容：在 modules/<區塊>/ 新增 JS，呼叫 LT.register({...})(外部連結用 href)，
   再到 index.html 加上 <script defer src="modules/..."></script>(會員區塊改加到 functions/_lib/access.json)。詳見 docs/ARCHITECTURE.md
   ========================================================================== */
const LT = (() => {
  // 側欄區塊(順序即側欄順序)；新增區塊直接在這裡加一筆，desc 顯示在首頁
  const SECTIONS = [
    { key: 'index', name: '指數', desc: '全球 10 大指數的急跌反彈、均線、週期與 K 棒型態統計；台指期貨的價差、轉倉與法人未平倉' },
    { key: 'etf', name: 'ETF', desc: 'ETF 介紹與折溢價、怎麼存 ETF(績效比較、配息課稅、0050 vs 勞退基金)、ETF 研究，以及即將發行的新 ETF' },
    { key: 'stock', name: '股票', desc: '台股處置股、策略回測與其他研究；美股財報行事曆與 S&P500 換股策略回測' },
    { key: 'option', name: '選擇權', desc: '臺指選擇權的隱含波動率、P/C ratio、T 字報價與結算日曆；24 種策略損益圖與 Black-Scholes 計算器' },
    { key: 'stats', name: '統計學', desc: '初級統計學 13 章：觀念、公式、R 範例、台股實例與互動模擬' },
    { key: 'other', name: '其他', desc: '研究與交易時常用的網站推薦' },
  ];
  // 頁面三種：一般 {section,key,name,mount(el,ctx),unmount?} / 外部連結 {…,href} / 建置中 {…,desc}(沒有 mount)
  // 加上 group(例如 '台股')，側欄與首頁會在區塊內再分小組，同組頁面請連續註冊
  const pages = [];
  let home = null; // 首頁 {name, mount}，由 modules/home/home.js 設定
  let current = null;
  let routeSeq = 0; // 換頁計數：非同步載入完成時用來確認使用者還在同一頁

  /* ---------- 網址：一般網址(不用 #)，例如 stock/tw-strategy/lowvol ----------
     網站根目錄由 index.html 的 <base href> 決定(主站是 /；GitHub Pages 備援站是 /little-trader/，部署時由 scripts/build-site.mjs 改寫)，
     所以站內連結、資料、API 一律寫相對網址(href="stock/query/2330"，首頁 href="./")。
     點站內連結不重新載入網頁：click 攔下來用 history.pushState 換網址再 route()；舊的 #/… 網址(書籤、分享出去的連結)自動轉成新網址 */
  const BASE = new URL(document.baseURI).pathname;
  // 目前網址的各層(已解碼)：['stock', 'query', '2330']；首頁是 []
  function path() {
    const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, '');
    return p.split('/').filter(x => x && x !== 'index.html').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  }
  const here = () => path().map(encodeURIComponent).join('/');   // 目前頁面的相對網址
  // 換頁：LT.go('stock/query/2330')；replace: true 不留在上一頁的紀錄裡(例如舊網址轉新網址)
  function go(url, opt = {}) {
    url = String(url || '').replace(/^#?\/?/, '');
    history[opt.replace ? 'replaceState' : 'pushState'](null, '', url || './');
    route();
  }
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const raw = a.getAttribute('href');
    if (raw.startsWith('#') && !raw.startsWith('#/')) {          // 同一頁裡的錨點：只捲動，不換頁
      e.preventDefault();
      const t = raw.length > 1 && document.getElementById(decodeURIComponent(raw.slice(1)));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const u = new URL(a.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
    const rel = raw.startsWith('#/') ? raw.slice(2) : u.pathname.slice(BASE.length);
    const first = rel.split('/')[0];
    if (first && !SECTIONS.some(sec => sec.key === first)) return;   // data/、assets/ 等檔案照常開啟
    e.preventDefault();
    if (rel !== here()) go(rel); else window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- 會員：訪客看不到的區塊(由後端 functions/_lib/access.json 決定，經 api/me 傳回) ----------
     會員區塊的頁面程式不寫在 index.html，登入的會員才由 api/me 拿到清單、在這裡載入；
     伺服器也會擋訪客直接下載這些程式與資料，所以畫面上的鎖只是提示 */
  let auth = { kind: 'guest', memberSections: [], scripts: [], api: false, canLogin: false };
  const locked = secKey => auth.kind !== 'member' && auth.memberSections.includes(secKey);
  function loadScripts(list) {
    return Promise.all(list.map(src => new Promise(done => {
      const s = document.createElement('script');
      s.src = src; s.async = false;            // 依清單順序執行(頁面的註冊順序 = 側欄順序)
      s.onload = done; s.onerror = () => { console.error('載入失敗：' + src); done(); };
      document.head.appendChild(s);
    })));
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 登入按鈕(訪客)或「到主站登入」(備援站沒有後端)
  function loginButton(label = '用 Google 登入') {
    if (auth.canLogin) return `<button type="button" class="login-btn" onclick="LTAuth.login()">${label}</button>`;
    if (!auth.api) return `<a class="login-btn" href="${LTAuth.MAIN_SITE}${here()}">到主站登入 ↗</a>`;
    return '<span class="mute">登入功能尚未開放</span>';
  }
  function lockedPanel(sec) {
    return `<header class="top"><div><h1>${esc(sec.name)}</h1><p>${esc(sec.desc || '')}</p></div></header>
      <div class="panel lock-panel">
        <div class="lock-ico">🔒</div>
        <h2>登入 Google 看更多</h2>
        <p class="mute">用 Google 帳號登入後，就能看 ETF、股票、選擇權的所有內容；設有密碼的策略仍需要另外輸入密碼。</p>
        ${loginButton()}
        ${LTAuth.error ? `<p class="lock-err">${esc(LTAuth.error)}</p>` : ''}
      </div>`;
  }
  function renderAccount() {
    const el = document.getElementById('sideAccount');
    if (!el) return;
    el.innerHTML = auth.kind === 'member'
      ? `<div class="acct-who" title="${esc(auth.email || '')}">👤 ${esc(auth.email || 'Google 帳號')}</div>
         ${auth.admin ? '<a class="acct-link" href="other/admin">後台</a>' : ''}<button type="button" class="acct-link" onclick="LTAuth.logout()">登出</button>`
      : `<div class="acct-who mute">訪客</div>${loginButton('Google 登入')}${LTAuth.error ? `<div class="acct-err">${esc(LTAuth.error)}</div>` : ''}`;
  }
  /* ---------- 股票代號連結：點了跳到股票查詢並直接查這一檔，查詢頁有按鈕可以跳回來 ----------
     頁面裡用 LT.stockLink(代號, 顯示文字) 產生連結(stock/query/<代號>)；點的時候記住原本的頁面與捲動位置，
     按「返回」回到原本的頁面後，等內容載入再捲回原本的位置 */
  function stockLink(code, text) {
    return `<a href="stock/query/${encodeURIComponent(code)}" class="stock-link" title="在股票查詢看 ${esc(code)}">${esc(text ?? code)}</a>`;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.stock-link');
    if (a) rememberBack();
  }, true);
  // 記住從哪一頁去股票查詢(查詢頁上方的「返回」按鈕用)；本來就在股票查詢就不覆蓋
  function rememberBack() {
    if (!current || current.key === 'query') return;
    try { sessionStorage.setItem('lt.query.back', JSON.stringify({ url: here(), name: current.name, y: window.scrollY })); } catch (er) {}
  }
  /* ---------- LOGO 下方的股票搜尋 ----------
     輸入代號或名稱(建議清單來自 api/symbols，第一次點搜尋框才載入)，Enter 或選了建議就跳到股票查詢；
     側欄收起時只顯示 🔍(點了展開側欄)，手機版在上方另有 🔍 按鈕 */
  function initSearch() {
    const form = document.getElementById('sideSearch'), input = document.getElementById('sideSearchInput');
    if (!form) return;
    let list = null;
    const loadList = () => {
      if (list) return;
      list = [];
      fetch('api/symbols').then(r => r.ok ? r.json() : Promise.reject())
        .then(j => { list = j.symbols; document.getElementById('sideSymList').innerHTML = list.map(x => `<option value="${esc(x.symbol)} ${esc(x.name)}">`).join(''); })
        .catch(() => { list = null; });
    };
    const search = () => {
      const v = input.value.trim();
      if (!v) return;
      const m = v.match(/^([0-9A-Za-z]{4,6})(\s|$)/);
      const hit = !m && list && (list.find(x => x.name === v) || list.find(x => x.name && x.name.includes(v)));
      const code = m ? m[1].toUpperCase() : hit ? hit.symbol : v;
      input.value = ''; input.blur();
      document.body.classList.remove('nav-open');
      rememberBack();
      go(`stock/query/${encodeURIComponent(code)}`);
    };
    input.addEventListener('focus', loadList);
    // 從建議清單選了一檔(值是「代號 名稱」)就直接查；桌機 Chrome 選建議時沒有 inputType，Android 是 insertReplacementText
    input.addEventListener('input', e => { if ((!e.inputType || e.inputType === 'insertReplacementText') && list && /^[0-9A-Za-z]{4,6} /.test(input.value)) search(); });
    form.onsubmit = e => { e.preventDefault(); search(); };
    form.querySelector('.ss-ico').onclick = () => {
      if (document.documentElement.classList.contains('side-collapsed') && window.innerWidth > 860) { toggleSidebar(); setTimeout(() => input.focus(), 250); }
      else if (input.value.trim()) search(); else input.focus();
    };
    // 手機：要在點擊的當下 focus(不能放在 setTimeout 裡)，手機瀏覽器才會跳出鍵盤
    document.getElementById('topSearch').onclick = () => { document.body.classList.add('nav-open'); input.focus({ preventScroll: true }); };
  }
  function goBack(back) {
    try { sessionStorage.setItem('lt.restoreY', JSON.stringify(back)); sessionStorage.removeItem('lt.query.back'); } catch (e) {}
    go(back.url);
  }
  // 從股票查詢返回時捲回原本的位置：頁面內容是非同步載入的，等頁面夠高再捲(最多等 4 秒)
  function restoreScroll(seq) {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem('lt.restoreY') || 'null'); } catch (e) {}
    if (!r || r.url !== here()) return;
    try { sessionStorage.removeItem('lt.restoreY'); } catch (e) {}
    const t0 = Date.now();
    (function tryScroll() {
      if (seq !== routeSeq) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= r.y || Date.now() - t0 > 4000) window.scrollTo(0, r.y);
      else setTimeout(tryScroll, 150);
    })();
  }
  // 瀏覽紀錄：每次換頁送一筆到 api/track(後台的「最受歡迎的主題」)；備援站沒有後端就不送
  function track(section, page, title, isLocked, trail) {
    if (!auth.api) return;
    try {
      navigator.sendBeacon('api/track', new Blob([JSON.stringify({ section, page, title, locked: !!isLocked, path: trail || [] })], { type: 'application/json' }));
    } catch (e) {}
  }
  /* 頁面裡的細項(分頁、下拉選單)：頁面在切換時呼叫 LT.view('ETF研究', '主動式ETF', 'A 系列 ETF 跟單')，最多三層。
     連續切換(例如換類別會自動帶出第一個研究)只記最後停下來的畫面：0.6 秒內沒有再變才送；同一個細項不重複記 */
  let viewTimer = null, lastView = '';
  function view(...labels) {
    const page = current;
    const trail = labels.filter(Boolean).map(s => String(s).trim().slice(0, 40)).slice(0, 3);
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => {
      const key = trail.join(' › ');
      if (!page || page !== current || !trail.length || key === lastView) return;
      lastView = key;
      track(page.section, page.key, page.name, false, trail);
    }, 600);
  }
  // 第一次來訪：選擇用 Google 登入或以訪客身分繼續(記住選擇，不再詢問)
  function welcome() {
    let seen = false;
    try { seen = localStorage.getItem('lt.guest') === '1'; } catch (e) {}
    if (auth.kind === 'member' || !auth.canLogin || seen) return;
    const box = document.createElement('div');
    box.className = 'welcome-mask';
    box.innerHTML = `<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
        <img src="assets/img/logo.svg" alt="" class="welcome-logo">
        <h2 id="welcomeTitle">歡迎來到 Little Trader</h2>
        <p class="mute">訪客可以看指數、統計學與其他；登入 Google 看更多：ETF、股票、選擇權。</p>
        ${loginButton()}
        <button type="button" class="welcome-guest">以訪客身分繼續瀏覽</button>
      </div>`;
    box.querySelector('.welcome-guest').onclick = () => { try { localStorage.setItem('lt.guest', '1'); } catch (e) {} box.remove(); };
    document.body.appendChild(box);
  }

  function register(page) {
    if (!SECTIONS.find(s => s.key === page.section)) {
      console.error('未知區塊：' + page.section); return;
    }
    pages.push(page);
  }
  function setHome(page) { home = page; }

  /* ---------- 目錄頁：側欄頁面 › 分組的卡片列表 › 單一內容(研究、策略) ----------
     LT.catalog({ section, group, key, name, desc, groups: [{ name, desc, items: [{ key, name, desc, summary, tags, soon, run(el, ctx) }] }] })
       summary(選填)：研究的一句話結論(精簡版)；分組裡有 summary 時改成條列，標題下面直接寫結論，desc 變成滑鼠提示
       - <區塊>/<頁面>           卡片列表(依 groups 分組；soon: true 的項目顯示「建置中」，不能點)
       - <區塊>/<頁面>/<項目>    單一內容：上方的麵包屑可以回到列表，內容由 run(el, ctx) 畫；ctx.alive() 同一般頁面，
                                  ctx.view(...) 可再記一層細項(例如策略裡的分頁)
     每個項目都有自己的網址(可分享、加書籤、上一頁回到列表)，後台的熱門主題自動記到「分組 › 項目」 */
  function catalog(def) {
    register({
      section: def.section, group: def.group, key: def.key, name: def.name, catalog: def,
      mount(el, ctx) {
        const items = def.groups.flatMap(g => g.items.map(it => ({ ...it, groupName: g.name })));
        const want = path()[2] || '';
        const it = items.find(x => x.key === want && !x.soon);
        const base = `${def.section}/${def.key}`;
        if (!it) {
          if (want) history.replaceState(null, '', base);   // 找不到的項目：回到列表
          el.innerHTML = `<header class="top"><div><h1>${esc(def.title || def.name)}</h1>${def.desc ? `<p>${esc(def.desc)}</p>` : ''}</div></header>
            ${def.groups.map(g => `<section class="cat-group">
              ${g.name ? `<h2 class="cat-group-h">${esc(g.name)}${g.desc ? ` <small>${esc(g.desc)}</small>` : ''}</h2>` : ''}
              <div class="cat-grid ${g.items.some(x => x.summary) ? 'is-list' : ''}">${g.items.length ? g.items.map(x => x.summary && !x.soon
                ? `<a class="cat-row" href="${base}/${encodeURIComponent(x.key)}" title="${esc(x.desc || '')}"><b>${esc(x.name)}</b><span>${esc(x.summary)}</span>${x.tags ? `<em>${x.tags}</em>` : ''}</a>`
                : x.soon
                ? `<div class="cat-card soon"><b>${esc(x.name)}</b><span>${esc(x.desc || '')}</span><em>努力建置中</em></div>`
                : `<a class="cat-card" href="${base}/${encodeURIComponent(x.key)}"><b>${esc(x.name)}</b><span>${esc(x.desc || '')}</span>${x.tags ? `<em>${x.tags}</em>` : ''}</a>`).join('')
                : '<div class="cat-card soon"><b>努力建置中</b></div>'}</div>
            </section>`).join('')}`;
          return;
        }
        document.title = `${it.name} · Little Trader`;
        crumbs(it.name);
        const canShare = auth.kind === 'member' && auth.api && !/需要密碼/.test(it.tags || '');
        el.innerHTML = `<header class="top"><div><h1>${esc(it.name)}</h1><p>${it.groupName ? `<span class="cat-crumb">${esc(it.groupName)}</span>` : ''}${esc(it.desc || '')}${it.tags ? ` ${it.tags}` : ''}</p></div>
            ${canShare ? `<div class="share-box"><button type="button" class="share-btn">${SHARE_ICON}分享</button><span class="share-msg" role="status"></span></div>` : ''}</header>
          <div class="cat-body"></div>`;
        if (canShare) el.querySelector('.share-btn').onclick = () => share(`${base}/${encodeURIComponent(it.key)}`, it, el.querySelector('.share-msg'));
        const label = [it.groupName, it.name].filter(Boolean);
        view(...label);
        const body = el.querySelector('.cat-body');
        Promise.resolve(it.run(body, { alive: ctx.alive, view: (...more) => view(...label, ...more) })).then(() => { if (ctx.alive()) hoistConclusion(body); });
      },
    });
  }
  /* ---------- 分享研究報告：產生專屬連結(api/share)，打開的人要登入 Google 才看得到；後台記錄誰分享、誰看了 ----------
     手機用系統的分享選單(LINE、FB…)，電腦複製連結 */
  const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  async function share(path, it, msg) {
    const say = t => { msg.textContent = t; clearTimeout(msg._t); msg._t = setTimeout(() => { msg.textContent = ''; }, 4000); };
    let url;
    try {
      const r = await fetch('api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, title: it.name }) });
      if (!r.ok) throw new Error(r.status);
      url = (await r.json()).url;
    } catch (e) { say('無法產生分享連結，請稍後再試'); return; }
    const title = `${it.name} · Little Trader`, text = it.summary || it.desc || '';
    if (navigator.share && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); say('已複製分享連結，對方登入 Google 後就能看'); }
    catch (e) { window.prompt('複製這個分享連結：', url); }
  }
  // 研究報告的「一句話結論」(報告開頭的 > 引言)：報告放在頁面下方時，搬到內容最上方，一打開就看得到
  function hoistConclusion(body) {
    const q = body.querySelector('.panel .doc > blockquote:first-child');
    if (!q || q.closest('.panel') === body.firstElementChild) return;
    const box = document.createElement('div');
    box.className = 'doc lt-hero';
    box.appendChild(q);
    body.prepend(box);
  }
  function listPages() { return pages.slice(); }

  function parseHash() {
    const [section, key] = path();
    return { section, key };
  }

  /* ---------- 麵包屑：首頁 › 區塊 › (小組) › 頁面 › 單一內容，每一層都能點(小組沒有自己的頁面，只顯示文字) ----------
     換頁時自動產生到「頁面」這層；更深的一層(目錄頁的單一內容、股票查詢的代號、統計學的章)由頁面呼叫
     LT.crumbs('名稱') 或 LT.crumbs(['名稱', '網址'], '最後一層') 補上 */
  let crumbExtra = [];
  function renderCrumbs(page, sec) {
    const el = document.getElementById('crumbs');
    if (!el) return;
    sec = sec || (page && SECTIONS.find(s => s.key === page.section));
    if (!sec) { el.innerHTML = ''; el.hidden = true; return; }
    const first = pages.find(p => p.section === sec.key && !p.hidden && !p.href);
    const items = [['首頁', './'], [sec.name, first && !locked(sec.key) ? `${sec.key}/${first.key}` : sec.key]];
    if (page) {
      if (page.group) items.push([page.group]);
      items.push([page.name, `${page.section}/${page.key}`]);
    }
    items.push(...crumbExtra);
    const last = items.length - 1;
    el.innerHTML = items.map(([n, h], i) => i < last && h ? `<a href="${h}">${esc(n)}</a>` : `<span${i === last ? ' aria-current="page"' : ''}>${esc(n)}</span>`).join('<i aria-hidden="true">›</i>');
    el.hidden = false;
  }
  function crumbs(...extra) {
    crumbExtra = extra.filter(Boolean).map(c => [].concat(c));
    renderCrumbs(current);
  }

  /* ---------- 頁面裡的分頁(一排 .mode-tab 按鈕) ----------
       const tabs = LT.tabs({ items: [{ key, name, desc }], active, remember: 'lt.optTab', cls: 'mk-tabs', view: ctx.view, onChange: key => … });
       模板裡放 ${tabs.html}，放進畫面後呼叫 tabs.bind(el)：綁定點擊、套用目前的分頁並呼叫一次 onChange；程式裡切換用 tabs.set(key, { scroll: true })
     active：預設分頁；remember：localStorage 的鍵，記住上次看的分頁；view：記到後台熱門主題的函式(預設 LT.view，目錄頁裡傳 ctx.view)
     後台的熱門主題記的是分頁名稱 name，所以頁面註冊時 topics 也要用同樣的名稱 */
  let tabSeq = 0;
  function tabs(o) {
    const id = 'lt-tabs-' + (++tabSeq), items = o.items;
    let active = o.active, box = null;
    if (o.remember) try { const v = localStorage.getItem(o.remember); if (items.some(t => t.key === v)) active = v; } catch (e) {}
    if (!items.some(t => t.key === active)) active = items[0].key;
    const html = `<div class="mode-tabs ${o.cls || ''}" role="tablist" data-tabs="${id}">${items.map(t =>
      `<button type="button" class="mode-tab" role="tab" data-tab="${esc(t.key)}"><b>${esc(t.name)}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ''}</button>`).join('')}</div>`;
    function set(key, opt = {}) {
      const t = items.find(x => x.key === key);
      if (!t) return;
      active = key;
      if (o.remember) try { localStorage.setItem(o.remember, key); } catch (e) {}
      if (box) box.querySelectorAll('.mode-tab').forEach(b => { const on = b.dataset.tab === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
      (o.view || view)(t.name);
      if (o.onChange) o.onChange(key, t);
      if (opt.scroll && box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function bind(root) {
      box = root.querySelector(`[data-tabs="${id}"]`);
      box.onclick = e => { const b = e.target.closest('[data-tab]'); if (b) set(b.dataset.tab); };
      set(active);
    }
    return { html, set, bind, get active() { return active; } };
  }

  // 側欄各區塊可展開/收合；目前所在的區塊一定展開，其餘記住使用者的選擇
  let openSections = new Set();
  try { openSections = new Set(JSON.parse(localStorage.getItem('lt.openSections') || '[]')); } catch (e) {}
  function saveOpenSections() {
    try { localStorage.setItem('lt.openSections', JSON.stringify([...openSections])); } catch (e) {}
  }
  function toggleSection(key) {
    if (openSections.has(key)) openSections.delete(key); else openSections.add(key);
    saveOpenSections();
    renderSidebar(current || { section: parseHash().section });
  }

  function renderSidebar(active) {
    const nav = document.getElementById('sideNav');
    nav.innerHTML = SECTIONS.map(sec => {
      const list = pages.filter(p => p.section === sec.key && !p.hidden);
      const isActive = p => active && active.section === sec.key && active.key === p.key;
      const link = p => p.href
        ? `<a href="${p.href}" target="_blank" rel="noopener" class="side-link ext" title="在新分頁開啟外部網站">${p.name}<span class="ext-ico">↗</span></a>`
        : `<a href="${sec.key}/${p.key}" class="side-link ${isActive(p) ? 'active' : ''}">${p.name}${p.mount ? '' : '<span class="soon-tag">建置中</span>'}</a>`;
      const items = locked(sec.key)
        ? `<a href="${sec.key}" class="side-link soon ${active && active.section === sec.key ? 'active' : ''}">🔒 登入 Google 看更多</a>`
        : list.length
        ? groupPages(list).map(([g, ps]) => (g ? `<div class="side-sub">${g}</div>` : '') + ps.map(link).join('')).join('')
        : `<a href="${sec.key}" class="side-link soon ${active && active.section === sec.key && !active.key ? 'active' : ''}">建置中</a>`;
      const here = active && active.section === sec.key;
      const open = here || openSections.has(sec.key);
      return `<div class="side-group ${open ? 'open' : ''} ${here ? 'here' : ''}" data-sec="${sec.key}">
        <button class="side-title" onclick="LT.toggleSection('${sec.key}')" aria-expanded="${open}">
          <span>${sec.name}</span><span class="side-count">${locked(sec.key) ? '🔒' : list.length || ''}</span><span class="side-chev">▸</span>
        </button>
        <div class="side-items">${items}</div>
      </div>`;
    }).join('');
  }
  // 依 group 分組(保留註冊順序)：[[組名或 '', [頁面…]], …]
  function groupPages(list) {
    const out = [];
    list.forEach(p => {
      const g = p.group || '', last = out[out.length - 1];
      if (last && last[0] === g) last[1].push(p); else out.push([g, [p]]);
    });
    return out;
  }
  // 建置中頁面：只顯示「努力建置中」(desc 留在程式裡當作規劃備忘，不顯示)
  const UNDER_CONSTRUCTION = '<div class="panel"><div class="empty"><p>努力建置中</p></div></div>';
  function mountPlaceholder(page, el) { el.innerHTML = UNDER_CONSTRUCTION; }
  function route() {
    let { section, key } = parseHash();
    if (!section && home) { showHome(); return; }
    const internal = pages.filter(p => !p.href);
    let page = internal.find(p => p.section === section && p.key === key);
    const sec = SECTIONS.find(s => s.key === section);
    if (sec && locked(sec.key)) page = null;                                     // 訪客：會員區塊顯示登入提示
    else if (!page && sec) page = internal.find(p => p.section === section && !p.hidden) || null; // 區塊預設第一頁
    if (!page && !sec) page = internal[0];                                        // 網站預設首頁
    if (current && current.unmount) { try { current.unmount(); } catch (e) {} }
    clearTimeout(viewTimer); lastView = ''; crumbExtra = [];
    const main = document.getElementById('content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    document.documentElement.dataset.sec = (page || sec).section || sec.key;   // 區塊主題色與頁首圖樣(components.css「區塊主題」)
    document.documentElement.dataset.page = page ? page.key : '';               // 個別頁面的圖樣(例如財報的行事曆)
    if (page) {
      current = page;
      if (!openSections.has(page.section)) { openSections.add(page.section); saveOpenSections(); }
      renderSidebar(page);
      renderCrumbs(page);
      document.title = `${page.name} · Little Trader`;
      const seq = ++routeSeq;
      if (page.mount) page.mount(main, { alive: () => seq === routeSeq });
      else mountPlaceholder(page, main);
      if (!page.hidden) track(page.section, page.key, page.name, false);
      restoreScroll(seq);
    } else {
      current = null;
      routeSeq++;
      renderSidebar({ section: sec.key });
      renderCrumbs(null, sec);
      document.title = `${sec.name} · Little Trader`;
      main.innerHTML = locked(sec.key) ? lockedPanel(sec) : UNDER_CONSTRUCTION;
      track(sec.key, '', sec.name, locked(sec.key));
    }
    document.body.classList.remove('nav-open');
  }

  function showHome() {
    if (current && current.unmount) { try { current.unmount(); } catch (e) {} }
    current = null;
    const seq = ++routeSeq;
    const main = document.getElementById('content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    renderSidebar(null);
    renderCrumbs(null);
    document.documentElement.dataset.sec = 'home';
    document.documentElement.dataset.page = '';
    document.title = 'Little Trader 小交易員的研究室';
    home.mount(main, { alive: () => seq === routeSeq });
    track('home', '', '首頁', false);
    document.body.classList.remove('nav-open');
  }

  /* ---------- 資料集 ----------
     每個資料集放在 data/<名稱>/，一定有 meta.json(更新時間、資料來源、排程、version；網頁只用 version 更新快取，不顯示)。
     各區塊各自載入自己的資料集，互不影響。 */
  const metaCache = {};
  function dataset(name) {
    if (!metaCache[name]) {
      metaCache[name] = fetch(`data/${name}/meta.json`, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`${name} 資料尚未產生(HTTP ${r.status})`);
        return r.json();
      });
      metaCache[name].catch(() => delete metaCache[name]); // 失敗時下次重試
    }
    return metaCache[name];
  }
  // 資料檔網址：帶 version，資料更新前瀏覽器可直接用快取
  function dataUrl(name, file, meta) {
    return `data/${name}/${file}${meta && meta.version ? '?v=' + meta.version : ''}`;
  }
  async function loadJSON(name, file) {
    const meta = await dataset(name);
    const r = await fetch(dataUrl(name, file, meta));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { meta, data: await r.json() };
  }
  // 網頁不顯示資料來源與更新排程(meta.json 仍保留，用 version 更新快取)；舊頁面呼叫的 LT.sourceLine 一律回傳空字串
  function sourceLine() { return ''; }

  // 暗色 / 淺色模式(記住使用者偏好；預設暗色)
  function theme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
  function toggleTheme() {
    const next = theme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('lt.theme', next); } catch (e) {}
    syncThemeButton();
    window.dispatchEvent(new Event('resize')); // 圖表依新配色重畫
  }
  function syncThemeButton() {
    const light = theme() === 'light';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.innerHTML = light ? '☾<span>暗色</span>' : '☀<span>淺色</span>';
      btn.title = light ? '切換為暗色模式' : '切換為淺色模式';
      btn.setAttribute('aria-label', btn.title);
    });
  }
  // 讀取目前主題的 CSS 色彩變數(供 canvas 圖表使用)
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // 桌機版側欄收合(記住使用者偏好)
  function toggleSidebar() {
    const root = document.documentElement;
    const collapsed = root.classList.toggle('side-collapsed');
    try { localStorage.setItem('lt.sideCollapsed', collapsed ? '1' : '0'); } catch (e) {}
    syncCollapseButton();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 230); // 讓圖表依新寬度重畫
  }
  function syncCollapseButton() {
    const btn = document.getElementById('sideCollapse');
    const collapsed = document.documentElement.classList.contains('side-collapsed');
    btn.textContent = collapsed ? '»' : '«';
    btn.title = collapsed ? '展開側欄' : '收起側欄';
    btn.setAttribute('aria-label', btn.title);
  }

  // 右下角「回到頂部 / 底部」按鈕：頁面夠長才出現，已在頂部(底部)時隱藏對應的按鈕
  function initScrollButtons() {
    const box = document.createElement('div');
    box.className = 'scroll-btns';
    box.innerHTML = `<button type="button" data-to="top" title="回到頂部" aria-label="回到頂部">↑</button><button type="button" data-to="bottom" title="回到底部" aria-label="回到底部">↓</button>`;
    document.body.appendChild(box);
    const [up, down] = box.querySelectorAll('button');
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      window.scrollTo({ top: b.dataset.to === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
    };
    let ticking = false;
    const sync = () => {
      ticking = false;
      const doc = document.documentElement, y = window.scrollY, max = doc.scrollHeight - window.innerHeight;
      up.classList.toggle('show', max > 200 && y > 200);
      down.classList.toggle('show', max > 200 && y < max - 200);
    };
    const later = () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } };
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    new ResizeObserver(later).observe(document.body);   // 頁面內容載入、展開時重新判斷
    sync();
  }

  /* Markdown 轉出來的表格(統計學教材、研究報告)：包進 .tablewrap(放不下就左右捲動)，加上 stattable、md-table 樣式；
     短的格子(看得到的字 ≤ 12 個，名稱、日期、數字、短公式)標 nw 不換行；長的格子內容包一層 .cellw，至少 8 個字寬才換行
     (表格格子的 min-width 瀏覽器不理會，要放在格子裡的區塊上)，手機上就不會幾個字就換行或擠成直排。
     字數只算畫面上看得到的部分：不算 KaTeX 給螢幕閱讀器的 MathML、零寬字元與空白 */
  function mdTables(box) {
    box.querySelectorAll('table').forEach(t => {
      t.classList.add('stattable', 'md-table');
      t.querySelectorAll('td').forEach(td => {
        const c = td.cloneNode(true);
        c.querySelectorAll('.katex-mathml').forEach(m => m.remove());
        if (c.textContent.replace(/[\s​]/g, '').length <= 12) td.classList.add('nw');
        else td.innerHTML = `<div class="cellw">${td.innerHTML}</div>`;
      });
      t.outerHTML = `<div class="tablewrap">${t.outerHTML}</div>`;
    });
  }

  function start() {
    document.getElementById('copyYear').textContent = new Date().getFullYear();
    initScrollButtons();
    document.getElementById('navToggle').onclick = () => document.body.classList.toggle('nav-open');
    // 手機選單打開時，點選單以外的地方(半透明遮罩)或按 Esc 就收回
    document.addEventListener('click', e => {
      if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar, #navToggle, #topSearch')) document.body.classList.remove('nav-open');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
    document.getElementById('sideCollapse').onclick = toggleSidebar;
    initSearch();
    document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = toggleTheme);
    syncCollapseButton();
    syncThemeButton();
    // 先確認身分(會員才載入會員區塊的程式)，再顯示頁面
    LTAuth.load().then(me => { auth = me; return loadScripts(me.scripts || []); }).then(() => {
      renderAccount();
      if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(2) || './');   // 舊網址 #/…
      window.addEventListener('popstate', route);
      window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) go(location.hash, { replace: true }); });
      route();
      welcome();
    });
  }

  return { get auth() { return auth; }, locked, loginButton, stockLink, goBack, view, catalog, path, go, crumbs, tabs, UNDER_CONSTRUCTION, register, setHome, listPages, start, toggleSection, toggleTheme, theme, cssVar, SECTIONS, groupPages, dataset, dataUrl, loadJSON, sourceLine, mdTables };
})();
