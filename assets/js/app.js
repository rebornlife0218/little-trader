/* ==========================================================================
   Little Trader 網站框架：區塊(側欄)註冊、頁面路由
   新增研究內容：在 modules/<區塊>/ 新增 JS，呼叫 LT.register({...})，
   再到 index.html 加上 <script src="modules/..."></script> 即可。詳見 README.md
   ========================================================================== */
const LT = (() => {
  // 側欄區塊；新增區塊直接在這裡加一筆
  const SECTIONS = [
    { key: 'index', name: '指數' },
    { key: 'stock', name: '個股' },
    { key: 'stats', name: '統計學' },
    { key: 'other', name: '其他' },
  ];
  const pages = []; // {section, key, name, mount(container), unmount?()}
  let current = null;

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
        ? list.map(p => `<a href="#/${sec.key}/${p.key}" class="side-link ${active && active.section === sec.key && active.key === p.key ? 'active' : ''}">${p.name}</a>`).join('')
        : `<a href="#/${sec.key}" class="side-link soon ${active && active.section === sec.key && !active.key ? 'active' : ''}">建置中</a>`;
      return `<div class="side-group"><div class="side-title">${sec.name}</div>${items}</div>`;
    }).join('');
  }

  function route() {
    let { section, key } = parseHash();
    let page = pages.find(p => p.section === section && p.key === key);
    const sec = SECTIONS.find(s => s.key === section);
    if (!page && sec) page = pages.find(p => p.section === section) || null; // 區塊預設第一頁
    if (!page && !sec) page = pages[0];                                        // 網站預設首頁
    if (current && current.unmount) { try { current.unmount(); } catch (e) {} }
    const main = document.getElementById('content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    if (page) {
      current = page;
      renderSidebar(page);
      document.title = `${page.name} · Little Trader`;
      page.mount(main);
    } else {
      current = null;
      renderSidebar({ section: sec.key });
      document.title = `${sec.name} · Little Trader`;
      main.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">${sec.name}</h3><p>此區塊研究內容建置中，敬請期待。</p></div></div>`;
    }
    document.body.classList.remove('nav-open');
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

  return { register, start, SECTIONS };
})();
