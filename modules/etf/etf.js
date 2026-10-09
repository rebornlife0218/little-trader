/* ETF 區塊
   · ETF折溢價：外部連結(臺灣證券交易所 基本市況報導網站)
   · 即將發行ETF：資料集 data/etf_upcoming/(scripts/etf_upcoming/update.py，排程見 .github/workflows/data-etf.yml) */
(() => {
  const DATASET = 'etf_upcoming';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dash = s => s ? esc(s) : '<span class="na">—</span>';

  LT.register({
    section: 'etf', key: 'premium', name: 'ETF折溢價',
    href: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant',
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
