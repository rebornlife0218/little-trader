/* 首頁：網站介紹＋加權指數近 60 日迷你 K 線、近期更新、各區塊入口(依區塊主題色與圖樣)、研究重點(各研究與策略的先講結論)
   K 線資料是公開的 indices 資料集；最新研究取自已載入的目錄頁(LT.catalog)項目的 summary，訪客看不到研究就顯示登入提示 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 自我介紹前的線條小圖示(顏色跟著主題色)
  const ICON = {
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  };
  const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const INTRO = [
    ['eye', '用法人的眼睛看市場，用白話的語言聊發現。'],
    ['ban', '不報明牌，只拆市場的真相。'],
    ['bulb', '相信最厲害的洞見，往往藏在最意想不到的角落。'],
    ['mail', '有酷酷的想法或新發現？歡迎寄信交流：<br><a href="mailto:rebornlife0218@gmail.com">rebornlife0218@gmail.com</a>'],
  ];

  // 近期更新：只列新的研究或策略(CLAUDE.md)，新的放最上面；首頁預設顯示 3 則，展開後最多 10 則
  // href 寫站內相對網址，沒有單一頁面可連的(全站改版)留空
  const NEWS = [
    ['10/31', 'index', '大盤漲跌分析', '「均線的支撐與壓力」改版', '「初次」跌破、突破改用均線天數的一半來判斷，新增 2 日內站回、跌回均線，以及紅K／黑K的 20 日內最大續跌、續漲。', 'index/crash/myth', '看分析'],
    ['10/30', 'stock', '台股研究', '新研究「跳空與隔夜報酬」', '開盤跳空越大，收盤買、隔天賣就越賺嗎？關鍵其實是收盤有沒有鎖漲跌停。', 'stock/tw-research/gap', '看研究'],
    ['10/30', 'stock', '處置股', '新研究「處置期間的 K 棒」', '處置股在處置前後收紅 K 還是黑 K，新制上路前後差很多。', 'stock/disposition/kbar', '看研究'],
    ['10/27', 'etf', 'ETF 研究', '「A 系列 ETF 跟單」報告更新', '新增「跟著 ETF 分批賣」和「一次全賣」的比較，表格改得在手機上也好讀。', 'etf/research/etf_follow', '看報告'],
    ['10/26', 'stock', '台股策略', '新策略「老闆回頭發動了」', '做多策略，附完整回測與最近的進出場明細。', 'stock/tw-strategy/boss', '看策略'],
    ['10/26', 'stock', '台股策略', '新策略「月營收年增率長期以來第一次破 20%」', '營收突然轉強的公司，之後股價怎麼走。', 'stock/tw-strategy/rev20', '看策略'],
  ];
  const NEWS_SHOW = 3, NEWS_MAX = 10;
  function news() {
    const rows = NEWS.slice(0, NEWS_MAX).map(([d, sec, tag, title, text, href, go], i) => {
      const inner = `<time>${esc(d)}</time><span class="news-tag${sec ? '' : ' all'}">${esc(tag)}</span>
        <span class="news-t"><b>${esc(title)}</b><span>${esc(text)}</span></span><span class="news-go">${href ? esc(go) + ' ›' : ''}</span>`;
      return `<li${i >= NEWS_SHOW ? ' class="more"' : ''}${sec ? ` data-sec="${sec}"` : ''}>${href ? `<a href="${href}">${inner}</a>` : `<div class="nolink">${inner}</div>`}</li>`;
    });
    const more = rows.length - NEWS_SHOW;
    return `<section class="home-news">
      <h2 class="home-h2">近期更新</h2>
      <ul class="home-news-list">${rows.join('')}</ul>
      ${more > 0 ? `<button type="button" class="news-toggle" aria-expanded="false" data-more="${more}">看更早的更新(${more})</button>` : ''}
    </section>`;
  }

  // 加權指數近 n 日的迷你 K 線(SVG；紅漲綠跌，顏色用 CSS 變數，主題切換不用重畫)
  function miniK(T, n = 60) {
    const i0 = Math.max(0, T.d.length - n), W = 600, H = 150, pad = 4;
    const rows = T.d.slice(i0).map((d, k) => ({ o: T.o[i0 + k], h: T.h[i0 + k], l: T.l[i0 + k], c: T.c[i0 + k] }));
    const hi = Math.max(...rows.map(r => r.h)), lo = Math.min(...rows.map(r => r.l));
    const y = v => pad + (hi - v) / (hi - lo || 1) * (H - pad * 2), step = W / rows.length, bw = Math.max(2, step * 0.6);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="加權指數近 ${rows.length} 個交易日的 K 線">${rows.map((r, k) => {
      const x = k * step + step / 2, up = r.c >= r.o, col = up ? 'var(--candle-up)' : 'var(--candle-down)';
      const top = y(Math.max(r.o, r.c)), h = Math.max(1, Math.abs(y(r.o) - y(r.c)));
      return `<line x1="${x}" x2="${x}" y1="${y(r.h)}" y2="${y(r.l)}" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke"/><rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${h}" fill="${col}"/>`;
    }).join('')}</svg>`;
  }
  async function market(box, ctx) {
    try {
      const { data: T } = await LT.loadJSON('indices', 'TAIEX.json');
      if (!ctx.alive()) return;
      const n = T.c.length, c = T.c[n - 1], p = T.c[n - 2], ch = c / p - 1;
      box.innerHTML = `
        <div class="home-mkt-h"><b>加權指數 · 近 60 個交易日</b><small>${esc(T.d[n - 1])}</small></div>
        <div class="home-mkt-v"><strong>${Math.round(c).toLocaleString()}</strong>
          <span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${Math.round(c - p).toLocaleString()}(${ch >= 0 ? '+' : ''}${(ch * 100).toFixed(2)}%)</span></div>
        ${miniK(T)}
        <div class="home-mkt-f"><a href="index/crash">看大盤漲跌分析</a></div>`;
    } catch (e) {
      if (ctx.alive()) box.remove();
    }
  }

  // 最新研究：目錄頁裡有先講結論(summary)的項目
  function latest() {
    const items = [];
    LT.listPages().filter(p => p.catalog).forEach(p => p.catalog.groups.forEach(g => g.items.forEach(it => {
      // 不公開(要密碼)的策略不列
      if (it.summary && !it.soon && !/需要密碼/.test(it.tags || '')) items.push({ ...it, href: `${p.section}/${p.key}/${encodeURIComponent(it.key)}`, sec: p.section, page: p.name });
    })));
    return items;
  }

  LT.setHome({
    name: '首頁',
    async mount(el, ctx) {
      const pages = LT.listPages();
      const link = p => p.href
        ? `<a href="${p.href}" target="_blank" rel="noopener">${esc(p.name)} ↗</a>`
        : `<a href="${p.section}/${p.key}">${esc(p.name)}${p.mount ? '' : '<span class="soon-tag">建置中</span>'}</a>`;
      const studies = latest();
      el.innerHTML = `
        <section class="home-hero">
          <div>
            <div class="home-brand"><img src="assets/img/logo.svg" alt="">
              <div><h1>Little <span>Trader</span></h1><p>小交易員的研究室</p></div></div>
            <ul class="home-intro">${INTRO.map(([k, t]) => `<li>${icon(k)}<span>${t}</span></li>`).join('')}</ul>
          </div>
          <div class="home-mkt" id="homeMkt"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>
        </section>

        ${news()}

        <h2 class="home-h2">所有內容</h2>
        <div class="home-secs">
          ${LT.SECTIONS.map(sec => {
            const list = pages.filter(p => p.section === sec.key && !p.hidden);
            const body = LT.locked(sec.key)
              ? `<div class="home-links">${LT.loginButton('登入 Google 看更多')}</div>`
              : `<div class="home-links">${LT.groupPages(list).map(([g, ps]) => (g ? `<span class="home-sub">${esc(g)}</span>` : '') + ps.map(link).join('')).join('') || '<span class="mute">建置中</span>'}</div>`;
            return `<section class="home-sec" data-sec="${sec.key}">
              <h2>${esc(sec.name)}${LT.locked(sec.key) ? ' <span class="lock-tag">🔒 需要登入</span>' : ''}</h2>
              <p>${esc(sec.desc || '')}</p>
              ${body}
            </section>`;
          }).join('')}
        </div>

        <section class="home-latest">
          <h2 class="home-h2">研究重點</h2>
          ${studies.length
            ? `<div class="cat-grid is-list">${studies.map(s => `<a class="cat-row" href="${s.href}" data-sec="${s.sec}"><b>${esc(s.name)}</b><span>${esc(s.summary)}</span><em>${esc(s.page)}</em></a>`).join('')}</div>`
            : `<div class="home-lock"><span>ETF、股票的研究與策略，登入 Google 就能看每份研究的結論。</span>${LT.loginButton('用 Google 登入')}</div>`}
        </section>`;
      const tg = el.querySelector('.news-toggle');
      if (tg) tg.addEventListener('click', () => {
        const open = tg.closest('.home-news').classList.toggle('open');
        tg.setAttribute('aria-expanded', open);
        tg.textContent = open ? '收起' : `看更早的更新(${tg.dataset.more})`;
      });
      market(el.querySelector('#homeMkt'), ctx);
    },
  });
})();
