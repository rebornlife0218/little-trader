/* ==========================================================================
   大盤漲跌分析 › 大跌反彈和融資的關係(網址 index/crash/margin；卡片在 render.js 的 LT.catalog)
   資料集 index_research 的 margin.json(pipeline/index_research/update.py)：報告 Markdown 與三張圖的資料；不是回測，沒有淨值
   上半部(精簡版)公開，下半部(完整報告)要登入(LT.loadReport)
   ========================================================================== */
window.LTMargin = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SIG = 'var(--sec)', ANY = 'var(--mute)';
  const pct = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d) + '%';

  // 報告(Markdown)：同 nsf.js，圖片 ![說明](xxx.png) 換成依 JSON 畫的圖
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

  // 重點：訊號 vs 任意一天，買進後 5、20、60 日的上漲機率
  function key(div, B, legend) {
    const H = [5, 20, 60], s = B.key['全部'], a = B.key['任意一天'];
    const ss = [{ name: `訊號(${s.n} 次)`, y: H.map(h => s['u' + h]), color: SIG }, { name: '任意一天', y: H.map(h => a['u' + h]), color: ANY }];
    LTChart.bars(div, { x: H.map(h => `買進後 ${h} 日`), xAll: true, xFmt: v => v, height: 260, yMin: 0, yMax: 100, label: '加權指數上漲機率',
      yFmt: v => Math.round(v) + '%', series: ss,
      tipFmt: (sr, v, i) => `${v.toFixed(0)}%，平均 ${pct((sr.name === '任意一天' ? a : s)['m' + H[i]])}`, refY: [{ y: 50 }] });
    legend.innerHTML = LTChart.legend(ss);
  }

  // 訊號總覽：加權指數(可切換對數)與訊號日，下方是單日融資金額 z
  function overview(div, B) {
    LTChart.line(div, log => {
      const tf = v => log ? Math.log10(v) : v;
      return { x: B.d, xType: 'date', height: 300, label: `2002 年以來 ${B.sig.length} 次訊號`, title: `2002 年以來 ${B.sig.length} 次訊號`,
        yFmt: v => Math.round(log ? 10 ** v : v).toLocaleString(), tipFmt: (sr, v) => Math.round(log ? 10 ** v : v).toLocaleString(),
        yTicks: log ? () => [5000, 10000, 20000, 40000].map(Math.log10) : undefined,
        series: [{ name: '加權指數', y: B.c.map(tf), color: 'var(--text)', width: 1.2 }],
        points: B.sig.map(p => ({ x: p.d, y: tf(p.c), color: SIG })),
        lower: { height: 120, label: '單日融資金額 z', yFmt: v => v.toFixed(0), tipFmt: (sr, v) => v.toFixed(2),
          series: [{ name: '單日融資金額 z', y: B.z, color: 'var(--mute)', width: 1 }, { name: '門檻', y: B.z.map(() => 3), color: SIG, width: 1.2 }] } };
    });
    div.insertAdjacentHTML('afterend', LTChart.legend([{ name: '加權指數', color: 'var(--text)' }, { name: '訊號', color: SIG }, { name: '單日融資金額 z(門檻 3)', color: 'var(--mute)' }]));
  }

  // 訊號後走勢：訊號隔天開盤買進的平均漲跌，和任意一天比較
  function path(div, B) {
    const P = B.path;
    const ss = [{ name: '訊號平均', y: P.mean, color: SIG, width: 2.4 }, { name: '訊號 75 百分位', y: P.p75, color: SIG, width: 1, dash: '4 3' },
      { name: '訊號 25 百分位', y: P.p25, color: SIG, width: 1, dash: '4 3' }, { name: '任意一天平均', y: P.base, color: ANY, width: 1.8 }];
    LTChart.line(div, { x: P.x, xType: 'num', height: 300, label: '訊號後買進的加權指數平均走勢',
      xLabel: '進場後第幾個交易日', yLabel: '漲跌', yFmt: v => v.toFixed(0) + '%', tipFmt: (sr, v) => pct(v), refY: [{ y: 0 }], series: ss });
    div.insertAdjacentHTML('afterend', LTChart.legend([ss[0], { ...ss[1], name: '訊號 25～75 百分位(虛線)' }, ss[3]]));
  }

  async function run(el, ctx) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B, full;
    try {
      ({ data: B, full } = await LT.loadReport('index_research', 'margin.json'));
    } catch (e) {
      if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return;
    }
    if (!ctx.alive()) return;
    const s = B.key['全部'];
    el.innerHTML = `
      ${LT.brief({ hero: full ? '' : (B.hero ? md(B.hero) : ''), chart: 'marginBrief', items: [
        ['研究問題', '台股大跌、融資戶被斷頭砍出來之後，加權指數是不是比較容易反彈？'],
        ['訊號', '指數跌深、融資金額單日大減，而且收盤沒有收在當天低檔，隔天開盤買進。'],
        ['怎麼比較', '和任意一天買進比較上漲機率與平均漲幅；只看指數跌深、不看融資的日子也一起比較。'],
        ['期間', '2002 年以來的加權指數，不含股息與成本。']] })}
      ${full ? `<div class="panel"><h3>研究報告</h3><div class="doc">${md(B.report)}</div></div>` : LT.reportLock()}`;
    const lg = el.querySelector('#marginBriefLegend');
    key(el.querySelector('#marginBrief'), B, lg);
    lg.insertAdjacentHTML('beforeend', `<p class="note">平常買進後抱 20 天，10 次大約只有 6 次賺錢；在指數已經跌深、融資戶被斷頭砍出來的那幾天買進，10 次將近 8 次賺錢，平均漲幅是平常的 ${Math.round(s.m20 / B.key['任意一天'].m20)} 倍。只看指數跌深沒有這個效果，要融資也大減才有。這個訊號 25 年只出現 ${s.n} 次${B.last ? `，最近一次是 ${B.last.replaceAll('-', '/')}` : ''}。</p>`);
    if (!full) return;   // 訪客：只有上半部
    el.querySelectorAll('.md-fig [data-fig]').forEach(div => {
      if (div.dataset.fig === '圖/訊號總覽.png') overview(div, B);
      else if (div.dataset.fig === '圖/訊號後走勢.png') path(div, B);
      else div.parentElement.remove();
    });
  }
  return { run };
})();
