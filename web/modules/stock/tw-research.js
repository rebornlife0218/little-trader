/* 股票 · 台股 · 其他研究：依主題(營收、因子、事件、機器學習)分類的研究(資料集 tw_research，pipeline/tw_research/update.py)
   最上方選主題，再用下拉式選單選研究；同一系列的研究標同一個顏色。
   淨值與交易統計已在 pipeline 依整數股與交易成本算好(規則同台股策略，根目錄 CLAUDE.md)，網頁端只計算績效統計、畫圖與顯示報告(Markdown)。
   績效統計與圖表共用 tw-strategy.js 的 LTTW。新增研究：pipeline 加一個 <key>.json，這裡的 CATS 加一筆(run = 畫面函式) */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = () => window.LTTW;
  const DATASET = 'tw_research';
  // 系列：同一系列的研究用同一個顏色標記
  const SERIES = { rev: { name: '營收系列', color: 'var(--amber)' } };
  const CATS = [
    { key: 'revenue', name: '營收', desc: '月營收公告前後的股價行為與選股', studies: [
      { key: 'rev_pre', name: '營收公告前布局', series: 'rev', desc: '月底先買進預期營收會好的股票，營收公告後隔天開盤賣出', run: (...a) => revPre(...a) },
      { key: 'rev_growth', name: '營收成長特徵', series: 'rev', desc: '營收年增率 > 10% 公告後，哪些特徵最能區分後續報酬', run: (...a) => revGrowth(...a) },
      { key: 'rev_drop', name: '營收衰退開低', series: 'rev', desc: '營收衰退公告後隔天開低 5% 以上，開盤買進', run: (...a) => revDrop(...a) },
    ] },
    { key: 'factor', name: '因子', desc: '橫斷面因子選股', studies: [] },
    { key: 'event', name: '事件', desc: '特定事件前後的股價表現', studies: [] },
    { key: 'ml', name: '機器學習', desc: '用模型預測報酬', studies: [] },
  ];
  const CAT_KEY = 'lt.twrCat', STUDY_KEY = 'lt.twrStudy';
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無法使用 localStorage */ } };
  const recall = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const tag = s => `<span class="series-tag"><i style="background:${SERIES[s].color}"></i>${esc(SERIES[s].name)}</span>`;

  LT.register({
    section: 'stock', group: '台股', key: 'tw-research', name: '其他研究',
    async mount(el, ctx) {
      const all = CATS.flatMap(c => c.studies);
      let cat = CATS.some(c => c.key === recall(CAT_KEY)) ? recall(CAT_KEY) : 'revenue';
      let study = all.some(s => s.key === recall(STUDY_KEY)) ? recall(STUDY_KEY) : all[0].key;
      const link = (location.hash.split('/')[3] || '').trim();   // 網址 #/stock/tw-research/<研究> 直接開啟該研究
      if (all.some(s => s.key === link)) { study = link; cat = CATS.find(c => c.studies.some(s => s.key === link)).key; }
      el.innerHTML = `
        <header class="top"><div>
          <h1>台股其他研究</h1>
          <p>選擇主題，再從下拉式選單選擇研究；同一個顏色代表同一系列的研究。回測一律和買進持有 0050 比較</p>
        </div></header>
        <div class="panel">
          <div class="mode-tabs twr-cat">${CATS.map(c => `<button class="mode-tab" data-c="${c.key}"><b>${esc(c.name)}</b><small>${c.studies.length ? `${c.studies.length} 份研究` : '努力建置中'}</small></button>`).join('')}</div>
          <div class="paramgrid opt-form twr-pick" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end;">
            <div class="paramitem"><label for="twrStudy">研究</label><select id="twrStudy"></select></div>
            <p class="note" id="twrDesc" style="margin:0 0 8px;"></p>
          </div>
        </div>
        <div id="twrBody"></div>`;
      const body = el.querySelector('#twrBody'), pick = el.querySelector('.twr-pick'), sel = el.querySelector('#twrStudy'), desc = el.querySelector('#twrDesc');
      let seq = 0;   // 每次切換研究加 1：還在載入的舊研究不會蓋掉新選的
      const showStudy = k => {
        study = k; store(STUDY_KEY, k);
        const S = all.find(x => x.key === k);
        sel.value = k; sel.style.color = SERIES[S.series].color;
        desc.innerHTML = `${tag(S.series)} ${esc(S.desc)}`;
        const my = ++seq;
        S.run(body, { alive: () => ctx.alive() && seq === my }, S);
      };
      const showCat = ck => {
        cat = ck; store(CAT_KEY, ck);
        const C = CATS.find(x => x.key === ck);
        el.querySelectorAll('.twr-cat .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.c === ck));
        sel.innerHTML = C.studies.map(s => `<option value="${s.key}" style="color:${SERIES[s.series].color}">● ${esc(s.name)}</option>`).join('');
        pick.style.display = C.studies.length ? '' : 'none';
        if (!C.studies.length) { ++seq; body.innerHTML = LT.UNDER_CONSTRUCTION; return; }
        showStudy(C.studies.some(s => s.key === study) ? study : C.studies[0].key);
      };
      el.querySelector('.twr-cat').onclick = e => { const b = e.target.closest('[data-c]'); if (b && b.dataset.c !== cat) showCat(b.dataset.c); };
      sel.onchange = () => { if (sel.value !== study) showStudy(sel.value); };
      showCat(cat);
    },
  });

  /* ---------- 共用 ---------- */
  async function load(el, ctx, key) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    try {
      const { data } = await LT.loadJSON(DATASET, key + '.json');
      return ctx.alive() ? data : null;
    } catch (e) {
      if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return null;
    }
  }
  // 報告(Markdown)：表格加上站內表格樣式，## → h3、### → h4；圖片 ![說明](xxx.png) 換成依 JSON 畫的圖(網站不放 png，見 drawFigs)
  function md(src) {
    const box = document.createElement('div');
    src = src.replace(/^!\[([^\]]*)\]\(([\w.-]+\.png)\)[ 	]*$/gm, (_, cap, f) => `
<figure class="md-fig twr-fig"><div data-fig="${esc(f)}"></div><figcaption>${esc(cap)}</figcaption></figure>
`);
    box.innerHTML = marked.parse(src);
    box.querySelectorAll('table').forEach(t => { t.classList.add('stattable', 'md-table'); t.outerHTML = `<div class="tablewrap">${t.outerHTML}</div>`; });
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
  // 累積報酬(對數刻度)：lines = [{ name, nav, color, width }]，圖例接在圖的下方
  const LOG_TICKS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  function navLines(div, d, lines) {
    const n = d.length, step = Math.max(1, Math.floor(n / 700)), idx = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    LTChart.line(div, { x: idx.map(i => d[i]), xType: 'date', label: '累積報酬', height: 300, xFmt: (v, tip) => tip ? v : v.slice(0, 4),
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
  const scaleSel = id => `<div class="paramitem"><label for="${id}">走勢圖縱軸</label><select id="${id}"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>`;
  const MONEY = '本金 100 萬元，進場金額除以進場價(含滑價與手續費)無條件捨去到整數股，沒用到的資金持有現金(不計利息)。';
  // 回測規則依台股策略頁的同一套原則：漲跌停、沒有成交、下市櫃的處理
  const RULES = '開盤漲停或沒有成交買不到，延後一天，隔天仍買不到就放棄；要賣出時跌停或沒有成交，延到下一個交易日同一時點再賣(可能連續延後)；持有期間下市櫃，以最後收盤價轉為現金。範圍是上市櫃普通股(不含 ETF、存託憑證)，包含已下市櫃的公司；報酬用還原股價(含除權息)。';
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
      <tr class="allrow"><td>贏 0050 的年數</td>${cols.map((c, j) => `<td>${c.cmp ? `${wins(j)} / ${rows.length}` : '—'}</td>`).join('')}<td>—</td></tr></tbody></table></div>
      <p class="note">紅色越深代表漲越多、綠色越深代表跌越多；粗體底線表示當年贏過 0050。</p>`;
  }
  // 比較表：rows = [{ name, nav, ts, main }]；S = 0050 的 stats
  function compareTable(rows, S) {
    const { stats, pct, cls, beat, totalRet } = W();
    return `<div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>組合</th><th>總報酬</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>索提諾比率</th><th>最大回撤</th><th>最長連續回撤</th><th>交易筆數 / 勝率</th><th>每筆平均 / 中位數</th></tr></thead><tbody>
      ${rows.map(r => { const x = stats(r.nav), t = r.ts;
        return `<tr class="${r.main ? 'allrow' : ''}"><td>${esc(r.name)}</td><td class="${cls(x.mult - 1)} ${beat(x.mult, S.mult)}">${totalRet(x)}</td><td class="${cls(x.ret)} ${beat(x.ret, S.ret)}">${pct(x.ret)}</td>
          <td class="${beat(x.vol, S.vol, false)}">${(x.vol * 100).toFixed(1)}%</td><td class="${beat(x.sharpe, S.sharpe)}">${x.sharpe.toFixed(2)}</td><td class="${beat(x.sortino, S.sortino)}">${x.sortino.toFixed(2)}</td>
          <td class="down ${beat(x.mdd, S.mdd)}">${pct(x.mdd, 1)}</td><td class="${beat(x.ddDays, S.ddDays, false)}">${x.ddDays} 天</td>
          <td>${t ? `${t.n.toLocaleString()} 筆 / ${(t.win * 100).toFixed(0)}%` : '—'}</td><td class="${t ? cls(t.mean) : ''}">${t ? `${pct(t.mean, 2)} / ${pct(t.median, 2)}` : '—'}</td></tr>`; }).join('')}
      <tr><td>0050 買進持有</td><td>${totalRet(S)}</td><td>${pct(S.ret)}</td><td>${(S.vol * 100).toFixed(1)}%</td><td>${S.sharpe.toFixed(2)}</td><td>${S.sortino.toFixed(2)}</td><td class="down">${pct(S.mdd, 1)}</td><td>${S.ddDays} 天</td><td>—</td><td>—</td></tr>
      </tbody></table></div>
      <p class="note">粗體底線表示優於 0050。${W().STAT_NOTE}</p>`;
  }
  const extraCards = t => [
    t.fail ? W().card(`${t.fail.toLocaleString()} 筆`, '開盤漲停買不到', '放棄的訊號') : '',
    t.nocash ? W().card(`${t.nocash.toLocaleString()} 筆`, '現金不足放棄', t.cap ? `每筆上限為總資產的 ${(t.cap * 100).toFixed(0)}%` : '') : '',
    t.delist ? W().card(`${t.delist} 筆`, '持有期間下市櫃', '以最後收盤價轉現金') : '',
  ].join('');

  /* ---------- 營收公告前布局：版本(不限市值、市值四分位) × 前 10 / 前 5 檔 ---------- */
  async function revPre(el, ctx, S) {
    const B = await load(el, ctx, 'rev_pre');
    if (!B) return;
    let ver = 'all', grp = 't10';
    const G = { t10: '前 10 檔', t5: '前 5 檔' };
    el.innerHTML = `
      <div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>規則</b>：營收月份 M 的 21 日(含)之後第一個交易日開盤，買進綜合分數最高的 10 檔或 5 檔；每檔在 M 月營收公告後的第一個交易日開盤賣出(月底後 15 天內沒公告，在 M+1 月 16 日後第一個交易日賣出)。前一個交易日收盤後選股，只用當晚已知的資料。</p>
          <p><b>綜合分數</b>：上月年增、上月年增加速、近 3 月年增、上月月增、連續成長月數(越高越好)與去年同月年增(越低越好)6 個營收因子的百分位平均。<b>市值四分位</b>：每月把合格股票依進場前一日市值切成四等分(Q1 最小、Q4 最大)，只在其中一組裡選股。</p>
          <p><b>資金分配</b>：每檔上限 = 前一天收盤總資產 ÷ 10(或 5)，且不超過現金；同一天依代號順序買進。${MONEY}</p>
        </div>
        <div class="mode-tabs twr-ver" style="margin-top:12px;">${B.versions.map(v => `<button class="mode-tab" data-v="${v.key}"><b>${esc(v.name)}</b><small>${v.key === 'all' ? '全部合格股票' : capTxt(v)}</small></button>`).join('')}</div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
          <div class="paramitem"><label for="twrGrp">組合</label><select id="twrGrp"><option value="t10">前 10 檔</option><option value="t5">前 5 檔</option></select></div>
          ${scaleSel('twrScale')}
        </div>
        <p class="note">${W().COST_NOTE}${RULES}</p>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>所有版本比較(21 日進場)</h3><div id="twrAll"></div></div>
      <div class="panel"><h3>綜合分數十分位(不限市值，21 日進場)</h3><div id="twrDec"></div>
        <p class="note">每月依綜合分數把合格股票分成十組，長條為每筆平均報酬(扣成本)；分數越高，本月營收公布得越好，報酬也越高。</p></div>
      ${reportPanel(S, B.report)}`;
    const $ = s => el.querySelector(s);
    // 市值範圍(每月的最小、最大值)：第一個月 → 最後一個月；Q1 只列上限、Q4 只列下限
    function capTxt(v) {
      const n = v.cap.lo.length, r = i => v.key === 'q1' ? `${Math.round(v.cap.hi[i])} 億以下` : v.key === 'q4' ? `${Math.round(v.cap.lo[i])} 億以上` : `${Math.round(v.cap.lo[i])}～${Math.round(v.cap.hi[i])} 億`;
      return `${v.cap.m[0].slice(0, 4)} 年 ${r(0)} → ${v.cap.m[n - 1].slice(0, 4)} 年 ${r(n - 1)}`;
    }
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts, STAT_NOTE } = W();
      const V = B.versions.find(v => v.key === ver), nav = V.nav[grp], x = stats(nav), Sx = stats(B.b0050), t = V.ts[grp];
      el.querySelectorAll('.twr-ver .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.v === ver));
      const ent = V.entry.filter(r => r.g === G[grp] || r.g === '全部合格股票');
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(V.name)}｜${G[grp]}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx)}${tradeCards(t)}${extraCards(t)}</div>
          <p class="note">${STAT_NOTE}每筆報酬 = 賣出收回金額 ÷ 買進投入金額 − 1(扣成本)；持倉天期以交易日計。</p>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(V.name)}｜${G[grp]} vs 全部合格股票 vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <p class="note">上方為累積報酬(期初 = 1)，下方為回撤(從前一個高點下跌的幅度)，已扣除交易成本；水平的部分是沒有部位、持有現金的期間。「全部合格股票」是參考組：每月把同一組所有合格股票等權買進(不取整數股)。</p>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: G[grp], nav, cmp: true }, { name: '全部合格股票', nav: V.nav.ew }], B.b0050)}
          <h4>進場日敏感度</h4>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>進場日</th><th>組合</th><th>總報酬</th><th>年化報酬</th><th>夏普值</th><th>索提諾比率</th><th>最大回撤</th><th>每筆平均</th></tr></thead><tbody>
            ${ent.map(r => `<tr class="${r.rule === '21日' && r.g === G[grp] ? 'allrow' : ''}"><td>${esc(r.rule.replace('日', ' 日'))}</td><td>${esc(r.g)}</td><td class="${W().cls(r.ret)}">${W().pct(r.ret, 0)}</td><td>${W().pct(r.cagr)}</td><td>${r.sharpe.toFixed(2)}</td><td>${r.sortino.toFixed(2)}</td><td class="down">${W().pct(r.mdd, 1)}</td><td class="${W().cls(r.mean)}">${W().pct(r.mean, 2)}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="note">同樣的選股，進場日從 21 日延到 25 日或月底，報酬快速下降；三種進場日都用同一段期間(${esc(B.d[1])} 起)計算。</p>
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: nav, ew: V.nav.ew, b0050: B.b0050 },
        meta: { s: { name: `${V.name}｜${G[grp]}`, color: SERIES[S.series].color }, ew: { name: '全部合格股票', color: '#94a3b8' }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: $('#twrScale').value === 'log', chart: $('#twrChart'), legend: $('#twrLegend') });
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
    $('#twrScale').onchange = draw;
    draw();
  }

  /* ---------- 營收衰退開低：日內 / T+1 × 全部 / 均額 ≥ 1 千萬 ---------- */
  async function revDrop(el, ctx, S) {
    const B = await load(el, ctx, 'rev_drop');
    if (!B) return;
    let k = B.strats[0].key;
    el.innerHTML = `
      <div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>規則</b>：月營收年增率 < -10% 的公告(月底後 15 天內的首次公告)，公告後第一個交易日(T1)開盤相對前一天收盤跳空 ≤ -5%，T1 開盤買進。<b>日內</b>：T1 收盤賣出；<b>T+1</b>：隔一個交易日開盤賣出。另測事前 20 日平均成交金額 ≥ 1 千萬(可實際交易的股票)的版本。</p>
          <p><b>資金分配</b>：先算出整段期間平均一天持有幾檔(只算有部位的日子)，每筆進場金額上限 = 前一天收盤總資產 ÷ 平均持有檔數，且不超過現金；同一天有多檔訊號時依代號順序進場，現金用完的訊號就放棄。${MONEY}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twrS">策略</label><select id="twrS">${B.strats.map(s => `<option value="${esc(s.key)}">${esc(s.name)}</option>`).join('')}</select></div>
          ${scaleSel('twrScale')}
        </div>
        <p class="note">${W().COST_NOTE}${RULES}開低條件要等 T1 開盤才知道，回測假設能用開盤價(加一個升降單位)買到。</p>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>四種策略比較</h3><div id="twrAll"></div></div>
      ${reportPanel(S, B.report)}`;
    const $ = s => el.querySelector(s);
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts, STAT_NOTE } = W();
      const T = B.strats.find(s => s.key === k), x = stats(T.nav), Sx = stats(B.b0050);
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(T.name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx)}${tradeCards(T.ts)}${extraCards(T.ts)}</div>
          <p class="note">${STAT_NOTE}收盤跌停賣不掉要延後，所以「日內」的平均持倉天期會超過 1 天。</p>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(T.name)} vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每日持有檔數</h4><div id="twrPos"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: T.name, nav: T.nav, cmp: true }], B.b0050)}
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: T.nav, b0050: B.b0050 }, meta: { s: { name: T.name, color: SERIES[S.series].color }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: $('#twrScale').value === 'log', chart: $('#twrChart'), legend: $('#twrLegend') });
      LTChart.line($('#twrPos'), { x: B.d, xType: 'date', label: '持有檔數', height: 150, xFmt: (d, tip) => tip ? d : d.slice(0, 4), yMin: 0,
        yFmt: v => v.toFixed(0), tipFmt: (s, v) => `${v} 檔`, series: [{ name: '持有檔數', color: SERIES[S.series].color, width: 1.2, y: T.npos }] });
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
    $('#twrScale').onchange = draw;
    draw();
  }

  /* ---------- 營收成長特徵：持有期 × 分數組合；事件研究與特徵 IC ---------- */
  async function revGrowth(el, ctx, S) {
    const B = await load(el, ctx, 'rev_growth');
    if (!B) return;
    const HS = [...new Set(B.strats.map(s => s.h))], GS = [...new Set(B.strats.map(s => s.g))];
    let h = '5日', g = '分數 = 3';
    const FN = { 成長: '營收年增率', 月增: '營收月增率', 年增加速: '年增加速', 連續成長月數: '連續年增 > 10% 月數', 公告天數: '公告日距月底天數', 開盤跳空: 'T1 開盤跳空',
      事前5日報酬: '事前 5 日報酬', 事前20日報酬: '事前 20 日報酬', 距60日高點: '距 60 日高點', '市值(億)': '市值', 均額10: '10 日均成交金額', 外資5日買超比: '外資 5 日買超比',
      投信5日買超比: '投信 5 日買超比', '近5日主力買賣超(%)': '近 5 日主力買賣超', 資使用率: '融資使用率' };
    const HN = { 日內: '日內(T1 收盤賣)', 'T+1': 'T+1(T2 開盤賣)', '5日': '5 日(T5 收盤賣)' };
    el.innerHTML = `
      <div class="panel">
        <h3>${esc(S.name)} ${tag(S.series)}</h3>
        <div class="doc">
          <p><b>事件</b>：月營收年增率 > 10% 的公告(月底後 15 天內的首次公告)，事前 10 日平均成交金額 ≥ 1 千萬；公告後第一個交易日(T1)開盤買進。</p>
          <p><b>策略</b>：每個持有期選 IC 最顯著的 3 個特徵，落在有利方向前 40% 就給 1 分(0 ～ 3 分)，比較「全部事件」、「分數 ≥ 2」、「分數 = 3」。</p>
          <p><b>資金分配</b>：每筆進場金額上限 = 前一天收盤總資產 ÷ 平均一天持有檔數，且不超過現金；同一天依代號順序進場，現金用完的訊號就放棄。${MONEY}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twrH">持有期</label><select id="twrH">${HS.map(x => `<option value="${esc(x)}">${esc(HN[x] || x)}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="twrG">組合</label><select id="twrG">${GS.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
          ${scaleSel('twrScale')}
        </div>
        <p class="note">${W().COST_NOTE}${RULES}</p>
      </div>
      <div id="twrView"></div>
      <div class="panel"><h3>所有組合比較</h3><div id="twrAll"></div></div>
      <div class="panel">
        <h3>營收公告前後的累積超額報酬</h3>
        <div id="twrCar"></div><div id="twrCarLegend"></div>
        <p class="note">全部月營收公告依年增率分 8 組，第 -10 日 = 0；超額報酬 = 個股收盤到收盤報酬 − 市值加權市場報酬。描述性的事件研究，<b>未扣交易成本</b>。</p>
      </div>
      <div class="panel">
        <h3>特徵有效性：每月 IC 的 t 值</h3>
        <div id="twrIc"></div>
        <p class="note">IC = 同一個營收月份的事件之間，特徵和報酬(扣成本)的 Spearman 相關，取各月平均再算 t 值；正值代表特徵越大、報酬越高，|t| > 2 視為顯著(粗體)。依 5 日持有期的 |t| 排序，紅色越深代表越正、綠色越深代表越負。</p>
      </div>
      ${reportPanel(S, B.report)}`;
    const $ = s => el.querySelector(s);
    function draw() {
      const { stats, vs0050Cards, tradeCards, vs0050Txt, navCharts, STAT_NOTE } = W();
      const T = B.strats.find(s => s.h === h && s.g === g), x = stats(T.nav), Sx = stats(B.b0050);
      const name = `${HN[h] || h}｜${g}`;
      $('#twrView').innerHTML = `
        <div class="panel">
          <h3>${esc(name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${vs0050Cards(x, Sx)}${tradeCards(T.ts)}${extraCards(T.ts)}</div>
          <p class="note">${STAT_NOTE}</p>
          <ul class="insight"><li>${vs0050Txt(B.d[1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(name)} vs 0050</h4>
          <div id="twrChart"></div><div id="twrLegend"></div>
          <h4>每日持有檔數</h4><div id="twrPos"></div>
          <h4>每年報酬</h4>
          ${yearTableHtml(B.d, [{ name: g, nav: T.nav, cmp: true }], B.b0050)}
        </div>`;
      navCharts({ d: B.d, i0: 0, navs: { s: T.nav, b0050: B.b0050 }, meta: { s: { name, color: SERIES[S.series].color }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: $('#twrScale').value === 'log', chart: $('#twrChart'), legend: $('#twrLegend') });
      LTChart.line($('#twrPos'), { x: B.d, xType: 'date', label: '持有檔數', height: 150, xFmt: (d, tip) => tip ? d : d.slice(0, 4), yMin: 0,
        yFmt: v => v.toFixed(0), tipFmt: (s, v) => `${v} 檔`, series: [{ name: '持有檔數', color: SERIES[S.series].color, width: 1.2, y: T.npos }] });
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
    $('#twrScale').onchange = draw;
    draw();
  }
})();
