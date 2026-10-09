/* ==========================================================================
   Little Trader 網站框架：區塊(側欄)註冊、頁面路由
   新增研究內容：在 modules/<區塊>/ 新增 JS，呼叫 LT.register({...})(外部連結用 href)，
   再到 index.html 加上 <script src="modules/..."></script> 即可。詳見 README.md
   ========================================================================== */
const LT = (() => {
  // 側欄區塊；新增區塊直接在這裡加一筆
  const SECTIONS = [
    { key: 'index', name: '指數' },
    { key: 'etf', name: 'ETF' },
    { key: 'stock', name: '個股' },
    { key: 'stats', name: '統計學' },
    { key: 'other', name: '其他' },
  ];
  const pages = []; // {section, key, name, mount(container), unmount?()} 或外部連結 {section, key, name, href}
  let current = null;
  let routeSeq = 0; // 換頁計數：非同步載入完成時用來確認使用者還在同一頁

  function register(page) {
    if (!SECTIONS.find(s => s.key === page.section)) {
      console.error('未知區塊：' + page.section); return;
    }
    pages.push(page);
  }

  function parseHash() {
    const [section, key] = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { section, key };
  }

  function renderSidebar(active) {
    const nav = document.getElementById('sideNav');
    nav.innerHTML = SECTIONS.map(sec => {
      const list = pages.filter(p => p.section === sec.key);
      const items = list.length
        ? list.map(p => p.href
            ? `<a href="${p.href}" target="_blank" rel="noopener" class="side-link ext" title="在新分頁開啟外部網站">${p.name}<span class="ext-ico">↗</span></a>`
            : `<a href="#/${sec.key}/${p.key}" class="side-link ${active && active.section === sec.key && active.key === p.key ? 'active' : ''}">${p.name}</a>`).join('')
        : `<a href="#/${sec.key}" class="side-link soon ${active && active.section === sec.key && !active.key ? 'active' : ''}">建置中</a>`;
      return `<div class="side-group"><div class="side-title">${sec.name}</div>${items}</div>`;
    }).join('');
  }

  function route() {
    let { section, key } = parseHash();
    const internal = pages.filter(p => !p.href);
    let page = internal.find(p => p.section === section && p.key === key);
    const sec = SECTIONS.find(s => s.key === section);
    if (!page && sec) page = internal.find(p => p.section === section) || null; // 區塊預設第一頁
    if (!page && !sec) page = internal[0];                                        // 網站預設首頁
    if (current && current.unmount) { try { current.unmount(); } catch (e) {} }
    const main = document.getElementById('content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    if (page) {
      current = page;
      renderSidebar(page);
      document.title = `${page.name} · Little Trader`;
      const seq = ++routeSeq;
      page.mount(main, { alive: () => seq === routeSeq });
    } else {
      current = null;
      routeSeq++;
      renderSidebar({ section: sec.key });
      document.title = `${sec.name} · Little Trader`;
      main.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">${sec.name}</h3><p>此區塊研究內容建置中，敬請期待。</p></div></div>`;
    }
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
    const meta = await dataset(name);
    const r = await fetch(dataUrl(name, file, meta));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { meta, data: await r.json() };
  }
  // 頁面上方的「資料來源 · 更新時間 · 排程」
  function sourceLine(meta) {
    if (!meta) return '';
    const src = meta.source || {};
    const link = src.url ? `<a href="${src.url}" target="_blank" rel="noopener">${src.name || src.url}</a>` : (src.name || '');
    return `<div class="updated">資料來源：${link} · 更新：${meta.updated_at} (台北時間)${meta.schedule ? ' · 排程：' + meta.schedule : ''}</div>`;
  }

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

  function start() {
    document.getElementById('copyYear').textContent = new Date().getFullYear();
    document.getElementById('navToggle').onclick = () => document.body.classList.toggle('nav-open');
    document.getElementById('sideCollapse').onclick = toggleSidebar;
    syncCollapseButton();
    window.addEventListener('hashchange', route);
    route();
  }

  return { register, start, SECTIONS, dataset, dataUrl, loadJSON, sourceLine };
})();
