/* 首頁：網站介紹、各區塊入口、各資料集更新狀態(點 LOGO 回到這裡) */
LT.setHome({
  name: '首頁',
  async mount(el, ctx) {
    const pages = LT.listPages();
    const intro = {
      index: '全球主要指數的急跌反彈與K棒型態統計',
      etf: 'ETF 折溢價與即將發行的新 ETF',
      stock: '處置股、隔日沖等個股主題研究',
      stats: '統計學與計量方法的學習資源',
      other: '研究與交易時常用的網站推薦',
    };
    const link = p => p.href
      ? `<a href="${p.href}" target="_blank" rel="noopener">${p.name} ↗</a>`
      : `<a href="#/${p.section}/${p.key}">${p.name}${p.mount ? '' : ' <span class="soon-tag">建置中</span>'}</a>`;
    el.innerHTML = `
      <section class="hero">
        <img src="assets/img/logo.svg" alt="" class="hero-logo">
        <div>
          <h1>Little <span>Trader</span></h1>
          <p>小交易員的研究室：用資料看市場，把研究整理成一目了然的統計。</p>
        </div>
      </section>
      <div class="home-grid">
        ${LT.SECTIONS.map(sec => {
          const list = pages.filter(p => p.section === sec.key);
          return `<div class="panel home-card">
            <h2>${sec.name}</h2>
            <p class="mute">${intro[sec.key] || ''}</p>
            <div class="home-links">${list.map(link).join('') || '<span class="mute">建置中</span>'}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="panel">
        <h3>資料更新狀態</h3>
        <div id="homeData" class="mute">載入中…</div>
      </div>`;
    const sets = [['indices', '指數'], ['etf_upcoming', '即將發行ETF']];
    const rows = await Promise.all(sets.map(([k, n]) => LT.dataset(k).then(m => ({ n, m })).catch(() => ({ n, m: null }))));
    if (!ctx.alive()) return;
    document.getElementById('homeData').innerHTML = rows.map(({ n, m }) =>
      `<div class="home-data"><b>${n}</b>${m ? LT.sourceLine(m) : '<div class="updated">尚無資料</div>'}</div>`).join('');
  },
});
