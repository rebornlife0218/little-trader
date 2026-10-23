/* ==========================================================================
   Little Trader 網站框架：區塊(側欄)註冊、頁面路由
   新增研究內容：在 modules/<區塊>/ 新增 JS，呼叫 LT.register({...})(外部連結用 href)，
   再到 index.html 加上 <script src="modules/..."></script> 即可。詳見 docs/ARCHITECTURE.md
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
  // 資料集(= pipeline/<key>/、data 分支的 <key>/)；新增資料集在這裡加一筆，首頁會顯示更新狀態
  const DATASETS = [
    { key: 'indices', name: '指數' },
    { key: 'etf_upcoming', name: '即將發行ETF' },
    { key: 'etf_compare', name: '0050 vs 勞退基金' },
    { key: 'options', name: '選擇權與台指期' },
    { key: 'earnings', name: '美股財報' },
    { key: 'sp500', name: 'S&P500 策略回測' },
    { key: 'disposition', name: '台股處置股' },
    { key: 'tw_strategy', name: '台股策略回測' },
    { key: 'tw_research', name: '台股其他研究' },
    { key: 'etf_research', name: 'ETF研究' },
  ];
  // 頁面三種：一般 {section,key,name,mount(el,ctx),unmount?} / 外部連結 {…,href} / 建置中 {…,desc}(沒有 mount)
  // 加上 group(例如 '台股')，側欄與首頁會在區塊內再分小組，同組頁面請連續註冊
  const pages = [];
  let home = null; // 首頁 {name, mount}，由 modules/home/home.js 設定
  let current = null;
  let routeSeq = 0; // 換頁計數：非同步載入完成時用來確認使用者還在同一頁

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
    if (!auth.api) return `<a class="login-btn" href="${LTAuth.MAIN_SITE}${location.hash}">到主站登入 ↗</a>`;
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
         ${auth.admin ? '<a class="acct-link" href="#/other/admin">後台</a>' : ''}<button type="button" class="acct-link" onclick="LTAuth.logout()">登出</button>`
      : `<div class="acct-who mute">訪客</div>${loginButton('Google 登入')}${LTAuth.error ? `<div class="acct-err">${esc(LTAuth.error)}</div>` : ''}`;
  }
  /* ---------- 股票代號連結：點了跳到股票查詢並直接查這一檔，查詢頁有按鈕可以跳回來 ----------
     頁面裡用 LT.stockLink(代號, 顯示文字) 產生連結(#/stock/query/<代號>)；點的時候記住原本的頁面與捲動位置，
     按「返回」回到原本的頁面後，等內容載入再捲回原本的位置 */
  function stockLink(code, text) {
    return `<a href="#/stock/query/${encodeURIComponent(code)}" class="stock-link" title="在股票查詢看 ${esc(code)}">${esc(text ?? code)}</a>`;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.stock-link');
    if (!a || !current) return;
    try { sessionStorage.setItem('lt.query.back', JSON.stringify({ hash: location.hash || '#/', name: current.name, y: window.scrollY })); } catch (er) {}
  }, true);
  function goBack(back) {
    try { sessionStorage.setItem('lt.restoreY', JSON.stringify(back)); sessionStorage.removeItem('lt.query.back'); } catch (e) {}
    location.hash = back.hash;
  }
  // 從股票查詢返回時捲回原本的位置：頁面內容是非同步載入的，等頁面夠高再捲(最多等 4 秒)
  function restoreScroll(seq) {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem('lt.restoreY') || 'null'); } catch (e) {}
    if (!r || r.hash !== location.hash) return;
    try { sessionStorage.removeItem('lt.restoreY'); } catch (e) {}
    const t0 = Date.now();
    (function tryScroll() {
      if (seq !== routeSeq) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= r.y || Date.now() - t0 > 4000) window.scrollTo(0, r.y);
      else setTimeout(tryScroll, 150);
    })();
  }
  // 瀏覽紀錄：每次換頁送一筆到 api/track(後台的「最受歡迎的主題」)；備援站沒有後端就不送
  function track(section, page, title, isLocked) {
    if (!auth.api) return;
    try {
      navigator.sendBeacon('api/track', new Blob([JSON.stringify({ section, page, title, locked: !!isLocked })], { type: 'application/json' }));
    } catch (e) {}
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
  function listPages() { return pages.slice(); }

  function parseHash() {
    const [section, key] = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { section, key };
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
        : `<a href="#/${sec.key}/${p.key}" class="side-link ${isActive(p) ? 'active' : ''}">${p.name}${p.mount ? '' : '<span class="soon-tag">建置中</span>'}</a>`;
      const items = locked(sec.key)
        ? `<a href="#/${sec.key}" class="side-link soon ${active && active.section === sec.key ? 'active' : ''}">🔒 登入 Google 看更多</a>`
        : list.length
        ? groupPages(list).map(([g, ps]) => (g ? `<div class="side-sub">${g}</div>` : '') + ps.map(link).join('')).join('')
        : `<a href="#/${sec.key}" class="side-link soon ${active && active.section === sec.key && !active.key ? 'active' : ''}">建置中</a>`;
      const here = active && active.section === sec.key;
      const open = here || openSections.has(sec.key);
      return `<div class="side-group ${open ? 'open' : ''} ${here ? 'here' : ''}">
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
    const main = document.getElementById('content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    clearSources();
    if (page) {
      current = page;
      if (!openSections.has(page.section)) { openSections.add(page.section); saveOpenSections(); }
      renderSidebar(page);
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
    document.title = 'Little Trader 小交易員的研究室';
    clearSources();
    home.mount(main, { alive: () => seq === routeSeq });
    track('home', '', '首頁', false);
    // 首頁頁尾列出所有資料集的更新狀態
    DATASETS.forEach(d => dataset(d.key).then(m => { if (seq === routeSeq) addSource(m, d.name); }).catch(() => {}));
    document.body.classList.remove('nav-open');
  }

  /* ---------- 資料集 ----------
     每個資料集放在 data/<名稱>/，一定有 meta.json(更新時間、資料來源、排程、version)。
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
    const seq = routeSeq;
    const meta = await dataset(name);
    const r = await fetch(dataUrl(name, file, meta));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (seq === routeSeq) addSource(meta);   // 這一頁用到的資料集，自動列在頁尾
    return { meta, data: await r.json() };
  }
  /* ---------- 頁尾的「資料來源 · 更新時間 · 排程」 ----------
     每頁載入的資料集會自動列在 COPYRIGHT 下方(loadJSON 時加入，換頁時清空)；首頁列出全部資料集。 */
  let sources = new Map();
  function clearSources() { sources = new Map(); renderSources(); }
  function addSource(meta, label) {
    if (!meta) return;
    const key = meta.dataset || (meta.source || {}).name || meta.updated_at;
    sources.set(key, { meta, label: label || (DATASETS.find(d => d.key === meta.dataset) || {}).name || '' });
    renderSources();
  }
  function renderSources() {
    const el = document.getElementById('pageSources');
    if (!el) return;
    el.innerHTML = [...sources.values()].map(({ meta, label }) => {
      const src = meta.source || {};
      const link = src.url ? `<a href="${src.url}" target="_blank" rel="noopener">${src.name || src.url}</a>` : (src.name || '');
      return `<div>${label ? `<b>${label}</b> · ` : ''}資料來源：${link} · 更新：${meta.updated_at}(台北時間)${meta.schedule ? ' · 排程：' + meta.schedule : ''}</div>`;
    }).join('');
  }
  // 舊介面：頁面呼叫 LT.sourceLine(meta) 時改為登記到頁尾，頁面上方不再顯示
  function sourceLine(meta) { addSource(meta); return ''; }

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

  function start() {
    document.getElementById('copyYear').textContent = new Date().getFullYear();
    initScrollButtons();
    document.getElementById('navToggle').onclick = () => document.body.classList.toggle('nav-open');
    document.getElementById('sideCollapse').onclick = toggleSidebar;
    document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = toggleTheme);
    syncCollapseButton();
    syncThemeButton();
    // 先確認身分(會員才載入會員區塊的程式)，再顯示頁面
    LTAuth.load().then(me => { auth = me; return loadScripts(me.scripts || []); }).then(() => {
      renderAccount();
      window.addEventListener('hashchange', route);
      route();
      welcome();
    });
  }

  return { get auth() { return auth; }, locked, loginButton, stockLink, goBack, UNDER_CONSTRUCTION, register, setHome, listPages, start, toggleSection, toggleTheme, theme, cssVar, SECTIONS, DATASETS, groupPages, dataset, dataUrl, loadJSON, sourceLine };
})();
