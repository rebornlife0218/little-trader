/* 其他區塊
   · 好用推薦：外部網站連結與簡介；新增推薦只要在 RECOMMENDS 加一筆 */
(() => {
  const RECOMMENDS = [
    { name: 'todayAI', tag: 'AI 新聞', url: 'https://today-ai.com/',
      desc: '以 AI 分析與整理新聞內容的平台，快速掌握市場消息重點，省下逐篇閱讀的時間。' },
    { name: 'Forex Factory', tag: '經濟日曆', url: 'https://www.forexfactory.com/',
      desc: '外匯交易者愛用的網站，最有名的是「經濟日曆」：各國重要經濟數據的公布時間、重要程度、預期值與實際值一目了然，另有外匯新聞與交易論壇。' },
    { name: 'Capafy', tag: 'AI 工具', url: 'https://capafy.ai/',
      desc: 'AI Agent 技能市場，可找到專家製作的技能並交給 AI 代理執行。有投資研究類技能，例如彙整 X(Twitter)上知名交易者觀點的「Alpha Consensus」。' },
    { name: 'AlphaMemo', tag: '法說會', url: 'https://www.alphamemo.ai/',
      desc: '把台股法說會音檔轉成逐字稿，並用 AI 整理成重點 Memo。公開法說會的 Memo 可免費瀏覽，適合想快速掌握公司展望的投資人與研究員。' },
    { name: '光通訊', sub: 'Trend Core 研究室', tag: '產業研究', url: 'https://gooptions.cc/trend-core-research/',
      desc: '個股深度研究平台，用多空對辯(Bull/Bear)與機率加權目標價分析個股，主題涵蓋光通訊與網路、算力與晶片、電力與能源等，追蹤美股與台股供應鏈。' },
  ];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  LT.register({
    section: 'other', key: 'recommend', name: '好用推薦',
    mount(el) {
      el.innerHTML = `
        <header class="top"><div>
          <h1>好用推薦</h1>
          <p>研究與交易時常用的網站，點卡片在新分頁開啟</p>
        </div></header>
        <div class="reco-grid">
          ${RECOMMENDS.map(r => `
            <a class="reco" href="${esc(r.url)}" target="_blank" rel="noopener">
              <div class="reco-head">
                <div><b>${esc(r.name)}</b>${r.sub ? `<span class="reco-sub">${esc(r.sub)}</span>` : ''}</div>
                <span class="tag na">${esc(r.tag)}</span>
              </div>
              <p>${esc(r.desc)}</p>
              <div class="reco-foot"><span>${esc(host(r.url))}</span><span class="go">前往 ↗</span></div>
            </a>`).join('')}
        </div>
        <div class="note">以上為外部網站，內容與服務條款以各網站為準；部分功能可能需要註冊或付費。</div>`;
    },
  });
})();
