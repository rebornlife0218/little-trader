/* ETF · ETF研究(etf/research)：目錄頁(LT.catalog)，依類別分組的研究卡片(RCATS)，點進去是單一研究(etf/research/<研究>)
     投資方式：ARKK 研究(追高的代價)、單筆投入、定期定額、逢低買入(LSI vs DCA vs BTD)
     主動式 ETF：A 系列 ETF 跟單(資料集 etf_research；pipeline/etf_research/update.py；績效統計與圖表共用 tw-strategy.js 的 LTTW)
   共用函式與常存 ETF 資料的載入在 lib.js */
(() => {
  const { esc, pctf, cls, ym, corr, growth, monthly, MIN_NOW, rollingStudy, pctl, TAX, taxCase, best, rateOf } = LTETF;
  const ARKK_REFS = [
    { name: 'Morningstar · ARKK: An Object Lesson in How Not to Invest(Amy C. Arnott，2021-12-21)', url: 'https://www.morningstar.com.au/funds/arkk-an-object-lesson-in-how-not-to-invest' },
    { name: 'WealthManagement · The Top 15 Wealth-Destroying Funds of the Last Decade(引用 Morningstar，2024)', url: 'https://www.wealthmanagement.com/etfs/top-15-wealth-destroying-funds-last-decade' },
  ];

  /* ---------- ETF研究：類別與研究清單(目錄頁的卡片；同一系列同一個顏色) ----------
     新增研究：RCATS 加一筆，study() 裡加上畫面函式；需要資料檔的研究放在資料集 etf_research(pipeline/etf_research/update.py) */
  const RSERIES = { how: { name: '投資方式', color: 'var(--amber)' }, active: { name: '主動式 ETF', color: '#B07CF0' } };
  const RCATS = [
    { key: 'how', name: '投資方式', desc: 'ARKK 研究、單筆 vs 定期定額 vs 逢低買入', studies: [
      { key: 'arkk', name: 'ARKK 研究', series: 'how', desc: '主題型 ETF 追高的代價：基金賺錢，投資人卻賠錢', summary: '基金 5 年年化 +41%，投資人追高進場，實際只賺 +10%' },
      { key: 'lsi', name: '單筆 vs 定期定額 vs 逢低買入', series: 'how', desc: '已經有一筆錢，一次投入、分批投入，還是等下跌再買', summary: '一次投入約 2/3 的時間贏過分批投入，等下跌再買平均更差' },
    ] },
    { key: 'active', name: '主動式 ETF', desc: 'A 系列 ETF 跟單', studies: [
      { key: 'etf_follow', name: 'A 系列 ETF 跟單', series: 'active', desc: '主動式 ETF 每天公布持股，經理人加碼、調整、新納入之後跟著買，有沒有超額報酬', summary: '抱到經理人減碼才賣才有超額報酬，主要來自 00981A；組合起來仍輸 0050' },
    ] },
  ];
  const tagOf = s => `<span class="series-tag"><i style="background:${RSERIES[s].color}"></i>${esc(RSERIES[s].name)}</span>`;

  // 報告(Markdown)：表格加上站內表格樣式，## → h3、### → h4；圖片 ![說明](xxx.png) 換成依 JSON 畫的圖(網站不放 png)
  function md(src) {
    const box = document.createElement('div');
    src = src.replace(/^!\[([^\]]*)\]\(([\w.-]+\.png)\)[ \t]*$/gm, (_, cap, f) => `
<figure class="md-fig twr-fig"><div data-fig="${esc(f)}"></div><figcaption>${esc(cap)}</figcaption></figure>
`);
    box.innerHTML = marked.parse(src);
    LT.mdTables(box);
    const retag = (s, tagName, c) => box.querySelectorAll(s).forEach(h => { const e = document.createElement(tagName); e.className = c; e.innerHTML = h.innerHTML; h.replaceWith(e); });
    retag('h3', 'h4', 'md-h3');
    retag('h2', 'h3', 'md-h2');
    box.querySelectorAll('a').forEach(a => { if (!/^https?:/.test(a.getAttribute('href') || '')) a.replaceWith(...a.childNodes); });
    return box.innerHTML;
  }

  /* ---------- ETF研究 · A 系列 ETF 跟單(資料集 etf_research；淨值與交易統計已在研究程式算好，網頁只算績效統計、畫圖與顯示報告) ---------- */
  const MC = { 加碼: 'var(--amber)', 調整: '#B07CF0', 新納入: '#5fd0c5' };   // 三種模式的顏色
  const fade = c => `color-mix(in srgb, ${c} 35%, transparent)`;
  // 績效統計同 LTTW.stats，只有夏普值改用日報酬平均 ÷ 標準差 × √252
  function statsC(nav) {
    const x = window.LTTW.stats(nav), r = [];
    for (let i = 1; i < nav.length; i++) r.push(nav[i] / nav[i - 1] - 1);
    const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
    return { ...x, sharpe: m / sd * Math.sqrt(252) };
  }
  async function etfFollow(el, alive) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B;
    try { B = (await LT.loadJSON('etf_research', 'etf_follow.json')).data; } catch (e) {
      if (alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return;
    }
    if (!alive()) return;
    const W = window.LTTW, pct = W.pct, $ = s => el.querySelector(s);
    const MODES = ['加碼', '調整', '新納入'], GROUPS = [...new Set(B.strats.map(s => s.group))];
    const HN = { 跟單出場: '跟單出場(ETF 減碼或剔除，隔天開盤賣)', '20日': '持有 20 日(收盤賣)', '5日': '持有 5 日(收盤賣)' };
    const hname = h => h === '跟單出場' ? '跟單出場' : '持有 ' + h.replace('日', ' 日');
    const SK = (m, g, h) => B.strats.find(s => s.mode === m && s.group === g && s.hold === h);
    const sub = T => B.b0050s[`${T.mode}｜${T.group}`];   // 和策略同一個期初的 0050(期初現金，隔天開盤買進)
    let mode = '加碼', group = '全部', hold = '跟單出場';
    el.innerHTML = `
      ${LT.brief({ chart: 'efBrief', stats: 'efBriefStats', items: [
        ['邏輯', '主動式 ETF 每天公布持股；經理人加碼某檔股票時跟著買，看能不能賺到經理人選股的報酬。'],
        ['進出場', 'ETF 公布加碼後的隔天開盤買進；等這檔 ETF 之後減碼或剔除時，隔天開盤賣出(跟單出場)。'],
        ['停利停損', '不設停利停損，跟著經理人的動作出場。'],
        ['持有期間', '到經理人減碼為止(平均約 3 ～ 4 週)；另比較固定持有 5 日、20 日。']] })}
      <div class="panel">
        <h3>A 系列 ETF 跟單 ${tagOf('active')}</h3>
        <div class="doc">
          <p><b>資料</b>：${B.etfs.length} 檔主動式 ETF(${B.etfs.map(e => `${e.code} ${esc(e.name)}`).join('、')})每天公布的持股，從各自上市日到 ${B.asof.replace(/-/g, '/')}。日期 D 的持股是 D 收盤後的部位，假設 D 收盤後就看得到。</p>
          <p><b>訊號</b>：同一檔 ETF 前後兩個揭露日比較。<b>加碼</b> = 權重上升(至少 0.01 個百分點)且股數增加；<b>調整</b> = 權重上升但股數沒有增加(多半是股價漲多)；<b>新納入</b> = 前一天沒有、這天有。上市後前 10 個揭露日不算訊號。</p>
          <p><b>進出場</b>：D+1 開盤買進。<b>跟單出場</b>：這檔 ETF 之後第一次減碼(股數減少)或剔除的揭露日 D'，D'+1 開盤賣出；同一天有多家 ETF 時，任何一家減碼就賣。另比較持有 5 日、20 日(收盤賣)。<b>同日 ≥ 2 家</b> = 同一天有 2 家以上 ETF 對同一檔股票做同樣的動作。</p>
          <p><b>資金分配</b>：本金 100 萬元，每檔上限 = 前一天收盤總資產 ÷ 平均一天持有檔數；有新股票進場的那天，所有部位調整到 min(上限, 1 ÷ 持有檔數)(先減碼、再進場、最後補足，都以整數股調整)；現金不夠時新股票平分剩下的現金；同一檔持有中不重複進場，沒用到的資金持有現金(不計利息)。</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="efMode">模式</label><select id="efMode">${MODES.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="efGroup">範圍</label><select id="efGroup"></select></div>
          <div class="paramitem"><label for="efHold">出場</label><select id="efHold">${Object.keys(HN).map(h => `<option value="${h}">${esc(HN[h])}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="efScale">走勢圖縱軸</label><select id="efScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
        </div>
      </div>
      <div id="efView"></div>
      <div class="panel"><h3>所有策略比較</h3><div id="efAll"></div></div>
      <div class="panel">
        <h3>研究報告 ${tagOf('active')}</h3>
        <div class="doc">${md(B.report)}</div>
      </div>`;
    const extra = t => [
      t.fail ? W.card(`${t.fail.toLocaleString()} 筆`, '開盤漲停買不到', '放棄的訊號') : '',
      t.nocash ? W.card(`${t.nocash.toLocaleString()} 筆`, '買不起一股而放棄', `每檔上限為總資產的 ${(t.cap * 100).toFixed(1)}%`) : '',
      t.delist ? W.card(`${t.delist} 筆`, '持有期間下市櫃', '以最後收盤價轉現金') : '',
    ].join('');
    const yearHtml = (T, b) => `<div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th><th>策略</th><th>0050</th></tr></thead><tbody>
      ${W.yearTable(B.d, T.i0, T.nav, b).slice().reverse().map(r => `<tr><td>${r.label}</td>${W.heat(r.r, r.r > r.b)}${W.heat(r.b, false)}</tr>`).join('')}</tbody></table></div>`;
    const allTable = cur => `<div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>策略</th><th>期間</th><th>勝率</th><th>總報酬</th><th>年化報酬</th><th>夏普值</th><th>最大回撤</th><th>交易筆數</th><th>每筆平均 / 中位數</th><th>平均持倉天期</th><th>0050 總報酬 / 夏普值</th></tr></thead><tbody>
      ${B.strats.map(T => { const x = statsC(T.nav), Sx = statsC(sub(T)), t = T.ts;
        return `<tr class="${T === cur ? 'allrow' : ''}" data-k="${esc(T.key)}" style="cursor:pointer"><td>${esc(`${T.mode}｜${T.group}｜${hname(T.hold)}`)}</td><td>${B.d[T.i0 + 1].replace(/-/g, '/')} 起</td>
          <td>${(t.win * 100).toFixed(0)}%</td><td class="${W.cls(x.mult - 1)} ${W.beat(x.mult, Sx.mult)}">${W.totalRet(x)}</td><td class="${W.cls(x.ret)} ${W.beat(x.ret, Sx.ret)}">${pct(x.ret)}</td>
          <td class="${W.beat(x.sharpe, Sx.sharpe)}">${x.sharpe.toFixed(2)}</td><td class="down ${W.beat(x.mdd, Sx.mdd)}">${pct(x.mdd, 1)}</td>
          <td>${t.n.toLocaleString()} 筆</td><td class="${W.cls(t.mean)}">${pct(t.mean, 2)} / ${pct(t.median, 2)}</td><td>${t.days.toFixed(1)} 天</td>
          <td>${W.totalRet(Sx)} / ${Sx.sharpe.toFixed(2)}</td></tr>`; }).join('')}</tbody></table></div>`;
    const fillGroup = () => {
      const gs = GROUPS.filter(g => SK(mode, g, hold));
      if (!gs.includes(group)) group = gs[0];
      $('#efGroup').innerHTML = gs.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
      $('#efMode').value = mode; $('#efGroup').value = group; $('#efHold').value = hold;
    };
    function draw() {
      const T = SK(mode, group, hold), x = statsC(T.nav), b = sub(T), Sx = statsC(b), name = `${mode}｜${group}｜${hname(hold)}`;
      $('#efView').innerHTML = `
        <div class="panel">
          <h3>${esc(name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${W.vs0050Cards(x, Sx, T.ts)}${W.tradeCards(T.ts)}${extra(T.ts)}</div>
          <ul class="insight"><li>${W.vs0050Txt(B.d[T.i0 + 1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(name)} vs 0050</h4>
          <div id="efChart"></div><div id="efLegend"></div>
          <h4>每年報酬</h4>
          ${yearHtml(T, b)}
        </div>`;
      W.navCharts({ d: B.d, i0: T.i0, navs: { s: T.nav, b0050: b }, meta: { s: { name, color: MC[mode] }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: $('#efScale').value === 'log', chart: $('#efChart'), legend: $('#efLegend'), xFmt: (v, tip) => tip ? v : v.slice(0, 7).replace('-', '/') });
      $('#efAll').innerHTML = allTable(T);
    }
    $('#efMode').onchange = () => { mode = $('#efMode').value; fillGroup(); draw(); };
    $('#efGroup').onchange = () => { group = $('#efGroup').value; draw(); };
    $('#efHold').onchange = () => { hold = $('#efHold').value; fillGroup(); draw(); };
    $('#efScale').onchange = draw;
    {   // 精簡版的累積報酬圖：加碼｜全部｜跟單出場 vs 0050
      const T0 = SK('加碼', '全部', '跟單出場') || B.strats[0];
      $('#efBriefStats').innerHTML = W.vs0050Cards(statsC(T0.nav), statsC(sub(T0)), T0.ts) + W.tradeCards(T0.ts) + extra(T0.ts);
      W.navCharts({ d: B.d, i0: T0.i0, navs: { s: T0.nav, b0050: sub(T0) }, meta: { s: { name: `${T0.mode}｜${T0.group}｜${hname(T0.hold)}`, color: MC[T0.mode] }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: true, chart: $('#efBrief'), legend: $('#efBriefLegend'), xFmt: (v, tip) => tip ? v : v.slice(0, 7).replace('-', '/') });
    }
    $('#efAll').onclick = e => { const r = e.target.closest('tr[data-k]'); if (!r) return; [mode, group, hold] = r.dataset.k.split('｜'); fillGroup(); draw(); $('#efView').scrollIntoView({ behavior: 'smooth' }); };
    fillGroup(); draw();

    /* 報告裡的圖：依 JSON 重畫；長條實心 = |t| ≥ 2，淡色 = 不顯著 */
    const sigBars = (div, xs, series, height = 220) => LTChart.bars(div, { x: xs, xAll: true, xFmt: v => v, label: '每筆平均超額報酬', height, refY: [{ y: 0 }],
      yFmt: v => (v * 100).toFixed(1) + '%', tipFmt: (s, v, i) => `${pct(v, 2)}(t = ${Number.isFinite(s.t[i]) ? s.t[i].toFixed(1) : '—'})`,
      series: series.map(s => ({ name: s.name, y: s.v, t: s.t, color: s.color, colors: s.v.map((_, i) => Math.abs(s.t[i]) >= 2 ? s.color : fade(s.color)) })) });
    // 一張圖可以有上下幾個子圖：parts = [{ title, x, series }]，圖例放最後
    const figBars = (div, parts) => {
      div.innerHTML = parts.map((p, i) => `${p.title ? `<p class="note" style="text-align:left;margin:10px 0 2px;"><b>${esc(p.title)}</b></p>` : ''}<div data-part="${i}"></div>`).join('');
      parts.forEach((p, i) => sigBars(div.querySelector(`[data-part="${i}"]`), p.x, p.series));
      div.insertAdjacentHTML('beforeend', LTChart.legend(parts[0].series));
    };
    const pick = (rows, f, keys, val = 'mean', tv = 't') => keys.map(k => { const r = rows.find(x => f(x, k)); return r && r.n !== undefined && r.n < 20 ? { v: null, t: null } : r ? { v: r[val], t: r[tv] } : { v: null, t: null }; });
    const ser = (name, color, pts) => ({ name, color, v: pts.map(p => p.v), t: pts.map(p => p.t) });
    const HOLDS = ['1日', '5日', '10日', '20日', '跟單出場'], HX = ['1 日', '5 日', '10 日', '20 日', '跟單出場'];
    const KS = ['1 家', '2 家', '3 家以上'];
    const ETFS = B.etfs.map(e => e.code);
    const ENT = [...new Set(B.entry.map(r => r.entry))];
    const navFull = T => Array(T.i0).fill(1).concat(T.nav);   // 開始前持有現金
    const LOG_TICKS = [0.5, 1, 1.5, 2, 2.5, 3].map(v => Math.log10(v));
    const figs = {
      'holding.png': div => figBars(div, [{ x: HX, series: MODES.map(m => ser(m, MC[m], pick(B.holding, (r, h) => r.mode === m && r.hold === h, HOLDS))) }]),
      'consensus.png': div => figBars(div, ['跟單出場', '20日'].map(h => ({ title: hname(h), x: KS,
        series: MODES.map(m => ser(m, MC[m], pick(B.consensus, (r, k) => r.by === '同一天' && r.mode === m && r.k === k && r.hold === h, KS)))}))),
      'by_etf.png': div => figBars(div, ['跟單出場', '20日'].map(h => ({ title: hname(h), x: [...ETFS, '全部'],
        series: MODES.map(m => ser(m, MC[m], [...pick(B.by_etf, (r, e) => r.etf === e && r.mode === m && r.hold === h, ETFS), ...pick(B.holding, (r, k) => r.mode === m && r.hold === k, [h])]))}))),
      'extra_entry.png': div => figBars(div, [['mean', 't', '跟單出場'], ['mean20', 't20', '持有 20 日']].map(([v, t, title]) => ({ title, x: ENT,
        series: MODES.map(m => ser(m, MC[m], pick(B.entry, (r, k) => r.group === `${m}｜全部` && r.entry === k, ENT, v, t)))}))),
      'extra_flow.png': div => figBars(div, ['淨股數變化', '權重增加'].map(by => { const R = B.flow.filter(r => r.by === by && r.mode === '加碼'), xs = R.map(r => r.bin);
        return { title: by === '淨股數變化' ? '加碼：扣掉申贖後的淨股數變化' : '加碼：權重增加(百分點)', x: xs,
          series: [ser('跟單出場', MC.加碼, pick(R, (r, k) => r.bin === k, xs)), ser('持有 20 日', 'var(--blue)', pick(R, (r, k) => r.bin === k, xs, 'mean20', 't20'))] }; })),
      'extra_ex81.png': div => figBars(div, [['mean', 't', '跟單出場'], ['mean20', 't20', '持有 20 日']].map(([v, t, title]) => ({ title, x: MODES,
        series: [['全部 10 檔', 'var(--amber)'], ['拿掉 00981A', 'var(--blue)'], ['只有 00981A', '#B07CF0']].map(([sc, c]) =>
          ser(sc, c, pick(B.ex81, (r, m) => r.scope === sc && r.mode === m && r.k === '全部', MODES, v, t))) }))),
      'extra_consensus_exit.png': div => { const xs = ['加碼｜同日 2 家', '加碼｜同日 ≥ 3 家', '調整｜同日 2 家', '調整｜同日 ≥ 3 家'];
        figBars(div, [{ x: xs, series: [['任何一家減碼就賣', 'var(--amber)'], ['各家分別跟（平均）', 'var(--blue)'], ['全部都減碼才賣', '#B07CF0']].map(([rl, c]) =>
          ser(rl.replace('（', '(').replace('）', ')'), c, pick(B.cexit, (r, k) => `${r.mode}｜${r.k}` === k && r.rule === rl, xs))) }]); },
      'cum_return.png': div => {
        const L = [['加碼｜全部｜跟單出場', 'var(--amber)', 2.4], ['加碼｜全部｜20日', '#F06FB0'], ['加碼｜同日 ≥ 2 家｜20日', '#B07CF0'], ['調整｜全部｜20日', '#5fd0c5'],
          ['加碼｜拿掉 00981A｜跟單出場', '#94a3b8']].map(([k, color, width]) => { const T = B.strats.find(s => s.key === k); return T && { name: `${T.mode}｜${T.group}｜${hname(T.hold)}`, nav: navFull(T), color, width }; }).filter(Boolean);
        L.push({ name: '0050 買進持有', nav: B.b0050, color: 'var(--blue)', width: 2 });
        LTChart.line(div, { x: B.d, xType: 'date', label: '累積報酬', height: 300, xFmt: (v, tip) => tip ? v : v.slice(0, 7).replace('-', '/'),
          yFmt: v => pct(10 ** v - 1, 0), tipFmt: (s, v) => pct(10 ** v - 1, 1), yTicks: () => LOG_TICKS, refY: [{ y: 0 }],
          series: L.map(l => ({ name: l.name, color: l.color, width: l.width || 1.6, y: l.nav.map(v => Math.log10(v)) })) });
        div.insertAdjacentHTML('afterend', LTChart.legend(L));
      },
    };
    el.querySelectorAll('.twr-fig [data-fig]').forEach(div => { const f = figs[div.dataset.fig]; if (f) f(div); else div.parentElement.remove(); });
  }

  // 單一研究：ARKK、LSI 用常存 ETF 的資料(lib.js 的 load)，A 系列 ETF 跟單用自己的資料集
  async function study(el, ctx, key) {
    if (key === 'etf_follow') return etfFollow(el, ctx.alive);
    el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入資料…</p></div></div>`;
    const { C, E, twList, MO, failed } = await LTETF.load();
    if (!ctx.alive()) return;
    const $ = s => el.querySelector(s);
    ({ arkk: arkkView, lsi: lsiView })[key](el);

    function arkkView(body) {
      if (!C || !E) { body.innerHTML = failed; return; }
      body.innerHTML = `
        ${LT.brief({ chart: 'pkArkkChart', items: [
          ['邏輯', '熱門主題型 ETF 大漲後，資金大量湧入；比較基金帳面上的報酬，和投資人實際賺到的報酬差多少。'],
          ['怎麼比較', '基金報酬 = 一開始買進後一直抱著；投資人報酬 = 依照資金實際流入流出的時間計算。'],
          ['資料', '晨星(Morningstar)的研究數字，加上 ARKK 的月底還原股價。'],
          ['期間', '截至 2021 年 11 月的 5 年，以及截至 2023 年的 10 年。']] })}
        <div class="panel">
          <h3>ARKK 研究：基金賺錢，投資人卻賠錢 ${tagOf('how')}</h3>
          <div class="doc">
            <blockquote><p><b>一句話結論</b>：ARKK 基金本身 5 年年化 +41.3%，但多數投資人在大漲後才追高買進，同期實際只賺到年化 +9.9%；主題型 ETF 追高的代價很大。</p></blockquote>
            <h3 class="md-h2">一、研究目的</h3>
            <p>ARK Innovation ETF(ARKK)是美國最知名的主題型 ETF，2020 年大漲後吸引大量資金湧入，接著在 2021～2022 年大幅下跌。這份整理要看：基金帳面上的報酬，和投資人實際拿到的報酬差多少？為什麼？</p>
            <h3 class="md-h2">二、資料處理</h3>
            <ul>
              <li><b>研究數字</b>：引用晨星(Morningstar)分析師 Amy C. Arnott 的研究(2021-12-21)，以及晨星截至 2023 年的 10 年「毀損投資人財富」研究。</li>
              <li><b>股價</b>：ARKK 的還原股價(美元，含配息)取月底資料。</li>
            </ul>
            <h3 class="md-h2">三、研究方法</h3>
            <ul>
              <li><b>基金報酬</b>(時間加權)：假設一開始投入後一直持有，是基金公布的報酬。</li>
              <li><b>投資人報酬</b>(金額加權)：考慮資金何時流入、流出，代表所有投資人合計實際賺到的報酬。兩者的差距就是「進出場時機」造成的。</li>
            </ul>
            <h3 class="md-h2">四、實證結果與分析</h3>
          </div>
          <div class="doc">
            <div class="tablewrap"><table class="stattable">
              <thead><tr><th>研究</th><th>期間</th><th>基金報酬</th><th>投資人報酬</th></tr></thead>
              <tbody>
                <tr><td>Morningstar(2021-12-21)</td><td>截至 2021-11 的 5 年(年化)</td><td class="up">+41.3%</td><td class="up">+9.9%</td></tr>
                <tr><td>Morningstar(2021-12-21)</td><td>截至 2021-11 的 1 年</td><td class="down">−4.3%</td><td class="down">約 −12%</td></tr>
              </tbody>
            </table></div>
            <ul>
              <li><b>為什麼差這麼多</b>：大部分資金是在大漲之後、接近高點時才買進，緊接著遇到大跌；早期少數人賺到的大漲，多數投資人並沒有參與到。</li>
              <li><b>財富毀損</b>：晨星另一份研究(截至 2023 年的 10 年)估計，ARKK 讓投資人損失約 71 億美元，名列「毀損最多投資人財富的基金」第 3 名；ARK 旗下基金合計約 143 億美元，是損失最多的基金公司。</li>
            </ul>
            <h3 class="md-h2">五、結論</h3>
            <ul>
              <li><b>三位數的報酬不會持續</b>：熱門主題大漲後湧入的資金，常常剛好遇到下跌。</li>
              <li><b>要先了解風險</b>：主題型 ETF 集中在單一題材，波動和回撤都比市值型 ETF 大。</li>
              <li><b>考慮定期定額</b>：分批投入可以避免一次在高點投入大筆資金(單筆和分批的比較見「單筆 vs 定期定額 vs 逢低買入」)。</li>
            </ul>
            <p class="mute" style="font-size:12px;">資料來源：${ARKK_REFS.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)}</a>`).join('；')}。上圖為 ARKK 的還原股價(美元)，研究數字引用自原文。</p>
          </div>
        </div>`;
      const ak = MO.ARKK;
      if (ak) {
        const peakI = ak.a.reduce((b, v, i) => v > ak.a[b] ? i : b, 0);
        LTChart.line($('#pkArkkChart'), { x: ak.m, xType: 'date', label: 'ARKK 還原股價', height: 240, xFmt: (m, tip) => tip ? ym(m) : m.slice(2).replace('-', '/'),
          yFmt: v => '$' + Math.round(v), tipFmt: (s, v) => '$' + v.toFixed(2), series: [{ name: 'ARKK', y: ak.a, color: 'var(--amber)' }],
          points: [{ x: ak.m[peakI], y: ak.a[peakI], color: 'var(--up)', label: `高點 ${ym(ak.m[peakI])}` }] });
      }
    }
    function lsiView(body) {
      if (!C || !E) { body.innerHTML = failed; return; }
      body.innerHTML = `
        ${LT.brief({ stats: 'rsStats', chart: 'rsLine', items: [
          ['邏輯', '手上已經有一筆錢：一次投入、分好幾個月慢慢投入，還是等市場下跌再買，哪一種長期比較好？'],
          ['怎麼比較', '每個月都當成一個起點，三種做法各自持有到期間結束，比較年化報酬。'],
          ['資料', '國外 6 個國家的研究，加上台股加權報酬指數(含股息)自己驗證。'],
          ['期間', '持有 5、10、20 年或到現在，可以在下方調整。']] })}
        <div class="panel">
          <h3>單筆投入、定期定額、逢低買入(LSI vs DCA vs BTD) ${tagOf('how')}</h3>
          <div class="doc">
            <blockquote><p><b>一句話結論</b>：已經有一筆錢時，一次投入大約 2/3 的時間贏過分批投入(定期定額)，等下跌才買(逢低買入)平均更差；怕一次投入的波動，不如先調低股票比重再一次投入。</p></blockquote>
            <h3 class="md-h2">一、研究目的</h3>
            <p>手上已經有一筆錢，要一次投入、分批投入，還是等市場下跌再買？這份研究整理國外研究的結論，並用台股自己驗證。三種做法：</p>
            <ul>
              <li><b>單筆投入</b>(Lump Sum Investing，LSI)：手上有一筆錢，一次全部投入。</li>
              <li><b>定期定額</b>(Dollar-Cost Averaging，DCA)：把同一筆錢分成幾份(例如 12 個月)分批投入，沒投入的錢先放現金。</li>
              <li><b>逢低買入</b>(Buy the Dip，BTD)：拿著現金等市場從高點下跌一定幅度(例如 10%、20%)再一次投入，帶有擇時的意味。</li>
            </ul>
            <p>注意：這裡比較的是「<b>已經有一筆錢</b>，要怎麼進場」；每個月薪水入帳就投入的定期定額，其實是有錢就馬上投入，等同單筆投入。</p>
            <h3 class="md-h2">二、資料處理</h3>
            <ul>
              <li><b>國外研究</b>：引用 PWL Capital(Ben Felix，2020；Felix 與 Warwick，2021)與 Vanguard(2012)的研究結果。</li>
              <li><b>台股驗證</b>：加權報酬指數(2003 起，含股息)、加權指數(1999 起，不含股息)與常存 ETF 的還原股價，都取月底資料；最後一個月還沒結束時只用完整月份。</li>
            </ul>
            <h3 class="md-h2">三、研究方法</h3>
            <ul>
              <li><b>滾動期間</b>：每個月都當成一個起點，比較持有到期間結束的年化報酬，統計單筆贏過其他做法的比例。</li>
              <li><b>定期定額</b>每月投入 1/N；<b>逢低買入</b>在指數從歷史高點下跌達門檻的那個月一次投入，期間內沒跌到門檻就一直拿著現金；等待中的現金依設定的年利率計息(細節見下方說明)。</li>
            </ul>
            <h3 class="md-h2">四、實證結果與分析</h3>
            <h4 class="md-h3">1. 國外研究：單筆約 2/3 的時間贏</h4>
            <p>PWL Capital 的 Ben Felix(2020)用 6 個國家的股市，比較每個月起點的<b>滾動 10 年</b>結果：定期定額分 12 個月投入、等待中的現金賺一個月國庫券利息。</p>
          </div>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>市場</th><th>美國</th><th>英國</th><th>加拿大</th><th>德國</th><th>澳洲</th><th>日本</th><th>六國平均</th></tr></thead>
            <tbody><tr><td>單筆贏過定期定額的比例</td><td>70.59%</td><td>68.18%</td><td>66.10%</td><td>64.95%</td><td>61.86%</td><td>57.53%</td><td><b>64.89%</b></td></tr></tbody>
          </table></div>
          <div class="doc" style="margin-top:10px;">
            <ul>
              <li><b>單筆約 2/3 的時間贏過定期定額</b>，年化報酬平均多 0.38%。Vanguard(2012)在美國、英國、澳洲的研究也得到約 2/3 的結果。</li>
              <li><b>為什麼</b>：股市長期的預期報酬(風險溢酬)為正，大部分月份是上漲的，錢越晚進場，錯過的報酬越多；定期定額等於前幾個月有一部分資金沒有參與市場。</li>
              <li><b>熊市、股市高檔時也一樣</b>：研究也檢驗了熊市與席勒本益比(CAPE)處於高檔的時期，單筆的勝率仍然較高——大跌後的反彈常常比下跌更猛，創新高之後也傾向繼續上漲，分批進場不一定能攤平成本。</li>
              <li><b>逢低買入</b>：Felix 與 Warwick(2021)以總報酬指數下跌 10%、20% 為進場訊號比較，逢低買入的平均年化報酬明顯落後單筆投入，門檻越深落後越多；它確實改善了最差的情況，但那是因為平均持有大量現金(風險較低)換來的。</li>
              <li><b>行為面</b>：很多人仍偏好定期定額，因為「行動後虧損」的後悔比「沒行動錯過」更痛苦，分批投入可以降低心理壓力。研究的建議是：如果怕一次投入的波動，代表目前的股票比重太高，與其分批進場，不如<b>選一個承受得了的資產配置(例如股債比例)後一次投入</b>——分批進場投完後，承擔的風險還是一樣。</li>
            </ul>
          </div>
          <h4>2. 用台股自己驗證</h4>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
            <div class="paramitem"><label for="rsSeries">標的</label><select id="rsSeries">${E && E.taiex_tr ? '<option value="taiex_tr">加權報酬指數(2003 起，含股息)</option>' : ''}${E && E.taiex ? '<option value="taiex">加權指數(1999 起，不含股息)</option>' : ''}${twList.map(x => `<option value="${x.code}" ${x.code === '0050' && !(E && (E.taiex || E.taiex_tr)) ? 'selected' : ''}>${x.code} ${esc(x.name)}(含股息)</option>`).join('')}</select></div>
            <div class="paramitem"><label for="rsH">持有期間</label><select id="rsH"><option value="5">5 年</option><option value="10" selected>10 年</option><option value="20">20 年</option><option value="0">至今(持有到最新)</option></select></div>
            <div class="paramitem"><label for="rsN">定期定額分幾個月</label><select id="rsN"><option value="6">6 個月</option><option value="12" selected>12 個月</option><option value="24">24 個月</option></select></div>
            <div class="paramitem"><label for="rsCash">現金年利率(%)</label><input id="rsCash" type="number" min="0" max="10" step="0.1" value="1.5"></div>
          </div>
          <div class="tablewrap"><table class="stattable" id="rsTable"></table></div>
          <h4>每個起點的年化報酬差(單筆 − 定期定額)</h4>
          <div id="rsHist"></div>
          <ul class="insight" id="rsInsight"></ul>
          <div class="doc">
            <h3 class="md-h2">五、結論</h3>
            <ul>
              <li><b>單筆投入的勝率較高</b>：國外研究約 2/3 的時間贏過定期定額，台股的結果見上方(可以調整標的與持有期間)。</li>
              <li><b>逢低買入平均更差</b>：門檻越深，拿著現金的時間越長，錯過的漲幅越多。</li>
              <li><b>怕波動就調整資產配置</b>：與其分批進場，不如選一個承受得了的股債比例後一次投入。</li>
            </ul>
            <p class="mute" style="font-size:12px;">資料來源：<a href="https://www.pwlcapital.com/resources/dollar-cost-averaging-vs-lump-sum-investing/" target="_blank" rel="noopener">PWL Capital · Dollar-Cost Averaging vs Lump Sum Investing(Ben Felix，2020)</a>；<a href="https://pwlcapital.com/buy-the-dip/" target="_blank" rel="noopener">PWL Capital · Buy the Dip(Felix &amp; Warwick，2021)</a>；<a href="https://www.betashares.com.au/insights/lump-sum-investment/" target="_blank" rel="noopener">Betashares 整理</a>。</p>
          </div>
        </div>`;
      const seriesOf = key => {
        if (key === 'taiex' || key === 'taiex_tr') {   // 加權指數 / 報酬指數：日資料 → 月底
          const tx = E[key], mo = monthly({ d: tx.d, c: tx.c, a: tx.c });
          return { m: mo.m, v: mo.a };
        }
        const mo = MO[key]; return { m: mo.m, v: mo.a };
      };
      const drawRolling = () => {
        const S = seriesOf($('#rsSeries').value), H = +$('#rsH').value, N = +$('#rsN').value, cash = Math.max(0, +$('#rsCash').value || 0) / 100;
        // 最後一個月可能還沒結束，只用完整月份
        const full = S.m[S.m.length - 1] === new Date().toISOString().slice(0, 7) ? S.m.length - 1 : S.m.length;
        const P = S.v.slice(0, full), M = S.m.slice(0, full);
        const R = rollingStudy(P, H, N, [0.10, 0.20], cash);
        if (R.length < 12) { $('#rsStats').innerHTML = `<p class="mute">資料不足：持有 ${H} 年需要比 ${H} 年多至少一年的資料，請改選較短的持有期間或歷史較長的標的。</p>`; $('#rsTable').innerHTML = ''; $('#rsHist').innerHTML = ''; $('#rsLine').innerHTML = ''; $('#rsInsight').innerHTML = ''; return; }
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        const strat = [['lsi', '單筆投入', x => x.lsi], ['dca', `定期定額(${N} 個月)`, x => x.dca], ['b10', '逢低買入(跌 10%)', x => x.btd[0]], ['b20', '逢低買入(跌 20%)', x => x.btd[1]]];
        const diff = f => R.map(x => x.lsi - f(x));
        const EPS = 1e-9;   // 兩者相同(例如起點就已經跌超過門檻，逢低買入立刻進場)不算輸贏
        const tally = f => { const w = R.filter(x => x.lsi - f(x) > EPS).length, l = R.filter(x => f(x) - x.lsi > EPS).length; return { w, l, tie: R.length - w - l }; };
        const win = f => { const t = tally(f); return t.w + t.l ? t.w / (t.w + t.l) : NaN; };
        const tieTxt = f => { const t = tally(f); return t.tie ? `(另有 ${(t.tie / R.length * 100).toFixed(0)}% 結果相同)` : ''; };
        $('#rsStats').innerHTML = `<div class="stat"><div class="v" style="font-size:16px;">${ym(M[R[0].t])}～${ym(M[R[R.length - 1].t])}</div><div class="l">${R.length} 個起點 · ${H ? `每個持有 ${H} 年` : `都持有到 ${ym(M[M.length - 1])}(${(MIN_NOW / 12).toFixed(0)}～${((M.length - 1 - R[0].t) / 12).toFixed(0)} 年)`}</div></div>` +
          strat.slice(1).map(([k, n, f]) => `<div class="stat"><div class="v">${Number.isFinite(win(f)) ? (win(f) * 100).toFixed(0) + '%' : '—'}</div><div class="l">單筆贏過${n}的比例${tieTxt(f)} · 年化平均多 ${pctf(mean(diff(f)), 2)}</div></div>`).join('');
        $('#rsTable').innerHTML = `<thead><tr><th>策略</th><th>平均年化</th><th>中位數</th><th>最差 10%(10th)</th><th>最好 10%(90th)</th><th>最差</th></tr></thead><tbody>
          ${strat.map(([k, n, f]) => { const v = R.map(f); return `<tr><td>${n}</td><td class="${cls(mean(v))}">${pctf(mean(v), 2)}</td><td>${pctf(pctl(v, 0.5), 2)}</td><td>${pctf(pctl(v, 0.1), 2)}</td><td>${pctf(pctl(v, 0.9), 2)}</td><td class="down">${pctf(Math.min(...v), 2)}</td></tr>`; }).join('')}</tbody>`;
        // 年化報酬差的分布
        const d = diff(x => x.dca), lo = Math.floor(Math.min(...d) * 200) / 200, hi = Math.ceil(Math.max(...d) * 200) / 200, step = Math.max(0.0025, (hi - lo) / 30);
        const bins = []; for (let x = lo; x < hi + 1e-9; x += step) bins.push({ x, n: 0 });
        d.forEach(v => { const i = Math.min(bins.length - 1, Math.floor((v - lo) / step)); bins[i].n++; });
        LTChart.bars($('#rsHist'), { x: bins.map(b => b.x + step / 2), label: '年化報酬差分布', height: 200, xFmt: v => (v * 100).toFixed(1) + '%', yFmt: v => Math.round(v), tipFmt: (s, v, i) => `${v} 個起點`,
          series: [{ name: '起點數', y: bins.map(b => b.n), color: 'var(--amber)' }], refX: [{ x: 0, label: '0：兩者相同', color: 'var(--dim)' }] });
        $('#rsLineLegend').innerHTML = LTChart.legend([{ name: '單筆投入', color: 'var(--amber)' }, { name: '定期定額', color: 'var(--blue)' }, { name: '逢低買入(跌 10%)', color: 'var(--up)' }, { name: '逢低買入(跌 20%)', color: 'var(--down)' }]);
        LTChart.line($('#rsLine'), { x: R.map(x => M[x.t]), xType: 'date', label: '依起點的年化報酬', height: 260, xFmt: (m, tip) => tip ? `${ym(m)} 起` : m.slice(2).replace('-', '/'),
          yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => pctf(v, 2), refY: [{ y: 0 }],
          series: [{ name: '單筆投入', y: R.map(x => x.lsi), color: 'var(--amber)' }, { name: '定期定額', y: R.map(x => x.dca), color: 'var(--blue)' }, { name: '逢低買入(10%)', y: R.map(x => x.btd[0]), color: 'var(--up)', width: 1.3 }, { name: '逢低買入(20%)', y: R.map(x => x.btd[1]), color: 'var(--down)', width: 1.3 }] });
        const w = win(x => x.dca), worst = R.slice().sort((a, b) => a.lsi - b.lsi).slice(0, Math.max(1, Math.round(R.length * 0.1)));
        $('#rsInsight').innerHTML = `
          <li>單筆投入在 ${(w * 100).toFixed(0)}% 的起點贏過定期定額，年化報酬平均${mean(d) >= 0 ? '多' : '少'} ${pctf(Math.abs(mean(d)), 2).replace('+', '')}；${w > 0.5 && mean(d) >= 0 ? '勝率與平均都和 PWL 研究的方向一致' : w > 0.5 ? '單筆較常勝出，但定期定額贏的時候贏比較多(例如起點剛好在大跌之前)，平均下來差不多' : '這段期間定期定額較常勝出，與 PWL 研究的多數國家不同'}。</li>
          <li>在單筆投入表現最差的 10% 起點裡，定期定額贏的比例是 ${(worst.filter(x => x.dca > x.lsi).length / worst.length * 100).toFixed(0)}%。</li>
          <li>逢低買入：等跌 10% 才進場，單筆贏的比例 ${(win(x => x.btd[0]) * 100).toFixed(0)}%${tieTxt(x => x.btd[0])}、年化平均多 ${pctf(mean(diff(x => x.btd[0])), 2)}；等跌 20%，單筆贏的比例 ${(win(x => x.btd[1]) * 100).toFixed(0)}%${tieTxt(x => x.btd[1])}、年化平均多 ${pctf(mean(diff(x => x.btd[1])), 2)}。${mean(diff(x => x.btd[0])) < 0 ? "這段期間「跌 10% 才買」平均反而略勝：台股 10% 的回檔很常見、等待時間短，常能買到較低的價格；但「跌 20% 才買」常常要等好幾年，錯過的漲幅遠大於買低的好處。" : "門檻越深，拿著現金的時間越長，錯過的漲幅越多。"}</li>
          ${$('#rsSeries').value === 'taiex' ? '<li>加權指數 2000 年的高點直到 2017 年才站回，這段期間指數大多已比高點低 10% 以上，所以「跌 10% 才買」多半在起點就立刻進場、結果和單筆相同；加權指數也不含股息，含股息時越早進場越有利(可改選加權報酬指數比較)。</li>' : ''}
          ${$('#rsSeries').value === 'taiex_tr' ? '<li>加權報酬指數把成分股的現金股利再投入，是 0050 這類市值型 ETF 追蹤的標的(未扣 ETF 費用)，比只看價格的加權指數更接近實際投資的結果。</li>' : ''}`;
      };
      ['#rsSeries', '#rsH', '#rsN'].forEach(id => { $(id).onchange = drawRolling; });
      $('#rsCash').oninput = drawRolling;
      drawRolling();
    }
  }

  // 目錄頁(LT.catalog)：依類別分組的研究卡片，點進去是單一研究(網址 etf/research/<研究>)
  LT.catalog({
    section: 'etf', key: 'research', name: 'ETF研究',
    desc: '投資方式、主動式 ETF 跟單；同一個顏色代表同一系列的研究',
    groups: RCATS.map(c => ({ name: c.name, desc: c.desc, items: c.studies.map(x => ({
      key: x.key, name: x.name, desc: x.desc, summary: x.summary, tags: tagOf(x.series), run: (el, ctx) => study(el, ctx, x.key),
    })) })),
  });
})();
