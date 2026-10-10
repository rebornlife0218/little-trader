/* ETF 區塊
   · ETF折溢價：說明 + 參考連結(臺灣證券交易所 基本市況報導網站)
   · 即將發行ETF：資料集 data/etf_upcoming/(pipeline/etf_upcoming/update.py，排程見 .github/workflows/data-etf_upcoming.yml) */
(() => {
  const DATASET = 'etf_upcoming';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dash = s => s ? esc(s) : '<span class="na">—</span>';

  const PREMIUM_REFS = [
    { name: '臺灣證券交易所 · ETF 盤中預估淨值與折溢價', desc: '各檔國內 ETF 的市價、預估淨值與折溢價率，盤中即時揭露',
      url: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant' },
  ];
  LT.register({
    section: 'etf', key: 'premium', name: 'ETF折溢價',
    mount(el) {
      el.innerHTML = `
        <header class="top"><div>
          <h1>ETF折溢價</h1>
          <p>ETF 市價與淨值的差距</p>
        </div></header>
        <div class="panel">
          <h3>參考連結</h3>
          ${PREMIUM_REFS.map(r => `<a class="linkcard" href="${r.url}" target="_blank" rel="noopener">
            <div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${esc(r.url)}</small></div>
            <span class="go">前往 ↗</span></a>`).join('')}
        </div>
        <div class="panel doc">
          <h3>什麼是折溢價</h3>
          <p>ETF 在交易所買賣的價格(市價)由買賣雙方決定，不一定等於它實際持有資產的價值(淨值)。兩者的差距就是折溢價：</p>
          <div class="formula">折溢價率 ＝ (市價 − 淨值) ÷ 淨值</div>
          <ul>
            <li><b>溢價(正值)</b>：市價高於淨值，買進等於用比實際價值更貴的價格買。熱門 ETF 搶購時容易出現。</li>
            <li><b>折價(負值)</b>：市價低於淨值，賣出等於用比實際價值更便宜的價格賣。市場恐慌或流動性差時容易出現。</li>
          </ul>
          <p>盤中看的是「預估淨值」，由投信依成分股即時報價推算。折溢價過大時，日後價格可能向淨值靠攏，追高溢價的 ETF 要特別留意這個風險。</p>
        </div>`;
    },
  });

  LT.register({
    section: 'etf', key: 'upcoming', name: '即將發行ETF',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入即將發行ETF…</p></div></div>`;
      let meta, data;
      try {
        ({ meta, data } = await LT.loadJSON(DATASET, 'upcoming.json'));
      } catch (err) {
        if (!ctx.alive()) return;
        el.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(err.message)}</p></div></div>`;
        return;
      }
      if (!ctx.alive()) return; // 使用者已切到別頁
      const items = data.items || [];
      const recruiting = items.filter(x => x.period).length;
      el.innerHTML = `
        <header class="top">
          <div>
            <h1>即將發行ETF</h1>
            <p>${esc(data.title || '新基金一覽表')} · 僅列基金名稱含「ETF」者</p>
            ${LT.sourceLine(meta)}
          </div>
        </header>
        <div class="statgrid" style="margin-bottom:16px;">
          <div class="stat"><div class="v">${items.length}</div><div class="l">ETF 檔數</div></div>
          <div class="stat"><div class="v">${recruiting}</div><div class="l">已公布募集期間</div></div>
          <div class="stat"><div class="v">${items.length - recruiting}</div><div class="l">送件申請中／待公布</div></div>
        </div>
        <div class="panel">
          <div class="tablewrap">
            <table class="etftable">
              <thead><tr><th>基金名稱</th><th>經理人</th><th>募集期間</th><th>申請金額</th></tr></thead>
              <tbody>
                ${items.map(x => `<tr>
                  <td class="fund">${esc(x.name)}</td>
                  <td>${dash(x.manager)}</td>
                  <td>${dash(x.period)}</td>
                  <td>${dash(x.amount)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="na">目前沒有即將發行的ETF</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="note">日期為民國年。募集期間空白代表尚在送件申請或尚未公布；申請金額「E」為億元。資料以來源網站為準。</div>
        </div>`;
    },
  });
})();
