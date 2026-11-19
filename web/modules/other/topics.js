/* ==========================================================================
   其他 › 近期話題(目錄頁 LT.catalog，網址 other/topics/<話題>)：市場近期討論的話題，每個話題一份研究報告
   · 國安基金第 10 次護盤買了什麼(other/topics/nsf10)：資料集 topics 的 nsf10.json(pipeline/topics/update.py)，
     八大行庫每天的淨買(臺銀證券總公司／其他分點)、決議後累計淨買前 20 大與報告 Markdown；不是回測，沒有淨值
   上半部(精簡版)公開，下半部(完整報告)要登入(LT.loadReport)
   ========================================================================== */
window.LTTopics = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TW = 'var(--sec)', OTHER = 'var(--mute)';
  const md2 = d => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
  const yi = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' 億';

  // 報告(Markdown)：同 margin.js，圖片 ![說明](nsf10/xxx.png) 換成依 JSON 畫的圖
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

  // 每日淨買：臺銀證券總公司 vs 八大行庫其他分點(並排長條)
  function daily(div, B, legend) {
    const ss = [{ name: '臺銀證券總公司', y: B.tw, color: TW }, { name: '八大行庫其他分點', y: B.other, color: OTHER }];
    const i0 = B.d.indexOf(B.ev0);
    LTChart.bars(div, { x: B.d, xFmt: md2, height: 280, label: '八大行庫每日淨買金額', title: '八大行庫每日淨買金額(億元)',
      yFmt: v => Math.round(v).toLocaleString(), series: ss, refY: [{ y: 0 }],
      tipFmt: (sr, v) => yi(v) });
    const html = LTChart.legend(ss) + (i0 >= 0 ? `<p class="note">${md2(B.ev0)} 是國安基金決議後的第一個交易日。</p>` : '');
    if (legend) legend.innerHTML = html; else div.insertAdjacentHTML('afterend', html);
  }

  // 決議後累計淨買前 20 大(八大行庫所有分點合計)
  function top(div, B) {
    const T = B.top;
    LTChart.bars(div, { x: T.name, xAll: true, xFmt: v => v.replace(/^\S+ /, ''), height: 280,
      label: `八大行庫 ${md2(T.from)}～${md2(T.to)} 累計淨買前 20 大`, title: '累計淨買(億元)',
      yMax: Math.max(...T.v) * 1.15, yFmt: v => Math.round(v).toLocaleString(), series: [{ name: '累計淨買', y: T.v, color: TW }], tipFmt: (sr, v) => yi(v) });
  }

  async function nsf10(el, ctx) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B, full;
    try {
      ({ data: B, full } = await LT.loadReport('topics', 'nsf10.json'));
    } catch (e) {
      if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return;
    }
    if (!ctx.alive()) return;
    el.innerHTML = `
      ${LT.brief({ hero: full ? '' : (B.hero ? md(B.hero) : ''), chart: 'nsf10Brief', items: [
        ['研究問題', '國安基金決議進場後，哪一天開始真正買進？買了哪些股票、大約多少錢？'],
        ['怎麼看', '國安基金透過八大行庫下單。比較八大行庫每個分點決議前後的買進，找出突然放大的分點與股票。'],
        ['怎麼比較', '和大跌前的平常日子比較；買進的股票算到最新收盤的帳面損益，並和同一天、同金額改買 0050 比較。'],
        ['期間', `2026/8 到 ${B.asof.replaceAll('-', '/')}。`]] })}
      ${full ? `<div class="panel"><h3>研究報告</h3><div class="doc">${md(B.report)}</div></div>` : LT.reportLock()}`;
    const lg = el.querySelector('#nsf10BriefLegend');
    daily(el.querySelector('#nsf10Brief'), B, lg);
    lg.insertAdjacentHTML('beforeend', '<p class="note">決議後的第一週，八大行庫沒有明顯多買。之後台股再跌，臺銀證券總公司突然每天大買，而且幾乎只買台積電、聯發科這幾檔權值股，其他分點沒有跟著放大。</p>');
    if (!full) return;   // 訪客：只有上半部
    el.querySelectorAll('.md-fig [data-fig]').forEach(div => {
      const f = div.dataset.fig.split('/').pop();   // 只看檔名(報告寫成 <報告>/xxx.png，同其他研究)
      if (f === '每日淨買.png') daily(div, B, null);
      else if (f === '事件期前20大.png') top(div, B);
      else div.parentElement.remove();
    });
  }

  LT.catalog({
    section: 'other', key: 'topics', name: '近期話題', desc: '市場近期討論的話題，用資料看實際發生了什麼',
    groups: [{ name: '', items: [
      { key: 'nsf10', name: '國安基金第 10 次護盤買了什麼', report: true,
        desc: '從八大行庫的分點進出，推估國安基金哪天開始買、買了哪些股票、買了多少',
        summary: '決議後沒有馬上買，等台股再跌才大量進場，集中在臺銀證券總公司，幾乎只買台積電、聯發科等少數權值股；目前帳面和同時買 0050 差不多。',
        run: (el, ctx) => nsf10(el, ctx) },
    ] }],
  });
  return { nsf10 };
})();
