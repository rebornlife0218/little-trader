/* ==========================================================================
   Little Trader 網站框架：區塊(側欄)註冊、頁面路由
   新增研究內容：在 modules/<區塊>/ 新增 JS，呼叫 LT.register({...})(外部連結用 href)，
   再到 index.html 加上 <script src="modules/..."></script> 即可。詳見 docs/ARCHITECTURE.md
   ========================================================================== */
const LT = (() => {
  // 側欄區塊(順序即側欄順序)；新增區塊直接在這裡加一筆，desc 顯示在首頁
  const SECTIONS = [
    { key: 'index', name: '指數', desc: '全球主要指數的急跌反彈與K棒型態統計' },
    { key: 'etf', name: 'ETF', desc: 'ETF大禮包(0050 vs 勞退基金、折溢價)與即將發行的新 ETF' },
    { key: 'stock', name: '股票', desc: '台股處置股、隔日沖、波段，美股財報行事曆與策略' },
    { key: 'option', name: '選擇權', desc: '臺指選擇權與台指期：隱含波動率、籌碼、價差與策略損益' },
    { key: 'stats', name: '統計學', desc: '統計學與計量方法的學習資源' },
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
  ];
  // 頁面三種：一般 {section,key,name,mount(el,ctx),unmount?} / 外部連結 {…,href} / 建置中 {…,desc}(沒有 mount)
  // 加上 group(例如 '台股')，側欄與首頁會在區塊內再分小組，同組頁面請連續註冊
  const pages = [];
  let home = null; // 首頁 {name, mount}，由 modules/home/home.js 設定
  let current = null;
  let routeSeq = 0; // 換頁計數：非同步載入完成時用來確認使用者還在同一頁

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
      const list = pages.filter(p => p.section === sec.key);
      const isActive = p => active && active.section === sec.key && active.key === p.key;
      const link = p => p.href
        ? `<a href="${p.href}" target="_blank" rel="noopener" class="side-link ext" title="在新分頁開啟外部網站">${p.name}<span class="ext-ico">↗</span></a>`
        : `<a href="#/${sec.key}/${p.key}" class="side-link ${isActive(p) ? 'active' : ''}">${p.name}${p.mount ? '' : '<span class="soon-tag">建置中</span>'}</a>`;
      const items = list.length
        ? groupPages(list).map(([g, ps]) => (g ? `<div class="side-sub">${g}</div>` : '') + ps.map(link).join('')).join('')
        : `<a href="#/${sec.key}" class="side-link soon ${active && active.section === sec.key && !active.key ? 'active' : ''}">建置中</a>`;
      const here = active && active.section === sec.key;
      const open = here || openSections.has(sec.key);
      return `<div class="side-group ${open ? 'open' : ''} ${here ? 'here' : ''}">
        <button class="side-title" onclick="LT.toggleSection('${sec.key}')" aria-expanded="${open}">
          <span>${sec.name}</span><span class="side-count">${list.length || ''}</span><span class="side-chev">▸</span>
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
  // 建置中頁面
  function mountPlaceholder(page, el) {
    el.innerHTML = `<div class="panel"><div class="empty">
      <h3 style="margin:0;">${page.name}</h3>
      ${page.desc ? `<p>${page.desc}</p>` : ''}
      <p class="mute">此研究內容建置中，敬請期待。</p>
    </div></div>`;
  }
  function route() {
    let { section, key } = parseHash();
    if (!section && home) { showHome(); return; }
    const internal = pages.filter(p => !p.href);
    let page = internal.find(p => p.section === section && p.key === key);
    const sec = SECTIONS.find(s => s.key === section);
    if (!page && sec) page = internal.find(p => p.section === section) || null; // 區塊預設第一頁
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
    } else {
      current = null;
      routeSeq++;
      renderSidebar({ section: sec.key });
      document.title = `${sec.name} · Little Trader`;
      main.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">${sec.name}</h3><p>此區塊研究內容建置中，敬請期待。</p></div></div>`;
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
    window.addEventListener('hashchange', route);
    route();
  }

  return { register, setHome, listPages, start, toggleSection, toggleTheme, theme, cssVar, SECTIONS, DATASETS, groupPages, dataset, dataUrl, loadJSON, sourceLine };
})();
