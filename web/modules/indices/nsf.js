/* ==========================================================================
   大盤漲跌分析 › 國安基金進場與限空令(網址 index/crash/nsf；卡片在 render.js 的 LT.catalog)
   資料集 index_research 的 nsf.json(pipeline/index_research/update.py)：歷次決議前的位置、進場後與限空令生效後的漲跌、報告 Markdown；不是回測，沒有淨值
   上半部(精簡版)公開，下半部(完整報告)要登入(LT.loadReport)
   ========================================================================== */
window.LTNSF = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 每次進場一個顏色；這一次(最後一筆)用區塊主題色加粗
  const COLORS = ['#94a3b8', '#B07CF0', 'var(--blue)', '#5fd0c5', '#F06FB0', '#7dd3fc', '#c084fc', '#e2a5f5', '#a5b4fc'];

  // 報告(Markdown)：表格加上站內表格樣式，## → h3、### → h4；圖片 ![說明](xxx.png) 換成依 JSON 畫的圖
  function md(src) {
    const box = document.createElement('div');
    src = src.replace(/^!\[([^\]]*)\]\(([^()\s]+\.png)\)[ \t]*$/gm, (_, cap, f) => `
<figure class="md-fig"><div data-fig="${esc(f)}"></div><figcaption>${esc(cap)}</figcaption></figure>
`);
    box.innerHTML = marked.parse(src);
    LT.mdTables(box);
    const retag = (s, tagName, c) => box.querySelectorAll(s).forEach(h => { const e = document.createElement(tagName); e.className = c; e.innerHTML = h.innerHTML; h.replaceWith(e); });
    retag('h3', 'h4', 'md-h3');
    retag('h2', 'h3', 'md-h2');
    return box.innerHTML;
  }

  // 決議前 120 日到之後 200 日的走勢(決議前收盤 = 100)；types：只畫這些類型；legend：圖例的容器(省略時接在圖的下方)
  function paths(div, B, types, legend) {
    const ps = B.paths.filter(p => types.includes(p.type));
    const last = B.paths[B.paths.length - 1];
    const ss = ps.map(p => ({ name: p.name, y: p.y, color: p === last ? 'var(--sec)' : COLORS[B.paths.indexOf(p) % COLORS.length], width: p === last ? 2.6 : 1.4 }));
    LTChart.line(div, { x: B.x, xType: 'num', height: 320, label: '決議前後的加權指數',
      xLabel: '距離決議前最後一個收盤的交易日', yLabel: '加權指數(決議前收盤 = 100)',
      xFmt: v => (v > 0 ? '+' : '') + v, yFmt: v => Math.round(v) + '',
      tipFmt: (s, v) => v.toFixed(1), refY: [{ y: 100 }], refX: [{ x: 0, label: '決議' }], series: ss });
    if (legend) legend.innerHTML = LTChart.legend(ss);
    else div.insertAdjacentHTML('afterend', LTChart.legend(ss));
  }

  async function run(el, ctx) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B, full;
    try {
      ({ data: B, full } = await LT.loadReport('index_research', 'nsf.json'));
    } catch (e) {
      if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return;
    }
    if (!ctx.alive()) return;
    el.innerHTML = `
      ${LT.brief({ hero: full ? '' : (B.hero ? md(B.hero) : ''), chart: 'nsfBrief', items: [
        ['研究問題', '國安基金每次決議進場時，加權指數跌破了哪些長期均線、離高點多遠，進場之後指數怎麼走；金管會的限空令生效後，指數又怎麼走。'],
        ['怎麼比較', '以決議前最後一個收盤為準，和季線、年線、五年線等長期均線比較，並看近期跌了多少。'],
        ['分類', '股災後的救市(跌破長期均線、急跌)，和政治事件前的預防性進場分開看。'],
        ['期間', '2000 年國安基金成立以來的每一次進場，以及 2008 年以來的限空令。']] })}
      ${full ? `<div class="panel"><h3>研究報告</h3><div class="doc">${md(B.report)}</div></div>` : LT.reportLock()}`;
    paths(el.querySelector('#nsfBrief'), B, ['跌破均線', '急跌'], el.querySelector('#nsfBriefLegend'));
    el.querySelector('#nsfBriefLegend').insertAdjacentHTML('beforeend', '<p class="note">救市型的每一次進場：以決議前最後一個收盤為 100，往前 120 個交易日、往後 200 個交易日的加權指數。</p>');
    if (!full) return;   // 訪客：只有上半部
    el.querySelectorAll('.md-fig [data-fig]').forEach(div => {
      if (div.dataset.fig === '進場前後走勢.png') paths(div, B, ['預防', '跌破均線', '急跌']);
      else div.parentElement.remove();
    });
  }
  return { run };
})();
