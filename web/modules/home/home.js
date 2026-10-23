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
          <ul class="hero-intro">
            <li>👀 用法人的眼睛看市場，用白話的語言聊發現。</li>
            <li>🚫 沒有明牌！只聊市場上發現的酷東西。</li>
            <li>🤝 交易是場大人的遊戲，一個人走得快，一群人走得遠。</li>
            <li>💡 相信最厲害的洞見，常常藏在最意想不到的角落。</li>
            <li>✉️ 有酷酷的想法或新發現？歡迎寄信交流：<a href="mailto:rebornlife0218@gmail.com">rebornlife0218@gmail.com</a></li>
          </ul>
        </div>
      </section>
      <div class="home-grid">
        ${LT.SECTIONS.map(sec => {
          const list = pages.filter(p => p.section === sec.key && !p.hidden);
          if (LT.locked(sec.key)) return `<div class="panel home-card">
            <h2>${sec.name} <span class="lock-tag">🔒 登入 Google 看更多</span></h2>
            <p class="mute">${sec.desc || ''}</p>
            <div class="home-links home-lock">${LT.loginButton('用 Google 登入')}</div>
          </div>`;
          return `<div class="panel home-card">
            <h2>${sec.name}</h2>
            <p class="mute">${sec.desc || ''}</p>
            <div class="home-links">${LT.groupPages(list).map(([g, ps]) => (g ? `<span class="home-sub">${g}</span>` : '') + ps.map(link).join('')).join('') || '<span class="mute">建置中</span>'}</div>
          </div>`;
        }).join('')}
      </div>`;
  },
});
