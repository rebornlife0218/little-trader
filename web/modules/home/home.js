/* 首頁：網站介紹、各區塊入口(點 LOGO 回到這裡)；各資料集更新狀態列在頁尾(app.js) */
LT.setHome({
  name: '首頁',
  async mount(el, ctx) {
    const pages = LT.listPages();
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
            <p class="mute">${sec.desc || ''}</p>
            <div class="home-links">${LT.groupPages(list).map(([g, ps]) => (g ? `<span class="home-sub">${g}</span>` : '') + ps.map(link).join('')).join('') || '<span class="mute">建置中</span>'}</div>
          </div>`;
        }).join('')}
      </div>`;
  },
});
