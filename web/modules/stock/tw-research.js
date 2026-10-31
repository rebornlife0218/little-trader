/* 股票 · 台股 · 其他研究：依主題(營收、跳空、因子、事件、機器學習)分類的研究(資料集 tw_research，pipeline/tw_research/update.py；
   跳空與隔夜報酬用資料集 tw_gap，pipeline/tw_gap/update.py)
   目錄頁(LT.catalog)：依主題分組的研究卡片，點進去是單一研究；同一系列的研究標同一個顏色。
   淨值與交易統計已在 pipeline 用本機資料庫算好(整數股、交易成本與資金規則同台股策略，根目錄 CLAUDE.md)，網頁端只計算績效統計、畫圖與顯示報告(Markdown)。
   績效統計與圖表共用 tw-strategy.js 的 LTTW。新增研究：pipeline 加一個 <key>.json，這裡的 CATS 加一筆(run = 畫面函式)
   處置股策略(disp.json)放在 股票 › 處置股 › 處置股策略(disposition.js 呼叫 LTTWR.disp)，不列在這裡的目錄 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = () => window.LTTW;
  const DATASET = 'tw_research';
  // 系列：同一系列的研究用同一個顏色標記
  const SERIES = { rev: { name: '營收系列', color: 'var(--amber)' }, disp: { name: '處置股', color: '#B07CF0' }, gap: { name: '跳空', color: '#5fd0c5' } };
  const CATS = [
    { key: 'revenue', name: '營收', desc: '月營收公告前後的股價行為與選股', studies: [
      { key: 'rev_pre', name: '營收公告前布局', series: 'rev', desc: '月底先買進預期營收會好的股票，營收公告後隔天開盤賣出', summary: '營收可以事先預測，但不限市值時輸給 0050；只在市值第二小的一群裡選股，才和 0050 相當', run: (...a) => revPre(...a) },
      { key: 'rev_growth', name: '營收成長特徵', series: 'rev', desc: '營收成長公告後，哪些特徵最能區分後續報酬', summary: '好營收公告後隔天才買，平均是虧的；剛轉強的公司比一直很強的好', run: (...a) => revGrowth(...a) },
      { key: 'rev_drop', name: '營收衰退開低', series: 'rev', desc: '營收衰退公告後隔天大幅開低，開盤買進', summary: '開低買進只在冷門股有效，實際很難買到量，遠輸 0050', run: (...a) => revDrop(...a) },
      { key: 'rev_turn', name: '營收由負轉正', series: 'rev', desc: '營收年增率由負轉正公告後做多，和持續成長、持續衰退比較', summary: '市場對轉正的反應最大，但隔天開盤才買已經太晚，持有 20 日仍輸 0050', run: (...a) => revTurn(...a) },
    ] },
    { key: 'gap', name: '跳空', desc: '開盤跳空之後的股價表現', studies: [
      { key: 'gap', name: '跳空與隔夜報酬', series: 'gap', desc: '開盤跳空幾倍標準差，和當天收盤買、隔天開盤賣的隔夜報酬有沒有關係', summary: '跳空越大當天越會回吐，但隔夜報酬和沒跳空的日子差不多；差別主要來自收盤有沒有鎖漲跌停', run: (...a) => gap(...a) },
    ] },
    { key: 'factor', name: '因子', desc: '橫斷面因子選股', studies: [] },
    { key: 'event', name: '事件', desc: '特定事件前後的股價表現', studies: [] },
    { key: 'ml', name: '機器學習', desc: '用模型預測報酬', studies: [] },
  ];
  const tag = s => `<span class="series-tag"><i style="background:${SERIES[s].color}"></i>${esc(SERIES[s].name)}</span>`;

  // 目錄頁(LT.catalog)：依主題分組的研究卡片，點進去是單一研究(網址 stock/tw-research/<研究>)
  LT.catalog({
    section: 'stock', group: '台股', key: 'tw-research', name: '其他研究', title: '台股其他研究',
    desc: '依主題分類的研究；同一個顏色代表同一系列的研究。回測一律和買進持有 0050 比較', report: true,
    groups: CATS.map(c => ({ name: c.name, desc: c.desc, items: c.studies.map(x => ({
      key: x.key, name: x.name, desc: x.desc, summary: x.summary, tags: tag(x.series), run: (el, ctx) => x.run(el, ctx, x),
    })) })),
  });

  /* ---------- 共用 ---------- */
  // 回傳 [資料, full]：登入的人拿完整版(full = true)；訪客拿精簡版(只有上半部用到的欄位，下半部放 LT.reportLock())
  async function load(el, ctx, key, ds = DATASET) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    try {
      const { data, full } = await LT.loadReport(ds, key + '.json');
      return ctx.alive() ? [data, full] : [];
    } catch (e) {
      if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return [];
    }
  }
  // 先講結論：登入的人由報告開頭的引言自動放上來(hoistConclusion)；訪客的精簡版只帶這一段(hero)
  // (加密的研究解開後是完整資料，訪客一樣只顯示報告開頭的引言)
  const heroOf = (B, full) => {
    if (full) return '';
    const h = B.hero || ((B.report || '').match(/^\s*((?:>.*(?:\r?\n|$))+)/) || [])[1];
    return h ? md(h) : '';
  };
  // 報告(Markdown)：表格加上站內表格樣式，## → h3、### → h4；圖片 ![說明](xxx.png) 換成依 JSON 畫的圖(網站不放 png，見 drawFigs)
  function md(src) {
    const box = document.createElement('div');
    src = src.replace(/^!\[([^\]]*)\]\(([\w.-]+\.png)\)[ 	]*$/gm, (_, cap, f) => `
<figure class="md-fig twr-fig"><div data-fig="${esc(f)}"></div><figcaption>${esc(cap)}</figcaption></figure>
`);
    box.innerHTML = marked.parse(src);
    LT.mdTables(box);
    const retag = (s, tagName, c) => box.querySelectorAll(s).forEach(h => { const e = document.createElement(tagName); e.className = c; e.innerHTML = h.innerHTML; h.replaceWith(e); });
    retag('h3', 'h4', 'md-h3');
    retag('h2', 'h3', 'md-h2');
    box.querySelectorAll('a').forEach(a => { if (!/^https?:/.test(a.getAttribute('href') || '')) a.replaceWith(...a.childNodes); });   // 報告內的相對連結在網站上沒有對應頁面
    return box.innerHTML;
  }
  // 報告內的圖：figs = { 'xxx.png': el => 畫圖 }，沒有對應的圖就移除
  function drawFigs(el, figs) {
    el.querySelectorAll('.twr-fig [data-fig]').forEach(div => { const f = figs[div.dataset.fig]; if (f) f(div); else div.parentElement.remove(); });
  }
  // 橫軸日期：跨年的只標年份，同一年內(例如處置股新制後)標月/日
  const dateFmt = d => d[0].slice(0, 4) === d[d.length - 1].slice(0, 4) ? (v, tip) => tip ? v : v.slice(5).replace('-', '/') : (v, tip) => tip ? v : v.slice(0, 4);
  // 累積報酬(對數刻度)：lines = [{ name, nav, color, width }]，圖例接在圖的下方
  const LOG_TICKS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  function navLines(div, d, lines) {
    const n = d.length, step = Math.max(1, Math.floor(n / 700)), idx = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    LTChart.line(div, { x: idx.map(i => d[i]), xType: 'date', label: '累積報酬', height: 300, xFmt: dateFmt(d),
      yFmt: v => W().pct(10 ** v - 1, 0), tipFmt: (s, v) => W().pct(10 ** v - 1, 1), yTicks: () => LOG_TICKS.map(Math.log10), refY: [{ y: 0 }],
      series: lines.map(l => ({ name: l.name, color: l.color, width: l.width || 1.6, y: idx.map(i => Math.log10(l.nav[i])) })) });
    div.insertAdjacentHTML('afterend', LTChart.legend(lines));
  }
  // 年度報酬長條：lines = [{ name, nav, color }]
  function yearBars(div, d, lines, b0050) {
    const rows = lines.map(l => W().yearTable(d, 0, l.nav, b0050));
    LTChart.bars(div, { x: rows[0].map(r => r.yr), xAll: true, xFmt: v => v, label: '年度報酬', height: 240, yFmt: v => (v * 100).toFixed(0) + '%',
      tipFmt: (s, v) => `${s.name}：${W().pct(v, 1)}`, series: lines.map((l, j) => ({ name: l.name, color: l.color, y: rows[j].map(r => r.r) })) });
    div.insertAdjacentHTML('afterend', LTChart.legend(lines));
  }
  const CV = ['#94a3b8', '#B07CF0', 'var(--amber)', '#F06FB0', '#5fd0c5'];   // 市值版本：不限、Q1～Q4(Q2 用系列色)
  const C0050 = 'var(--blue)', CEW = '#94a3b8', CS = ['var(--amber)', 'var(--up)', 'var(--down)', '#B07CF0', '#F06FB0'];
  const reportPanel = (S, src) => `
    <div class="panel">
      <h3>研究報告 ${tag(S.series)}</h3>
      <div class="doc">${md(src)}</div>
    </div>`;
  // 精簡版(LT.brief)的績效卡片(ts = 交易統計)與累積報酬圖：主要版本 vs 0050；短期間(同一年內)橫軸標月/日
  function briefChart(el, d, nav, b0050, name, color, ts) {
    const box = el.querySelector('#twrBriefStats');
    if (box && ts) { const { stats, vs0050Cards, tradeCards } = W(); box.innerHTML = vs0050Cards(stats(nav), stats(b0050), ts) + tradeCards(ts) + extraCards(ts); }
    W().navCharts({ d, i0: 0, navs: { s: nav, b0050 }, meta: { s: { name, color }, b0050: { name: '0050 買進持有', color: C0050 } },
      main: 's', chart: el.querySelector('#twrBrief'), legend: el.querySelector('#twrBriefLegend'), xFmt: dateFmt(d) });
  }
  const NO_STOP = '不設停利停損。';
  const MONEY = '本金 100 萬元，買賣金額除以成交價(含滑價與手續費)無條件捨去到整數股；沒有新股票進場的日子不調整，沒用到的資金持有現金(不計利息)。';
  // 回測規則依台股策略頁的同一套原則：漲跌停、沒有成交、下市櫃的處理
  // 每年報酬表：cols = [{ name, nav, cmp }](cmp = 和 0050 比較、粗體標示贏過)
  function yearRows(d, cols, b0050) {
    const base = W().yearTable(d, 0, cols[0].nav, b0050);
    const per = cols.map(c => W().yearTable(d, 0, c.nav, b0050));
    return base.map((r, i) => ({ label: r.label, b: r.b, v: per.map(p => p[i].r) }));
  }
  function yearTableHtml(d, cols, b0050) {
    const rows = yearRows(d, cols, b0050);
    const wins = j => rows.filter(r => r.v[j] > r.b).length;
    return `<div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th>${cols.map(c => `<th>${esc(c.name)}</th>`).join('')}<th>0050</th></tr></thead><tbody>
      ${rows.slice().reverse().map(r => `<tr><td>${r.label}</td>${r.v.map((v, j) => W().heat(v, cols[j].cmp && v > r.b)).join('')}${W().heat(r.b, false)}</tr>`).join('')}
      <tr class="allrow"><td>贏 0050 的年數</td>${cols.map((c, j) => `<td>${c.cmp ? `${wins(j)} / ${rows.length}` : '—'}</td>`).join('')}<td>—</td></tr></tbody></table></div>`;
  }
  // 比較表：rows = [{ name, nav, ts, main }]；S = 0050 的 stats
  function compareTable(rows, S) {
    const { stats, pct, cls, beat, totalRet } = W();
    return `<div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>組合</th><th>勝率</th><th>總報酬</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>索提諾比率</th><th>最大回撤</th><th>最長連續回撤</th><th>交易筆數</th><th>每筆平均 / 中位數</th></tr></thead><tbody>
      ${rows.map(r => { const x = stats(r.nav), t = r.ts;
        return `<tr class="${r.main ? 'allrow' : ''}"><td>${esc(r.name)}</td><td>${t ? `${(t.win * 100).toFixed(0)}%` : '—'}</td><td class="${cls(x.mult - 1)} ${beat(x.mult, S.mult)}">${totalRet(x)}</td><td class="${cls(x.ret)} ${beat(x.ret, S.ret)}">${pct(x.ret)}</td>
          <td class="${beat(x.vol, S.vol, false)}">${(x.vol * 100).toFixed(1)}%</td><td class="${beat(x.sharpe, S.sharpe)}">${x.sharpe.toFixed(2)}</td><td class="${beat(x.sortino, S.sortino)}">${x.sortino.toFixed(2)}</td>
          <td class="down ${beat(x.mdd, S.mdd)}">${pct(x.mdd, 1)}</td><td class="${beat(x.ddDays, S.ddDays, false)}">${x.ddDays} 天</td>
          <td>${t ? `${t.n.toLocaleString()} 筆` : '—'}</td><td class="${t ? cls(t.mean) : ''}">${t ? `${pct(t.mean, 2)} / ${pct(t.median, 2)}` : '—'}</td></tr>`; }).join('')}
      <tr><td>0050 買進持有</td><td>—</td><td>${totalRet(S)}</td><td>${pct(S.ret)}</td><td>${(S.vol * 100).toFixed(1)}%</td><td>${S.sharpe.toFixed(2)}</td><td>${S.sortino.toFixed(2)}</td><td class="down">${pct(S.mdd, 1)}</td><td>${S.ddDays} 天</td><td>—</td><td>—</td></tr>
      </tbody></table></div>`;
  }
  const extraCards = t => [
    t.fail ? W().card(`${t.fail.toLocaleString()} 筆`, '開盤漲停買不到', '放棄的訊號') : '',
    t.nocash ? W().card(`${t.nocash.toLocaleString()} 筆`, '買不起一股而放棄', t.cap ? `每檔上限為總資產的 ${(t.cap * 100).toFixed(0)}%` : '') : '',
    t.delist ? W().card(`${t.delist} 筆`, '持有期間下市櫃', '以最後收盤價轉現金') : '',
  ].join('');

  /* ---------- 營收公告前布局：版本(不限市值、市值四分位) × 前 10 / 前 5 檔 ---------- */
  async function revPre(el, ctx, S) {
    const [B, full] = await load(el, ctx, 'rev_pre');
    if (!B) return;
    let ver = 'all', grp = 't10';
    const G = { t10: '前 10 檔', t5: '前 5 檔' };
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', stats: 'twrBriefStats', items: [
        ['邏輯', '營收大多在月初公布，公布前先用已經公布的營收趨勢，預測誰下個月的營收會好，提前買進。'],
        ['進出場', '每月下旬開盤，買進綜合分數最高的幾檔；各檔營收公告後的下一個交易日開盤賣出。'],
        ['停利停損', NO_STOP], ['持有期間', '到營收公告為止。']] })}
      ${!full ? LT.reportLock() : `<div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>規則</b>：營收月份 M 的 21 日(含)之後第一個交易日開盤，買進綜合分數最高的 10 檔或 5 檔；每檔在 M 月營收公告後的第一個交易日開盤賣出(月底後 15 天內沒公告，在 M+1 月 16 日後第一個交易日賣出)。前一個交易日收盤後選股，只用當晚已知的資料。</p>
          <p><b>綜合分數</b>：上月年增、上月年增加速、近 3 月年增、上月月增、連續成長月數(越高越好)與去年同月年增(越低越好)6 個營收因子的百分位平均。<b>市值四分位</b>：每月把合格股票依進場前一日市值切成四等分(Q1 最小、Q4 最大)，只在其中一組裡選股。</p>
          <p><b>資金分配</b>：策略寫明持有 10(或 5)檔，每檔上限 = 前一天收盤總資產 ÷ 10(或 5)；有新股票進場的那天，新股票的目標金額 = 前一天收盤總資產 × min(上限, 1 ÷ 持有檔數)；先用現金買，現金不夠時差額由舊持股平均分攤(每檔減碼相等的金額，以整數股調整)，舊持股不另外補足；還是不夠時新股票平分剩下的現金，不放棄訊號(連一股都買不起才放棄)。${MONEY}</p>
        </div>
        <div class="mode-tabs twr-ver" style="margin-top:12px;">${B.versions.map(v => `<button class="mode-tab" data-v="${v.key}"><b>${esc(v.name)}</b><small>${v.key === 'all' ? '全部合格股票' : capTxt(v)}</small></button>`).join('')}</div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
          <div class="paramitem"><label for="twrGrp">組合</label><select id="twrGrp"><option value="t10">前 10 檔</option><option value="t5">前 5 檔</option></select></div>
        </div>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>所有版本比較(21 日進場)</h3><div id="twrAll"></div></div>
      <div class="panel"><h3>綜合分數十分位(不限市值，21 日進場)</h3><div id="twrDec"></div>
</div>
      ${reportPanel(S, B.report)}`}`;
    const $ = s => el.querySelector(s);
    briefChart(el, B.d, B.versions[0].nav.t10, B.b0050, '不限市值｜前 10 檔', SERIES[S.series].color, B.versions[0].ts.t10);
    if (!full) return;   // 訪客：只有上半部
    // 市值範圍(每月的最小、最大值)：第一個月 → 最後一個月；Q1 只列上限、Q4 只列下限
    function capTxt(v) {
      const n = v.cap.lo.length, r = i => v.key === 'q1' ? `${Math.round(v.cap.hi[i])} 億以下` : v.key === 'q4' ? `${Math.round(v.cap.lo[i])} 億以上` : `${Math.round(v.cap.lo[i])}～${Math.round(v.cap.hi[i])} 億`;
      return `${v.cap.m[0].slice(0, 4)} 年 ${r(0)} → ${v.cap.m[n - 1].slice(0, 4)} 年 ${r(n - 1)}`;
    }
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts } = W();
      const V = B.versions.find(v => v.key === ver), nav = V.nav[grp], x = stats(nav), Sx = stats(B.b0050), t = V.ts[grp];
      el.querySelectorAll('.twr-ver .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.v === ver));
      const ent = V.entry.filter(r => r.g === G[grp] || r.g === '全部合格股票');
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(V.name)}｜${G[grp]}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx, t)}${tradeCards(t)}${extraCards(t)}</div>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(V.name)}｜${G[grp]} vs 全部合格股票 vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: G[grp], nav, cmp: true }, { name: '全部合格股票', nav: V.nav.ew }], B.b0050)}
          <h4>進場日敏感度</h4>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>進場日</th><th>組合</th><th>總報酬</th><th>年化報酬</th><th>夏普值</th><th>索提諾比率</th><th>最大回撤</th><th>每筆平均</th></tr></thead><tbody>
            ${ent.map(r => `<tr class="${r.rule === '21日' && r.g === G[grp] ? 'allrow' : ''}"><td>${esc(r.rule.replace('日', ' 日'))}</td><td>${esc(r.g)}</td><td class="${W().cls(r.ret)}">${W().pct(r.ret, 0)}</td><td>${W().pct(r.cagr)}</td><td>${r.sharpe.toFixed(2)}</td><td>${r.sortino.toFixed(2)}</td><td class="down">${W().pct(r.mdd, 1)}</td><td class="${W().cls(r.mean)}">${W().pct(r.mean, 2)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: nav, ew: V.nav.ew, b0050: B.b0050 },
        meta: { s: { name: `${V.name}｜${G[grp]}`, color: SERIES[S.series].color }, ew: { name: '全部合格股票', color: '#94a3b8' }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', chart: $('#twrChart'), legend: $('#twrLegend') });
      $('#twrAll').innerHTML = compareTable(B.versions.flatMap(v => ['t10', 't5'].map(g => ({ name: `${v.name}｜${G[g]}`, nav: v.nav[g], ts: v.ts[g], main: v.key === ver && g === grp }))), Sx);
    }
    const decile = div => LTChart.bars(div, { x: B.decile.map(r => 'D' + r.d), xAll: true, xFmt: v => v, label: '每筆平均報酬', height: 200, yFmt: v => (v * 100).toFixed(1) + '%',
      tipFmt: (s, v) => `${W().pct(v, 2)}`, series: [{ name: '每筆平均報酬', y: B.decile.map(r => r.mean), colors: B.decile.map(r => r.mean >= 0 ? 'var(--up)' : 'var(--down)') }] });
    decile($('#twrDec'));
    const V0 = B.versions[0];
    drawFigs(el, {
      'cum_return.png': div => navLines(div, B.d, [{ name: '前 10 檔', nav: V0.nav.t10, color: CS[0], width: 2.2 }, { name: '前 5 檔', nav: V0.nav.t5, color: CS[1] },
        { name: '全部合格股票', nav: V0.nav.ew, color: CEW }, { name: '0050 買進持有', nav: B.b0050, color: C0050 }]),
      'score_decile.png': decile,
      'compare_versions.png': div => navLines(div, B.d, [...B.versions.map((v, i) => ({ name: `${v.name}｜前 10 檔`, nav: v.nav.t10, color: CV[i], width: v.key === 'q2' ? 2.2 : 1.5 })),
        { name: '0050 買進持有', nav: B.b0050, color: C0050 }]),
    });
    el.querySelector('.twr-ver').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { ver = b.dataset.v; draw(); } };
    $('#twrGrp').onchange = () => { grp = $('#twrGrp').value; draw(); };
    draw();
  }

  /* ---------- 營收衰退開低：日內 / T+1 × 全部 / 均額 ≥ 1 千萬 ---------- */
  async function revDrop(el, ctx, S) {
    const [B, full] = await load(el, ctx, 'rev_drop');
    if (!B) return;
    let k = B.strats[0].key;
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', stats: 'twrBriefStats', items: [
        ['邏輯', '營收衰退的公司公告後，隔天開盤常常大跌；跌太多時，開盤買進賭當天的反彈。'],
        ['進出場', '營收大幅衰退的公告後，隔天開盤跳空大跌就開盤買進，當天收盤賣出(另比較隔天開盤賣)。'],
        ['停利停損', NO_STOP], ['持有期間', '當天或隔天賣出。']] })}
      ${!full ? LT.reportLock() : `<div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>規則</b>：月營收年增率 < -10% 的公告(月底後 15 天內的首次公告)，公告後第一個交易日(T1)開盤相對前一天收盤跳空 ≤ -5%，T1 開盤買進。<b>日內</b>：T1 收盤賣出；<b>T+1</b>：隔一個交易日開盤賣出。另測事前 20 日平均成交金額 ≥ 1 千萬(可實際交易的股票)的版本。</p>
          <p><b>資金分配</b>：每檔上限 = 前一天收盤總資產 ÷ 平均一天持有檔數(只用進場日之前的持股紀錄、只算有部位的日子；之前有部位的日子不到 20 個交易日時上限 20%)；有新股票進場的那天，新股票的目標金額 = 前一天收盤總資產 × min(上限, 1 ÷ 持有檔數)；先用現金買，現金不夠時差額由舊持股平均分攤(每檔減碼相等的金額，以整數股調整)，舊持股不另外補足；還是不夠時新股票平分剩下的現金，不放棄訊號(連一股都買不起才放棄)。${MONEY}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twrS">策略</label><select id="twrS">${B.strats.map(s => `<option value="${esc(s.key)}">${esc(s.name)}</option>`).join('')}</select></div>
        </div>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>四種策略比較</h3><div id="twrAll"></div></div>
      ${reportPanel(S, B.report)}`}`;
    const $ = s => el.querySelector(s);
    briefChart(el, B.d, B.strats[0].nav, B.b0050, B.strats[0].name, SERIES[S.series].color, B.strats[0].ts);
    if (!full) return;   // 訪客：只有上半部
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts } = W();
      const T = B.strats.find(s => s.key === k), x = stats(T.nav), Sx = stats(B.b0050);
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(T.name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx, T.ts)}${tradeCards(T.ts)}${extraCards(T.ts)}</div>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(T.name)} vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: T.name, nav: T.nav, cmp: true }], B.b0050)}
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: T.nav, b0050: B.b0050 }, meta: { s: { name: T.name, color: SERIES[S.series].color }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', chart: $('#twrChart'), legend: $('#twrLegend') });
      $('#twrAll').innerHTML = compareTable(B.strats.map(s => ({ name: s.name, nav: s.nav, ts: s.ts, main: s.key === k })), Sx);
    }
    const sk = n => B.strats.find(s => s.key === n);
    drawFigs(el, {
      'cum_return.png': div => navLines(div, B.d, [{ name: '日內｜全部', nav: sk('日內｜全部').nav, color: CS[0], width: 2.2 }, { name: 'T+1｜全部', nav: sk('T+1｜全部').nav, color: CS[1] },
        { name: '日內｜均額 ≥ 1 千萬', nav: sk('日內｜均額 ≥ 1 千萬').nav, color: CS[3] }, { name: '0050 買進持有', nav: B.b0050, color: C0050 }]),
      'yearly_return.png': div => yearBars(div, B.d, [{ name: '日內｜全部', nav: sk('日內｜全部').nav, color: CS[0] }, { name: 'T+1｜全部', nav: sk('T+1｜全部').nav, color: CS[1] },
        { name: '0050', nav: B.b0050, color: C0050 }], B.b0050),
    });
    $('#twrS').onchange = () => { k = $('#twrS').value; draw(); };
    draw();
  }

  /* ---------- 營收成長特徵：持有期 × 分數組合；事件研究與特徵 IC ---------- */
  async function revGrowth(el, ctx, S) {
    const [B, full] = await load(el, ctx, 'rev_growth');
    if (!B) return;
    const HS = [...new Set(B.strats.map(s => s.h))], GS = [...new Set(B.strats.map(s => s.g))];
    let h = '5日', g = '分數 = 3';
    const FN = { 成長: '營收年增率', 月增: '營收月增率', 年增加速: '年增加速', 連續成長月數: '連續年增 > 10% 月數', 公告天數: '公告日距月底天數', 開盤跳空: 'T1 開盤跳空',
      事前5日報酬: '事前 5 日報酬', 事前20日報酬: '事前 20 日報酬', 距60日高點: '距 60 日高點', '市值(億)': '市值', 均額10: '10 日均成交金額', 外資5日買超比: '外資 5 日買超比',
      投信5日買超比: '投信 5 日買超比', '近5日主力買賣超(%)': '近 5 日主力買賣超' };
    const HN = { 日內: '日內(T1 收盤賣)', 'T+1': 'T+1(T2 開盤賣)', '5日': '5 日(T5 收盤賣)' };
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', stats: 'twrBriefStats', items: [
        ['邏輯', '營收成長的公司公告後，找出哪些特徵(成長幅度、股價位置、法人買賣…)最能分出後續會漲還是會跌。'],
        ['進出場', '營收公告後的下一個交易日開盤買進，持有期滿收盤賣出；只買特徵分數高的事件。'],
        ['停利停損', NO_STOP], ['持有期間', '短線持有(比較幾種持有期間)。']] })}
      ${!full ? LT.reportLock() : `<div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>事件</b>：月營收年增率 > 10% 的公告(月底後 15 天內的首次公告)，事前 10 日平均成交金額 ≥ 1 千萬；公告後第一個交易日(T1)開盤買進。</p>
          <p><b>策略</b>：每個持有期選 IC 最顯著的 3 個特徵，落在有利方向前 40% 就給 1 分(0 ～ 3 分)，比較「全部事件」、「分數 ≥ 2」、「分數 = 3」。</p>
          <p><b>資金分配</b>：每檔上限 = 前一天收盤總資產 ÷ 平均一天持有檔數(只用進場日之前的持股紀錄、只算有部位的日子；之前有部位的日子不到 20 個交易日時上限 20%)；有新股票進場的那天，新股票的目標金額 = 前一天收盤總資產 × min(上限, 1 ÷ 持有檔數)；先用現金買，現金不夠時差額由舊持股平均分攤(每檔減碼相等的金額，以整數股調整)，舊持股不另外補足；還是不夠時新股票平分剩下的現金，不放棄訊號(連一股都買不起才放棄)。${MONEY}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twrH">持有期</label><select id="twrH">${HS.map(x => `<option value="${esc(x)}">${esc(HN[x] || x)}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="twrG">組合</label><select id="twrG">${GS.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
        </div>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>所有組合比較</h3><div id="twrAll"></div></div>
      <div class="panel">
        <h3>營收公告前後的累積超額報酬</h3>
        <div id="twrCar"></div><div id="twrCarLegend"></div>
      </div>
      <div class="panel">
        <h3>特徵有效性：每月 IC 的 t 值</h3>
        <div id="twrIc"></div>
      </div>
      ${reportPanel(S, B.report)}`}`;
    const $ = s => el.querySelector(s);
    { const T0 = B.strats.find(x => x.h === '5日' && x.g === '分數 = 3') || B.strats[0]; briefChart(el, B.d, T0.nav, B.b0050, `${T0.h}｜${T0.g}`, SERIES[S.series].color, T0.ts); }
    if (!full) return;   // 訪客：只有上半部
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts } = W();
      const T = B.strats.find(s => s.h === h && s.g === g), x = stats(T.nav), Sx = stats(B.b0050);
      const name = `${HN[h] || h}｜${g}`;
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx, T.ts)}${tradeCards(T.ts)}${extraCards(T.ts)}</div>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(name)} vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: g, nav: T.nav, cmp: true }], B.b0050)}
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: T.nav, b0050: B.b0050 }, meta: { s: { name, color: SERIES[S.series].color }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', chart: $('#twrChart'), legend: $('#twrLegend') });
      $('#twrAll').innerHTML = compareTable(B.strats.map(s => ({ name: `${HN[s.h] || s.h}｜${s.g}`, nav: s.nav, ts: s.ts, main: s === T })), Sx);
    }
    // 事件研究：衰退組用綠色系(越深衰退越多)，成長組用紅色系(越深成長越多)，台股慣例紅漲綠跌
    const CAR_C = ['#0f6b3c', '#14965A', '#2ECC71', '#8be0ad', '#f5a3a5', '#F0565B', '#D92D33', '#8f1d21'];
    const cs = Object.keys(B.car.series);
    const carChart = div => LTChart.line(div, { x: B.car.x, xType: 'num', label: '累積超額報酬', height: 280, xFmt: v => (v > 0 ? '+' : '') + v, yFmt: v => v.toFixed(1) + '%',
      tipFmt: (s, v) => (v > 0 ? '+' : '') + v.toFixed(2) + '%', refX: [{ x: 0, label: 'T0 公告日' }], refY: [{ y: 0 }],
      series: cs.map((c, i) => ({ name: c, y: B.car.series[c], color: CAR_C[i], width: 1.8 })) });
    const carLegend = LTChart.legend(cs.map((c, i) => ({ name: c, color: CAR_C[i] })));
    carChart($('#twrCar')); $('#twrCarLegend').innerHTML = carLegend;
    const ic = B.ic.slice().sort((a, b) => Math.abs(b.h['5日']) - Math.abs(a.h['5日']));
    const tCell = v => { const c = v >= 0 ? 'var(--up)' : 'var(--down)', a = Math.min(50, Math.abs(v) * 3.5);
      return `<td style="background:color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)${Math.abs(v) > 2 ? ';font-weight:700' : ''}">${v.toFixed(1)}</td>`; };
    const icTable = `<div class="tablewrap"><table class="stattable"><thead><tr><th style="text-align:left">特徵</th>${HS.map(x => `<th>${esc(HN[x] || x)}</th>`).join('')}</tr></thead><tbody>
      ${ic.map(r => `<tr><td style="text-align:left">${esc(FN[r.f] || r.f)}</td>${HS.map(x => tCell(r.h[x])).join('')}</tr>`).join('')}</tbody></table></div>`;
    $('#twrIc').innerHTML = icTable;
    const sg = (hh, gg) => B.strats.find(x => x.h === hh && x.g === gg).nav;
    drawFigs(el, {
      'event_car.png': div => { carChart(div); div.insertAdjacentHTML('afterend', carLegend); },
      'feature_ic.png': div => { div.innerHTML = icTable; },
      'strategy_return.png': div => navLines(div, B.d, [{ name: '5 日｜分數 = 3', nav: sg('5日', '分數 = 3'), color: CS[0], width: 2.2 }, { name: '5 日｜分數 >= 2', nav: sg('5日', '分數 >= 2'), color: CS[3] },
        { name: '5 日｜全部事件', nav: sg('5日', '全部事件'), color: CS[1] }, { name: '0050 買進持有', nav: B.b0050, color: C0050 }]),
    });
    $('#twrH').value = h; $('#twrG').value = g;
    $('#twrH').onchange = () => { h = $('#twrH').value; draw(); };
    $('#twrG').onchange = () => { g = $('#twrG').value; draw(); };
    draw();
  }

  async function revTurn(el, ctx, S) {
    const [B, full] = await load(el, ctx, 'rev_turn');
    if (!B) return;
    const HS = [...new Set(B.strats.map(s => s.h))];
    let h = '20日', g = '由負轉正';
    const HN = { '5日': '5 日(T5 收盤賣)', '10日': '10 日(T10 收盤賣)', '20日': '20 日(T20 收盤賣)' };
    const gs = hh => B.strats.filter(s => s.h === hh).map(s => s.g);
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', stats: 'twrBriefStats', items: [
        ['邏輯', '營收年增率由衰退轉為成長，可能代表景氣或營運開始好轉，公告後跟著買進。'],
        ['進出場', '營收年增率由衰退轉為成長的公告後，下一個交易日開盤買進，持有期滿收盤賣出。'],
        ['停利停損', NO_STOP], ['持有期間', '短線持有(比較幾種持有期間)。']] })}
      ${!full ? LT.reportLock() : `<div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>事件</b>：月營收年增率上個月 < 0、這個月 > 0 的公告(月底後 15 天內的首次公告)，事前 10 日平均成交金額 ≥ 1 千萬；公告後第一個交易日(T1)開盤買進，持有 5、10 或 20 個交易日(T1 算第 1 天)後收盤賣出。另測轉正前連續負成長的月數、本月年增率的門檻，並以「持續成長」(上月、本月都 > 0)當對照組。</p>
          <p><b>資金分配</b>：每檔上限 = 前一天收盤總資產 ÷ 平均一天持有檔數(只用進場日之前的持股紀錄、只算有部位的日子；之前有部位的日子不到 20 個交易日時上限 20%)；有新股票進場的那天，新股票的目標金額 = 前一天收盤總資產 × min(上限, 1 ÷ 持有檔數)；先用現金買，現金不夠時差額由舊持股平均分攤(每檔減碼相等的金額，以整數股調整)，舊持股不另外補足；還是不夠時新股票平分剩下的現金，不放棄訊號(連一股都買不起才放棄)。${MONEY}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twrH">持有期</label><select id="twrH">${HS.map(x => `<option value="${esc(x)}">${esc(HN[x] || x)}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="twrG">條件</label><select id="twrG"></select></div>
        </div>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>所有條件比較</h3><div id="twrAll"></div></div>
      <div class="panel">
        <h3>四種營收變化：公告前後的累積超額報酬</h3>
        <div id="twrCar"></div><div id="twrCarLegend"></div>
        <h4>每筆交易報酬(T1 開盤買進，扣成本；每個事件獨立計算，不受資金限制)</h4>
        <div class="tablewrap"><table class="stattable"><thead><tr><th>營收變化</th><th>筆數</th><th>T+1 平均 / 勝率</th><th>5 日平均 / 勝率</th><th>10 日平均 / 勝率</th><th>20 日平均 / 勝率</th></tr></thead><tbody>
          ${B.groups.map(r => `<tr class="${r.g === '由負轉正' ? 'allrow' : ''}"><td>${esc(r.g)}</td><td>${r.n.toLocaleString()}</td>${['T+1', '5日', '10日', '20日'].map(x => `<td class="${W().cls(r[x].mean)}">${W().pct(r[x].mean, 2)} / ${(r[x].win * 100).toFixed(0)}%</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
      </div>
      ${reportPanel(S, B.report)}`}`;
    const $ = s => el.querySelector(s);
    { const T0 = B.strats.find(x => x.h === '20日' && x.g === '由負轉正') || B.strats[0]; briefChart(el, B.d, T0.nav, B.b0050, '20 日｜由負轉正', SERIES[S.series].color, T0.ts); }
    if (!full) return;   // 訪客：只有上半部
    const fillG = () => {
      $('#twrG').innerHTML = gs(h).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      if (!gs(h).includes(g)) g = gs(h)[0];
      $('#twrG').value = g;
    };
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts } = W();
      const T = B.strats.find(s => s.h === h && s.g === g), x = stats(T.nav), Sx = stats(B.b0050);
      const name = `${HN[h] || h}｜${g}`;
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx, T.ts)}${tradeCards(T.ts)}${extraCards(T.ts)}</div>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(name)} vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: g, nav: T.nav, cmp: true }], B.b0050)}
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: T.nav, b0050: B.b0050 }, meta: { s: { name, color: SERIES[S.series].color }, b0050: { name: '0050 買進持有', color: C0050 } },
        main: 's', chart: $('#twrChart'), legend: $('#twrLegend') });
      $('#twrAll').innerHTML = compareTable(B.strats.map(s => ({ name: `${HN[s.h] || s.h}｜${s.g}`, nav: s.nav, ts: s.ts, main: s === T })), Sx);
    }
    // 事件研究：由負轉正用系列色，其餘依方向配色(成長紅、衰退綠，台股慣例)
    const CC = { 由負轉正: SERIES[S.series].color, 持續成長: 'var(--up)', 持續衰退: '#94a3b8', 由正轉負: 'var(--down)' };
    const cs = Object.keys(B.car.series);
    const carChart = div => LTChart.line(div, { x: B.car.x, xType: 'num', label: '累積超額報酬', height: 280, xFmt: v => (v > 0 ? '+' : '') + v, yFmt: v => v.toFixed(1) + '%',
      tipFmt: (s, v) => (v > 0 ? '+' : '') + v.toFixed(2) + '%', refX: [{ x: 0, label: 'T0 公告日' }], refY: [{ y: 0 }],
      series: cs.map(c => ({ name: c, y: B.car.series[c], color: CC[c] || CEW, width: c === '由負轉正' ? 2.4 : 1.6 })) });
    const carLegend = LTChart.legend(cs.map(c => ({ name: c, color: CC[c] || CEW })));
    carChart($('#twrCar')); $('#twrCarLegend').innerHTML = carLegend;
    const sg = gg => B.strats.find(x => x.h === '20日' && x.g === gg).nav;
    drawFigs(el, {
      'event_car.png': div => { carChart(div); div.insertAdjacentHTML('afterend', carLegend); },
      'cum_return.png': div => navLines(div, B.d, [{ name: '由負轉正', nav: sg('由負轉正'), color: CS[0], width: 2.2 }, { name: '負成長 ≥ 3 個月後轉正', nav: sg('負成長 ≥ 3 個月後轉正'), color: CS[3] },
        { name: '轉正且年增 > 30%', nav: sg('轉正且年增 > 30%'), color: CS[4] }, { name: '持續成長（對照）', nav: sg('持續成長（對照）'), color: CEW }, { name: '0050 買進持有', nav: B.b0050, color: C0050 }]),
      'yearly_return.png': div => yearBars(div, B.d, [{ name: '由負轉正', nav: sg('由負轉正'), color: CS[0] }, { name: '持續成長（對照）', nav: sg('持續成長（對照）'), color: CEW },
        { name: '0050', nav: B.b0050, color: C0050 }], B.b0050),
    });
    $('#twrH').value = h; fillG();
    $('#twrH').onchange = () => { h = $('#twrH').value; fillG(); draw(); };
    $('#twrG').onchange = () => { g = $('#twrG').value; draw(); };
    draw();
  }

  /* ---------- 處置股策略：融資使用率 ≥ 20%｜處置結束後一天開盤賣，只回測新制上路後(股票 › 處置股 › 處置股策略) ---------- */
  // 處置股策略(disp.json)：說明文字與交易明細的條件欄位
  const DISP = {
    disp: { name: '處置股策略', items: B => [
      ['邏輯', '處置前融資使用率高、投信也在加碼的處置股，被處置後關注度仍高，處置期間的漲勢較能延續。'],
      ['進出場', '處置前融資使用率高、投信持股比率增加的處置股，處置第一天收盤買進，處置結束後第一個交易日開盤賣出。']],
      fmt: [v => v.toFixed(1) + '%', v => (v > 0 ? '+' : '') + v.toFixed(2) + ' 個百分點'] },
  };
  async function disp(el, ctx, key = 'disp') {
    const cfg = DISP[key], S = { name: cfg.name, series: 'disp' };
    let [B, full] = await load(el, ctx, key);
    if (!B) return;
    if (B.enc && !(B = await W().unlock(el, ctx, key, B.enc))) return;   // 上鎖的策略：輸入密碼後才解得開(同台股策略頁)
    const feat = v => [].concat(v).map((x, i) => `<td>${x == null ? '—' : cfg.fmt[i](x)}</td>`).join('');
    const T = B.strat;
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), updated: 'tw_research', chart: 'twrBrief', stats: 'twrBriefStats', recent: 'twrRecent', items: [
        ...cfg.items(B), ['停利停損', NO_STOP], ['持有期間', '處置期間。']] })}
      ${full ? reportPanel(S, B.report) : LT.reportLock()}`;
    const $ = s => el.querySelector(s);
    briefChart(el, B.d, T.nav, B.b0050, cfg.name, SERIES[S.series].color);
    const t = T.ts;
    const cards = [
      t.fail ? W().card(`${t.fail.toLocaleString()} 筆`, '收盤漲停買不到', '放棄的處置事件') : '',
      t.nocash ? W().card(`${t.nocash.toLocaleString()} 筆`, '買不起一股而放棄', '現金不夠') : '',
      t.delist ? W().card(`${t.delist} 筆`, '持有期間下市櫃', '以最後收盤價轉現金') : '',
    ].join('');
    // 績效卡片(勝率在最前面)：放在精簡版的累積報酬圖上方
    function draw() {
      const { stats, vs0050Cards, tradeCards } = W();
      $('#twrBriefStats').innerHTML = `${vs0050Cards(stats(T.nav), stats(B.b0050), t)}${tradeCards(t)}${cards}`;
    }
    draw();
    if (!full) return;   // 訪客：只有上半部(近期明細也要登入)
    // 近期明細：主策略的交易，最新的在前，先顯示 20 筆
    // 框起來排最前面：已公告、還沒開始的處置(處置第一天收盤買進)；持有中、處置已經結束的(下個交易日開盤賣出)
    const tag = t => `<span class="next-tag">${t}</span>`, md = d => d.slice(5).replace('-', '/');
    const up = B.upcoming || [], ended = r => !r[6] && r[2].split('～')[1] <= B.asof;
    const row = (r, cls = '', note = '') => `<tr${cls}><td>${LT.stockLink(r[0])}</td><td>${esc(r[1])}${note}</td><td>${esc(r[2].replace(/-/g, '/'))}</td><td>${esc(r[3])}</td>${feat(r[4])}<td>${r[5]}</td>
        <td>${r[6] || '<small class="mute">持有中</small>'}</td><td class="${W().cls(r[7])}">${W().pct(r[7], 2)}</td></tr>`;
    const all = T.trades.slice().reverse();
    $('#twrRecentNote').textContent = `最新進場的在最前面；持有中的報酬以 ${B.asof} 收盤計。${up.length || all.some(ended) ? '框起來的是接下來要買進(處置第一天收盤)或下個交易日開盤要賣出的股票。' : ''}`;
    LT.moreTable($('#twrRecent'), ['代號', '名稱', '處置期間', '處置措施', ...(B.cols || ['融資使用率']), '買進(收盤)', '賣出(開盤)', '報酬'], [
      ...up.map(u => `<tr class="next-act"><td>${LT.stockLink(u[0])}</td><td>${esc(u[1])}${tag(md(u[2]) + ' 收盤買進')}</td><td>${esc((u[2] + '～' + u[3]).replace(/-/g, '/'))}</td><td>${esc(u[4])}</td>${feat(u[5])}<td>—</td><td>—</td><td>—</td></tr>`),
      ...all.filter(ended).map(r => row(r, ' class="next-act"', tag('下個交易日開盤賣出'))),
      ...all.filter(r => !ended(r)).map(r => row(r))]);
    drawFigs(el, { 'cum_return.png': div => navLines(div, B.d, [{ name: cfg.name, nav: T.nav, color: CS[0], width: 2.2 }, { name: '0050 買進持有', nav: B.b0050, color: C0050 }]) });
  }
  /* ---------- 處置期間的 K 棒(disp_kbar.json)：五個時點收紅 K / 黑 K 的比例，新舊制、有沒有當沖條件分開看；不是回測，沒有淨值 ---------- */
  async function dispKbar(el, ctx) {
    const S = { name: '處置期間的 K 棒', series: 'disp' };
    const [B, full] = await load(el, ctx, 'disp_kbar');
    if (!B) return;
    const P = B.points, row = (rule, g, p) => B.rows.find(r => r.rule === rule && r.g === g && r.p === p) || {};
    const cnt = (rule, g = '全部') => (B.info.find(x => x.rule === rule && x.g === g) || {}).n || 0;
    const pc0 = v => Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '—';
    // 數列：{ name, rule, g, color }
    const RULES = [{ name: '舊制', rule: '舊制', g: '全部', color: CEW }, { name: '新制', rule: '新制', g: '全部', color: SERIES.disp.color }];
    const DT = [{ name: '舊制 · 沒有當沖條件', rule: '舊制', g: '沒有當沖條件', color: CEW }, { name: '舊制 · 有當沖條件', rule: '舊制', g: '有當沖條件', color: '#5b6b82' },
      { name: '新制 · 沒有當沖條件', rule: '新制', g: '沒有當沖條件', color: SERIES.disp.color }, { name: '新制 · 有當沖條件', rule: '新制', g: '有當沖條件', color: '#F06FB0' }];
    // 長條圖：五個時點 × 各數列；圖例放在 leg(省略時接在圖的下方)
    const bars = (div, ss, k, leg) => {
      const black = k === 'black';
      LTChart.bars(div, { x: P, xAll: true, xFmt: v => v, label: black ? '收黑 K 的比例' : '當天漲跌中位數', height: 240,
        ...(black ? { yMin: 0, yMax: 1, refY: [{ y: 0.5, color: 'var(--dim)' }] } : { refY: [{ y: 0 }] }),
        yFmt: v => (v * 100).toFixed(black ? 0 : 1) + '%',
        tipFmt: (s, v, i) => { const x = ss.find(t => t.name === s.name); return `${s.name}：${black ? '黑 K ' + pc0(v) : W().pct(v, 2)}(${row(x.rule, x.g, P[i]).n || 0} 檔)`; },
        series: ss.map(s => ({ name: s.name, color: s.color, y: P.map(p => row(s.rule, s.g, p)[k]) })) });
      if (leg) leg.innerHTML = LTChart.legend(ss); else div.insertAdjacentHTML('afterend', LTChart.legend(ss));
    };
    // 研究(不是策略)：精簡版不放績效卡片，改放新制前後(不分組)的圖與表
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', items: [
        ['怎麼比較', '把歷年的每次處置，在處置前一天、處置第一天、第二天、最後一天、出關後第一天收紅 K 還是黑 K 統計出來，新制和舊制分開看。'],
        ['分組', '進處置時有沒有同時達到當沖標準(有的話處置期間比較長)。'],
        ['資料', '上市櫃普通股，含已下市櫃。'],
        ['期間', '從處置資料開始到最新交易日。']] })}
      ${full ? reportPanel(S, B.report) : LT.reportLock()}`;
    const $ = s => el.querySelector(s);
    // 新制前後：時點當列，舊制、新制各兩欄(紅 K / 黑 K、當天漲跌中位數)，檔數用處置第一天有成交的檔數
    $('#twrBriefLegend').insertAdjacentHTML('afterend', `
      <div id="twrBriefChg" style="margin-top:14px;"></div>
      <div class="tablewrap" style="margin-top:14px;"><table class="stattable"><thead><tr><th>時點</th>${RULES.map(s =>
        `<th>${s.name}(${row(s.rule, s.g, '處置第一天').n.toLocaleString()} 檔)紅 K / 黑 K</th><th>漲跌中位數</th>`).join('')}</tr></thead><tbody>
        ${P.map(p => `<tr><td>${p}</td>${RULES.map(s => { const r = row(s.rule, s.g, p);
          return `<td>${pc0(r.red)} / ${pc0(r.black)}</td><td class="${W().cls(r.chg)}">${W().pct(r.chg, 1)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="note">紅 K：收盤 &gt; 開盤；黑 K：收盤 &lt; 開盤；其餘是平盤。漲跌中位數 = 當天收盤 ÷ 前一天收盤 − 1 的中位數。</p>`);
    bars($('#twrBrief'), RULES, 'black', $('#twrBriefLegend'));
    bars($('#twrBriefChg'), RULES, 'chg');
    drawFigs(el, { 'kbar_dt.png': div => bars(div, DT, 'black'), 'chg_dt.png': div => bars(div, DT, 'chg') });
  }
  /* ---------- 跳空與隔夜報酬(資料集 tw_gap 的 gap.json)：依跳空倍數(跳空 ÷ 20 日日報酬標準差)分組的統計；不是回測，沒有淨值 ---------- */
  async function gap(el, ctx, S) {
    const [B, full] = await load(el, ctx, 'gap', 'tw_gap');
    if (!B) return;
    const C = SERIES.gap.color, CP = '#F06FB0';
    const ks = [...B.down, ...B.up];   // 回補與成交量的圖沒有「沒跳空」那一組：左半往下跳、右半往上跳
    const pc = v => Number.isFinite(v) ? W().pct(v, 2) : '—', rate = v => Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '—';
    // 分組長條：ss = [{ name, y, n, color }](n = 各組筆數，滑鼠提示用，可省略)；o.rate = 比例(0～100%)
    const bars = (div, x, ss, o = {}) => {
      LTChart.bars(div, { x, xAll: true, xFmt: v => v, height: 240, label: o.label, title: o.title,
        ...(o.rate ? { yMin: 0, yMax: 1, yFmt: v => (v * 100).toFixed(0) + '%' } : { refY: [{ y: 0 }], yFmt: v => +(v * 100).toFixed(2) + '%' }),
        tipFmt: (s, v, i) => { const t = ss.find(z => z.name === s.name); return `${s.name}：${o.rate ? rate(v) : pc(v)}${t.n ? `(${t.n[i].toLocaleString()} 筆)` : ''}`; },
        series: ss.map(s => ({ name: s.name, color: s.color, y: s.y })) });
      if (o.legend !== false) div.insertAdjacentHTML('afterend', LTChart.legend(ss));
    };
    const ov = [{ name: '全部', y: B.all.ov, n: B.all.n, color: C }, { name: '排除收漲跌停', y: B.nl.ov, n: B.nl.n, color: CEW }];
    // 回到前一天 K 棒的比例：當天、到隔天收盤前兩張
    const fillFig = F => div => {
      div.innerHTML = '<div></div><div style="margin-top:14px;"></div>';
      const ss = j => [{ name: '回到實體 K 棒內', y: F['body' + j], n: F.n, color: C }, { name: '回到 K 棒最低(往上跳)／最高(往下跳)', y: F['far' + j], n: F.n, color: CEW }];
      bars(div.children[0], ks, ss(0), { rate: true, title: '當天', legend: false });
      bars(div.children[1], ks, ss(1), { rate: true, title: '到隔天收盤前' });
    };
    const VOLS = ['量縮', '中等', '爆量'], VC = { 量縮: C, 中等: CEW, 爆量: CP };
    const F = B.fillOv;
    el.innerHTML = `
      ${LT.brief({ hero: heroOf(B, full), chart: 'twrBrief', items: [
        ['怎麼比較', '把每檔股票每天的開盤跳空，除以它近期的波動(標準差)分組，看跳空當天收盤買、隔天開盤賣的隔夜報酬，和沒跳空的日子比較。'],
        ['分組', '跳空當天有沒有收在漲跌停、開在前一天 K 棒外還是 K 棒內、跳空當天的成交量。'],
        ['資料', '上市櫃普通股，含已下市櫃；只看成交量夠大的股票，排除處置股、連續漲跌停與大盤極端的日子。'],
        ['期間', '從資料開始到最新交易日。']] })}
      ${full ? reportPanel(S, B.report) : LT.reportLock()}`;
    const $ = s => el.querySelector(s);
    bars($('#twrBrief'), B.bins, ov, { label: '隔夜平均報酬', legend: false });
    $('#twrBriefLegend').innerHTML = LTChart.legend(ov);
    $('#twrBriefLegend').insertAdjacentHTML('afterend', '<p class="note">隔夜 = 隔天開盤 ÷ 跳空當天收盤 − 1(還原價、未扣成本)。橫軸是跳空倍數 = 跳空 ÷ 20 日日報酬標準差，負的是往下跳，-0.1～0.1 是沒跳空。</p>');
    if (!full) return;   // 訪客：只有上半部
    drawFigs(el, {
      'ov.png': div => bars(div, B.bins, ov, { label: '隔夜平均報酬' }),
      'intra.png': div => bars(div, B.bins, [{ ...ov[0], y: B.all.intra }, { ...ov[1], y: B.nl.intra }], { label: '當天盤中平均報酬' }),
      'fill_out.png': fillFig(B.fill.out),
      'fill_in.png': fillFig(B.fill.in),
      'fill_ov.png': div => bars(div, ks, [{ name: '當天有回到 K 棒內', y: F.back, n: F.nBack, color: C }, { name: '當天沒回到', y: F.stay, n: F.nStay, color: CP },
        { name: '當天沒回到，排除收漲跌停', y: F.stayNl, n: F.nStayNl, color: CEW }], { label: '隔夜平均報酬' }),
      'vol_ov.png': div => bars(div, ks, VOLS.map(q => ({ name: q, y: B.vol[q].ov, color: VC[q] })), { label: '隔夜平均報酬(排除收漲跌停)' }),
      'vol_fill.png': div => bars(div, ks, VOLS.map(q => ({ name: q, y: B.vol[q].fill0, color: VC[q] })), { rate: true, label: '當天回到實體 K 棒內的比例' }),
    });
  }
  window.LTTWR = { disp, dispKbar };
})();
