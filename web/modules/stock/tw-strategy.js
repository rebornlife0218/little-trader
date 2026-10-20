/* 股票 · 台股 · 策略：台股策略回測(資料集 tw_strategy，pipeline/tw_strategy/update.py，資料來自本機 PostgreSQL 的 CMoney 日資料)
   最上方選策略；淨值已在 pipeline 依整數股與交易成本算好，網頁端只做：扣借券費(做空，可調整)、計算績效統計與畫圖(版型同美股策略 us-strategy.js)。
   新增策略：pipeline 加一種選股規則，這裡的 STRATS 加一筆 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STRATS = [
    { key: 'lv10', name: '低波動 10 檔', short: '過去半年波動最小的 10 檔，等權重', idea: '低波動異常：波動小的股票，長期風險調整後報酬不一定比較差。', color: 'var(--amber)' },
    { key: 'lv10p', name: '低波動 10%', short: '過去半年波動最小的 10%(約一百多檔)，等權重', idea: '同樣的規則、持股分散到一百多檔，降低個股風險。', color: 'var(--up)' },
  ];
  const BENCH = [
    { key: 'b0050', name: '0050 買進持有', short: '元大台灣50(含股息再投入)，比較基準', color: 'var(--blue)' },
    { key: 'ew', name: '全部合格股票等權重', short: '每月把所有符合流動性條件的股票等權重買進(本回測自算)', color: '#94a3b8' },
  ];
  const VIEW_KEY = 'lt.twView';
  const COST_NOTE = '績效都已扣除交易成本：手續費 0.1425% 打 3 折(買賣都收)、證交稅 0.3%(賣出時收，同一天進出的當沖 0.15%)、滑價買賣各一個升降單位(依成交價的級距)。';
  const MONEY_NOTE = '本金 100 萬元，每筆進場金額除以進場價(含滑價與手續費)無條件捨去到整數股，剩下的錢留在現金(不計利息)。';
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const isStrat = k => k === 'ew' || STRATS.some(s => s.key === k);   // 有換股的組合
  const meta = k => STRATS.find(s => s.key === k) || BENCH.find(s => s.key === k);
  const short = k => meta(k).name;
  const LOG_TICKS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const mulFmt = v => v >= 10 ? v.toFixed(0) + '×' : v >= 1 ? (+v.toFixed(1)) + '×' : (+v.toFixed(2)) + '×';

  /* 淨值的績效統計(淨值已扣成本)；ddDays = 最長連續回撤天期(從前一個高點跌下來到重新站回高點的交易日數，還沒站回就算到最後一天) */
  function stats(nav) {
    const r = []; for (let i = 1; i < nav.length; i++) r.push(nav[i] / nav[i - 1] - 1);
    const yrs = r.length / 252, cagr = nav[nav.length - 1] ** (1 / yrs) - 1;
    const m = r.reduce((a, b) => a + b, 0) / r.length, vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
    const down = Math.sqrt(r.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / r.length * 252);   // 下檔波動：只算虧損的日子(目標報酬 0)
    let peak = -Infinity, mdd = 0, run = 0, ddDays = 0;
    nav.forEach(x => { if (x >= peak) { peak = x; run = 0; } else ddDays = Math.max(ddDays, ++run); mdd = Math.min(mdd, x / peak - 1); });
    return { ret: cagr, vol, sharpe: cagr / vol, sortino: cagr / down, mdd, ddDays, mult: nav[nav.length - 1] };
  }
  /* 交易統計：net = 每筆扣成本後的報酬(已出場)，days = 每筆持有交易日數，npos = 每日持有檔數(只算有部位的日子) */
  function tradeStats(net, days, npos) {
    const s = net.slice().sort((a, b) => a - b), n = s.length, held = npos.filter(v => v > 0);
    const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    return { n, win: net.filter(v => v > 0).length / Math.max(1, n), mean: mean(net), median: n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN,
      days: mean(days), pos: mean(held), heldPct: held.length / Math.max(1, npos.length) };
  }

  /* ---------- 共用：台股策略一律和 0050 比較 ---------- */
  const beat = (v, b, hi = true) => (hi ? v > b : v < b) ? 'beat' : '';
  const card = (v, label, sub, c = '') => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${label}<br>${sub}</div></div>`;
  const heat = (v, beatIt) => { const c = v >= 0 ? 'var(--up)' : 'var(--down)', a = Math.min(55, Math.abs(v) * 110);
    return `<td class="${beatIt ? 'beat' : ''}" style="background:color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)">${pct(v, 1)}</td>`; };
  const totalRet = x => pct(x.mult - 1, 0);
  // 總報酬、年化報酬、年化波動、夏普值、索提諾比率、最大回撤、最長連續回撤天期(x = 策略，S = 0050，皆為 stats() 的結果)
  const vs0050Cards = (x, S) => [
    card(totalRet(x), '總報酬', `0050 ${totalRet(S)}`, `${cls(x.mult - 1)} ${beat(x.mult, S.mult)}`),
    card(pct(x.ret), '年化報酬', `0050 ${pct(S.ret)}`, `${cls(x.ret)} ${beat(x.ret, S.ret)}`),
    card((x.vol * 100).toFixed(1) + '%', '年化波動', `0050 ${(S.vol * 100).toFixed(1)}%`, beat(x.vol, S.vol, false)),
    card(x.sharpe.toFixed(2), '夏普值', `0050 ${S.sharpe.toFixed(2)}`, beat(x.sharpe, S.sharpe)),
    card(x.sortino.toFixed(2), '索提諾比率', `0050 ${S.sortino.toFixed(2)}`, beat(x.sortino, S.sortino)),
    card(pct(x.mdd, 1), '最大回撤', `0050 ${pct(S.mdd, 1)}`, `down ${beat(x.mdd, S.mdd)}`),
    card(`${x.ddDays} 天`, '最長連續回撤', `0050 ${S.ddDays} 天(交易日)`, beat(x.ddDays, S.ddDays, false)),
  ].join('');
  // 交易筆數與勝率、每筆平均報酬、每筆中位數報酬、平均一天持有檔數、平均一檔持倉天期(t = tradeStats() 的結果)
  const tradeCards = t => [
    card(`${t.n.toLocaleString()} 筆`, '交易筆數(已出場)', `勝率 ${(t.win * 100).toFixed(1)}%`),
    card(pct(t.mean), '每筆平均報酬', '扣成本', cls(t.mean)),
    card(pct(t.median), '每筆中位數報酬', '扣成本', cls(t.median)),
    card(`${t.pos.toFixed(1)} 檔`, '平均一天持有檔數', t.heldPct < 0.995 ? `只算有部位的日子(占 ${(t.heldPct * 100).toFixed(0)}%)` : '每天都有部位'),
    card(`${t.days.toFixed(1)} 天`, '平均一檔持倉天期', '交易日'),
  ].join('');
  const STAT_NOTE = '夏普值 = 年化報酬 ÷ 年化波動；索提諾比率 = 年化報酬 ÷ 年化下檔波動(只計虧損日，上漲的波動不算風險)；無風險利率以 0 計。最長連續回撤 = 淨值從前一個高點跌下來、到重新站回高點經過的交易日數(還沒站回就算到最新一天)。';
  const vs0050Txt = (from, to, x, S) => `${from.replace(/-/g, '/')} 到 ${to.replace(/-/g, '/')}，總報酬 ${totalRet(x)}(0050 ${totalRet(S)})，年化報酬${x.ret > S.ret ? '高於' : '低於'} 0050；最大回撤 ${pct(x.mdd, 1)}(0050 ${pct(S.mdd, 1)})`;
  /* 每年報酬：d = 日期，i0 = 期初位置，a、b = 從期初開始的淨值(策略、0050)；回傳 [{ yr, r, b, label }] */
  function yearTable(d, i0, a, b) {
    const rows = [], asof = d[d.length - 1];
    for (let i = 1, k = 0; i < a.length; i++) {
      const day = d[i0 + i], nx = d[i0 + i + 1];
      if (nx && nx.slice(0, 4) === day.slice(0, 4)) continue;
      const yr = day.slice(0, 4), partial = !nx || (k === 0 && !d[i0 + 1].slice(5).startsWith('01'));
      rows.push({ yr, r: a[i] / a[k] - 1, b: b[i] / b[k] - 1,
        label: yr + (partial ? `<br><small class="mute">${yr === asof.slice(0, 4) ? '至 ' + asof.slice(5).replace('-', '/') : d[i0 + 1].slice(5).replace('-', '/') + ' 起'}</small>` : '') });
      k = i;
    }
    return rows;
  }
  /* 累積報酬(上)與回撤(下)畫在同一張圖：navs = { key: 淨值 }，meta = { key: { name, color } }，main = 主角(線條較粗) */
  function navCharts({ d, i0, navs, meta, main, log, chart, legend }) {
    const keys = Object.keys(meta), n = navs[keys[0]].length;
    const step = Math.max(1, Math.floor(n / 700)), idx = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    const xs = idx.map(i => d[i0 + i]), xFmt = (v, tip) => tip ? v : v.slice(0, 4);
    const D = Object.fromEntries(keys.map(k => { let pk = -Infinity; return [k, navs[k].map(v => { pk = Math.max(pk, v); return v / pk - 1; })]; }));
    LTChart.line(chart, { x: xs, xType: 'date', label: '累積報酬與回撤', height: 320, xFmt,
      yFmt: log ? v => mulFmt(10 ** v) : v => mulFmt(v), tipFmt: log ? (s, v) => pct(10 ** v - 1, 1) : (s, v) => pct(v - 1, 1),
      yTicks: log ? () => LOG_TICKS.map(Math.log10) : undefined, refY: [{ y: log ? 0 : 1 }],
      series: keys.map(k => ({ name: meta[k].name, color: meta[k].color, width: k === main ? 2.6 : 1.5, y: idx.map(i => log ? Math.log10(navs[k][i]) : navs[k][i]) })),
      lower: { height: 130, label: '回撤：從前一個高點下跌的幅度', yMax: 0, fill: true, yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => (v * 100).toFixed(1) + '%',
        series: keys.map(k => ({ name: meta[k].name + ' 回撤', color: meta[k].color, width: k === main ? 1.6 : 1.2, y: idx.map(i => D[k][i]) })) } });
    legend.innerHTML = LTChart.legend(keys.map(k => meta[k]));
  }

  // 最上方先選做多 / 做空，再用下拉式選單選策略：新增策略時在 strats 加一筆(run = 畫面函式)，尚未完成的設 soon: true(顯示「努力建置中」)
  const SIDES = [
    { key: 'long', name: '做多', desc: '買進股票，賺上漲的錢', strats: [
      { key: 'lowvol', name: '低波動選股', desc: '每月挑選過去半年波動最小的股票，持有一個月', run: (...a) => lowvol(...a) },
      { key: 'margin', name: '融資都沒退，算我輸嗎', desc: '不公開，輸入密碼後查看', run: eventStrat('margin') },
    ] },
    { key: 'short', name: '做空', desc: '放空股票，賺下跌的錢', strats: [
      { key: 'against', name: '大盤跌個股逆勢漲就是欠踹', desc: '大盤大跌時逆勢大漲、借券賣出創新高的股票，隔天開盤放空、當天收盤回補', run: eventStrat('against') },
    ] },
  ];
  const SIDE_KEY = 'lt.twSide', FAMILY_KEY = 'lt.twFamily';
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無法使用 localStorage */ } };
  const recall = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  LT.register({
    section: 'stock', group: '台股', key: 'tw-strategy', name: '策略',
    async mount(el, ctx) {
      let side = SIDES.some(x => x.key === recall(SIDE_KEY)) ? recall(SIDE_KEY) : 'long';
      const all = SIDES.flatMap(x => x.strats);
      let fam = all.some(f => f.key === recall(FAMILY_KEY)) ? recall(FAMILY_KEY) : 'lowvol';
      el.innerHTML = `
        <header class="top"><div>
          <h1>台股策略</h1>
          <p>選擇做多或做空的策略，與買進持有 0050 比較報酬與風險</p>
        </div></header>
        <div class="panel">
          <div class="mode-tabs tw-side">${SIDES.map(x => `<button class="mode-tab" data-s="${x.key}"><b>${esc(x.name)}</b><small>${x.soon ? '努力建置中' : esc(x.desc)}</small></button>`).join('')}</div>
          <div class="paramgrid opt-form tw-family" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end;">
            <div class="paramitem"><label for="twStrat">策略</label><select id="twStrat"></select></div>
            <p class="note" id="twStratDesc" style="margin:0 0 8px;"></p>
          </div>
        </div>
        <div id="twFam"></div>`;
      const famEl = el.querySelector('#twFam'), famTabs = el.querySelector('.tw-family'), famSel = el.querySelector('#twStrat'), famDesc = el.querySelector('#twStratDesc');
      let seq = 0;   // 每次切換策略加 1：還在載入的舊策略結果不會蓋掉新選的
      const showFam = f => {
        fam = f; store(FAMILY_KEY, f);
        const F = all.find(x => x.key === f);
        famSel.value = f; famDesc.textContent = F.desc;
        const my = ++seq;
        F.run(famEl, { alive: () => ctx.alive() && seq === my });
      };
      const showSide = sk => {
        side = sk; store(SIDE_KEY, sk);
        const S = SIDES.find(x => x.key === sk);
        el.querySelectorAll('.tw-side .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.s === sk));
        famSel.innerHTML = S.strats.map(f => `<option value="${f.key}">${esc(f.name)}</option>`).join('');
        famTabs.style.display = S.strats.length ? '' : 'none';
        if (S.soon) { ++seq; famEl.innerHTML = LT.UNDER_CONSTRUCTION; return; }
        showFam(S.strats.some(f => f.key === fam) ? fam : S.strats[0].key);
      };
      el.querySelector('.tw-side').onclick = e => { const b = e.target.closest('[data-s]'); if (b && b.dataset.s !== side) showSide(b.dataset.s); };
      famSel.onchange = () => { if (famSel.value !== fam) showFam(famSel.value); };
      showSide(side);
    },
  });

  /* ---------- 低波動選股 ---------- */
  async function lowvol(el, ctx) {
    el.innerHTML = `<div id="twBody"><div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div></div>`;
    let B;
    try { B = (await LT.loadJSON('tw_strategy', 'backtest.json')).data; }
    catch (e) { if (ctx.alive()) el.querySelector('#twBody').innerHTML = `<div class="panel"><p class="mute">回測資料尚未產生：${esc(e.message)}</p></div>`; return; }
    if (!ctx.alive()) return;
    const P = B.params;
    let view = 'all';
    { const v = recall(VIEW_KEY); if (v === 'all' || STRATS.some(s => s.key === v)) view = v; }

    el.querySelector('#twBody').innerHTML = `
      <div class="panel">
        <div class="mode-tabs tw-tabs">
          <button class="mode-tab" data-k="all"><b>總覽比較</b><small>兩種低波動組合與 0050 並列</small></button>
          ${STRATS.map(s => `<button class="mode-tab" data-k="${s.key}"><b>${esc(s.name)}</b><small>${esc(s.short)}</small></button>`).join('')}
        </div>
        <div class="doc">
          <p><b>選股規則</b>：</p>
          <ul>
            <li><b>選股</b>：每月最後一個交易日收盤後，計算每檔普通股過去 ${P.lookback} 個交易日(約半年)<b>5 日報酬的標準差</b>，由小到大排序，取最小的 ${P.top_n} 檔或 ${P.top_pct * 100}%，等權重。</li>
            <li><b>進出場</b>：下一個交易日<b>開盤</b>先賣出不再入選的股票、再買進新入選的股票，持有到下個月第一個交易日開盤換股。</li>
            <li><b>資金分配</b>：每檔的目標金額 = 換股前一天收盤的總資產 ÷ 選到的檔數(低波動 10 檔每檔 10%、低波動 10% 每檔約 1%)；續抱的股票也調整到目標金額(多的賣掉、少的補買)。持有期間不再平衡，權重隨股價漂移。</li>
            <li><b>流動性條件</b>：選股日當天有成交、過去半年至少 ${P.min_traded * 100}% 的日子有成交、每日成交金額中位數至少 ${(P.min_value / 1000).toFixed(0)} 百萬元。沒成交的日子價格不變，這種股票的波動「看起來」很低，不加條件會選到一堆幾乎買不到的冷門股。</li>
          </ul>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twScale">走勢圖縱軸</label><select id="twScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
        </div>
        <p class="note">${COST_NOTE}${MONEY_NOTE}</p>
      </div>
      <div id="twView"></div>
      <div class="panel">
        <h3>回測作法</h3>
        <div class="doc">
          <ul>
            <li><b>範圍</b>：上市櫃普通股(不含 ETF、存託憑證)，包含期間內已下市櫃的公司；持有期間下市，以最後收盤價轉為現金(不計利息)。</li>
            <li><b>報酬</b>：用還原股價計算(含現金股利再投入)，0050 採股息再投入、期初以整數股買進後持有。</li>
            <li><b>漲跌停與沒有成交</b>：以原始價格判斷。要賣出時開盤是跌停價或當天沒有成交，視為賣不掉，延到下一個交易日開盤再賣(可能連續延後)；要買進時開盤是漲停價或沒有成交，延後一天，隔天仍買不到就放棄，這個月少一檔、資金留在現金。續抱股票的調整當天做不到就不調整。</li>
            <li><b>期間</b>：SQL 資料從 2016 年 1 月開始，需要先累積半年的資料計算波動，回測從 ${esc(B.m[0].start)} 開始到最新交易日。</li>
          </ul>
          <p class="mute">仍未計入：處置股的分盤交易、零股與整股的價差；換股以開盤價(加減一個升降單位)成交，實際成交價可能不同。</p>
        </div>
        <h4>每月合格股票數</h4>
        <div id="twCov"></div>
      </div>`;

    const $ = s => el.querySelector(s);
    // 淨值已在 pipeline 扣除成本，期間固定為資料開始到最新交易日(期初 = 第一個選股日收盤)
    const calc = () => {
      const i0 = 0, M = B.m, navs = {}, st = {}, ts = {};
      [...STRATS, ...BENCH].forEach(s => { navs[s.key] = B.nav[s.key]; st[s.key] = stats(navs[s.key]); });
      Object.entries(B.tstat).forEach(([k, t]) => { const np = B.npos[k].slice(1), held = np.filter(v => v > 0);
        ts[k] = { ...t, pos: held.reduce((a, b) => a + b, 0) / Math.max(1, held.length), heldPct: held.length / Math.max(1, np.length) }; });
      const mIdx = M.map(m => B.d.indexOf(m.start) - 1 - i0).concat([B.d.length - 1 - i0]);
      const mret = k => mIdx.slice(0, -1).map((a, j) => navs[k][mIdx[j + 1]] / navs[k][a] - 1);
      const turnAvg = k => M.slice(1).reduce((a, m) => a + m.turn[k], 0) / Math.max(1, M.length - 1);
      return { i0, M, navs, st, ts, mret, bQ: mret('b0050'), turnAvg };
    };
    const periodTxt = C => `${B.d[C.i0 + 1].replace(/-/g, '/')} 到 ${B.asof.replace(/-/g, '/')}`;

    function charts(C, keys, ddKeys, main) {
      const log = $('#twScale').value === 'log', { i0, navs } = C;
      const step = Math.max(1, Math.floor((B.d.length - i0) / 700)), idx = [];
      for (let i = 0; i < B.d.length - i0; i += step) idx.push(i);
      if (idx[idx.length - 1] !== B.d.length - 1 - i0) idx.push(B.d.length - 1 - i0);
      const xs = idx.map(i => B.d[i0 + i]), xFmt = (d, tip) => tip ? d : d.slice(0, 4);
      const dd = k => { let pk = -Infinity; return navs[k].map(v => { pk = Math.max(pk, v); return v / pk - 1; }); };
      const D = Object.fromEntries(ddKeys.map(k => [k, dd(k)]));
      LTChart.line($('#twChart'), { x: xs, xType: 'date', label: '累積報酬與回撤', height: 320, xFmt,
        yFmt: log ? v => mulFmt(10 ** v) : v => mulFmt(v), tipFmt: log ? (s, v) => pct(10 ** v - 1, 1) : (s, v) => pct(v - 1, 1),
        yTicks: log ? () => LOG_TICKS.map(Math.log10) : undefined, refY: [{ y: log ? 0 : 1 }],
        series: keys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === main ? 2.6 : 1.5, dash: k === 'ew' ? '5 4' : undefined,
          y: idx.map(i => log ? Math.log10(navs[k][i]) : navs[k][i]) })),
        lower: { height: 130, label: '回撤：從前一個高點下跌的幅度', yMax: 0, fill: true, yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => (v * 100).toFixed(1) + '%',
          series: ddKeys.map(k => ({ name: meta(k).name + ' 回撤', color: meta(k).color, width: k === main ? 1.6 : 1.2, y: idx.map(i => D[k][i]) })) } });
      $('#twLegend').innerHTML = LTChart.legend(keys.map(meta));
    }
    /* 每年報酬：每年最後一個交易日的淨值比 */
    function yearRows(C, keys) {
      const { i0, navs } = C, ends = [], rows = [];
      for (let i = 0; i < B.d.length - i0; i++) {
        const yr = B.d[i0 + i].slice(0, 4), nx = B.d[i0 + i + 1];
        if (!nx || nx.slice(0, 4) !== yr) ends.push({ yr, i });
      }
      ends.forEach((e, j) => {
        if (e.i === 0) return;   // 期初就是年底(起點為年初時)
        const a = j ? ends[j - 1].i : 0;
        rows.push({ yr: e.yr, partial: (!B.d[i0 + e.i + 1] && !B.d[i0 + e.i].endsWith('12-31')) || a === 0 && !B.d[i0 + 1].slice(5).startsWith('01'),
          r: Object.fromEntries(keys.map(k => [k, navs[k][e.i] / navs[k][a] - 1])) });
      });
      return rows;
    }
    const yrLabel = (C, r) => `${r.yr}${r.partial ? `<br><small class="mute">${r.yr === B.asof.slice(0, 4) ? '至 ' + B.asof.slice(5).replace('-', '/') : B.d[C.i0 + 1].slice(5).replace('-', '/') + ' 起'}</small>` : ''}`;
    const chartBlock = title => `
      <h4>${title}</h4>
      <div id="twChart"></div>
      <div id="twLegend"></div>
      <p class="note">上方為累積報酬(期初 = 1)，下方為回撤(從前一個高點下跌的幅度)，已扣除交易成本。對數刻度下，同樣的垂直距離代表同樣的報酬率(例如 1→2 和 5→10 都是翻倍)。</p>`;

    /* ---------- 總覽比較 ---------- */
    function renderAll(C) {
      const { st, ts, mret, bQ, turnAvg } = C, S = st.b0050;
      const row = (s, strat) => { const x = st[s.key];
        const mr = strat ? mret(s.key) : null, w = mr ? mr.filter((v, j) => v > bQ[j]).length / mr.length : null;
        return `<tr class="${strat ? 'click' : 'allrow'}" ${strat ? `data-go="${s.key}"` : ''}><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td>
          <td class="${cls(x.ret)} ${strat ? beat(x.ret, S.ret) : ''}">${pct(x.ret)}</td><td class="${strat ? beat(x.vol, S.vol, false) : ''}">${(x.vol * 100).toFixed(1)}%</td>
          <td class="${strat ? beat(x.sharpe, S.sharpe) : ''}">${x.sharpe.toFixed(2)}</td><td class="${strat ? beat(x.sortino, S.sortino) : ''}">${x.sortino.toFixed(2)}</td><td class="down ${strat ? beat(x.mdd, S.mdd) : ''}">${pct(x.mdd, 1)}</td><td class="${strat ? beat(x.ddDays, S.ddDays, false) : ''}">${x.ddDays} 天</td>
          <td class="${cls(x.mult - 1)}">${totalRet(x)}</td><td>${ts[s.key] ? `${ts[s.key].n.toLocaleString()} 筆 / ${(ts[s.key].win * 100).toFixed(0)}%` : '—'}</td><td class="${ts[s.key] ? cls(ts[s.key].mean) : ''}">${ts[s.key] ? `${pct(ts[s.key].mean, 1)} / ${pct(ts[s.key].median, 1)}` : '—'}</td><td>${ts[s.key] ? `${ts[s.key].pos.toFixed(0)} 檔 / ${ts[s.key].days.toFixed(0)} 天` : '—'}</td><td>${w == null ? '—' : (w * 100).toFixed(0) + '%'}</td><td>${isStrat(s.key) ? (turnAvg(s.key) / 2 * 100).toFixed(0) + '%' : '—'}</td></tr>`; };
      const keys = [...STRATS.map(s => s.key), 'b0050', 'ew'], rows = yearRows(C, keys);
      const wins = k => rows.filter(r => r.r[k] > r.r.b0050).length;
      const E = st.ew, lv = st.lv10p;
      const topInd = (P, n) => { const c = {}; P.forEach(p => { const k = (p[2] || '其他').replace(/^OTC/, '').replace(/類$/, ''); c[k] = (c[k] || 0) + 1; });
        return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => esc(k)).join('、'); };
      $('#twView').innerHTML = `
        <div class="panel">
          <h3>低波動 vs 0050</h3>
          <div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>組合</th><th>選股規則</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>索提諾比率</th><th>最大回撤</th><th>最長連續回撤</th><th>總報酬</th><th>交易筆數 / 勝率</th><th>每筆平均 / 中位數報酬</th><th>平均持有檔數 / 持倉天期</th><th>贏 0050 的月數</th><th>每月換手率(單邊)</th></tr></thead>
            <tbody>${STRATS.map(s => row(s, true)).join('')}${BENCH.map(s => row(s, false)).join('')}</tbody></table></div>
          <p class="note">粗體底線表示優於 0050；點選策略列可切換到該策略的分析。${STAT_NOTE}換手率(單邊) = 每月賣出加買進金額占資產比例的一半。一筆交易 = 一檔股票從買進到全部賣出(中間的調整併在同一筆)；報酬 = 收回金額 ÷ 投入金額 − 1(扣成本)，持倉天期以交易日計。</p>
          <ul class="insight">
            <li>${periodTxt(C)}，0050 年化 ${pct(S.ret)}、年化波動 ${(S.vol * 100).toFixed(1)}%、最大回撤 ${pct(S.mdd, 1)}。</li>
            <li><b>波動確實比較低</b>：低波動 10% 的年化波動 ${(lv.vol * 100).toFixed(1)}%，${lv.vol < S.vol ? '低於' : '高於'} 0050；最大回撤 ${pct(lv.mdd, 1)}${lv.mdd > S.mdd ? '，比 0050 淺' : ''}。</li>
            <li>${lv.ret < S.ret ? `<b>報酬落後 0050</b>：0050 總報酬 ${totalRet(S)}、低波動 10% ${totalRet(lv)}。0050 以台積電等大型電子股為主，低波動 10% 目前持股以${topInd(B.picks.lv10p, 3)}為主，${E.ret < S.ret ? '連全部股票等權重也落後 0050，代表這段期間是少數大型權值股領漲' : '漲勢參與得比較少'}。` : `<b>報酬贏過 0050</b>：低波動 10% 總報酬 ${totalRet(lv)}，0050 ${totalRet(S)}。`}</li>
            <li><b>和等權重比</b>：全部合格股票等權重年化 ${pct(E.ret)}、夏普值 ${E.sharpe.toFixed(2)}；低波動 10% 夏普值 ${lv.sharpe.toFixed(2)}，${lv.sharpe > E.sharpe ? '風險調整後比等權重好，低波動因子在台股有一些效果' : '風險調整後也沒有比等權重好，這段期間台股的低波動因子沒有超額報酬'}。</li>
          </ul>
        </div>
        <div class="panel">
          <h3>走勢比較</h3>
          ${chartBlock('累積報酬與回撤')}
          <h4>每年報酬</h4>
          <div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th>${keys.map(k => `<th>${esc(short(k))}</th>`).join('')}</tr></thead><tbody>
            ${rows.slice().reverse().map(r => `<tr><td>${yrLabel(C, r)}</td>${keys.map(k => heat(r.r[k], k !== 'b0050' && r.r[k] > r.r.b0050)).join('')}</tr>`).join('')}
            <tr class="allrow"><td>贏 0050 的年數</td>${keys.map(k => `<td>${k === 'b0050' ? '—' : `${wins(k)} / ${rows.length}`}</td>`).join('')}</tr></tbody></table></div>
          <p class="note">紅色越深代表漲越多、綠色越深代表跌越多；粗體底線表示當年贏過 0050。</p>
        </div>`;
      charts(C, [...STRATS.map(s => s.key), 'b0050', 'ew'], [...STRATS.map(s => s.key), 'b0050'], 'b0050');
      el.querySelectorAll('#twView tr[data-go]').forEach(tr => { tr.onclick = () => setView(tr.dataset.go, true); });
    }

    /* ---------- 單一策略 ---------- */
    function renderOne(C, k) {
      const { st, ts, mret, bQ, turnAvg, M } = C, s = meta(k), x = st[k], S = st.b0050;
      const d = mret(k).map((v, j) => v - bQ[j]), win = d.filter(v => v > 0).length;
      const rows = yearRows(C, [k, 'b0050', 'ew']), yWin = rows.filter(r => r.r[k] > r.r.b0050).length;
      const bi = d.indexOf(Math.max(...d)), wi = d.indexOf(Math.min(...d)), dMean = d.reduce((a, b) => a + b, 0) / d.length;
      const pk = B.picks, picks = pk[k];
      const ind = {}; picks.forEach(p => { ind[p[2] || '其他'] = (ind[p[2] || '其他'] || 0) + 1; });
      const indTop = Object.entries(ind).sort((a, b) => b[1] - a[1]);
      $('#twView').innerHTML = `
        <div class="panel">
          <h3>${esc(s.name)}</h3>
          <p><b>選股規則</b>：每月最後一個交易日收盤後，${esc(s.short)}，隔天開盤進場、持有一個月。<b>想法</b>：${esc(s.idea)}</p>
          <div class="statgrid" style="margin:12px 0;">
            ${vs0050Cards(x, S)}
            ${card(`${(win / d.length * 100).toFixed(0)}%`, '贏 0050 的月數', `${win} / ${d.length} 個月，年度 ${yWin} / ${rows.length}`)}
            ${card(`${(turnAvg(k) / 2 * 100).toFixed(0)}%`, '每月換手率(單邊)', '賣出加買進金額的一半')}
            ${tradeCards(ts[k])}
          </div>
          <p class="note">${STAT_NOTE}一筆交易 = 一檔股票從買進到全部賣出(中間的調整併在同一筆)；報酬 = 收回金額 ÷ 投入金額 − 1(扣成本)。</p>
          <ul class="insight">
            <li>${periodTxt(C)}，總報酬 ${totalRet(x)}(0050 ${totalRet(S)})；年化報酬${x.ret > S.ret ? '高於' : '低於'} 0050 ${pct(Math.abs(x.ret - S.ret)).replace('+', '')}，年化波動${x.vol < S.vol ? '低於' : '高於'} 0050(${(x.vol * 100).toFixed(1)}% vs ${(S.vol * 100).toFixed(1)}%)。</li>
            <li>每月平均比 0050 ${dMean >= 0 ? '多' : '少'} ${pct(Math.abs(dMean)).replace('+', '')}；表現最好的一個月 ${M[bi].m} 贏 ${pct(d[bi], 1)}，最差的一個月 ${M[wi].m} 輸 ${pct(d[wi], 1)}。</li>
            <li>最大回撤 ${pct(x.mdd, 1)}，${x.mdd < S.mdd ? `比 0050 的 ${pct(S.mdd, 1)} 更深` : `比 0050 的 ${pct(S.mdd, 1)} 淺：低波動的好處主要在跌勢`}。</li>
          </ul>
        </div>
        <div class="panel">
          <h3>走勢</h3>
          ${chartBlock(`累積報酬與回撤：${esc(short(k))} vs 0050 vs 全部合格股票等權重`)}
          <h4>每年報酬</h4>
          <div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th><th>${esc(short(k))}</th><th>0050</th><th>差距</th><th>全部合格股票等權重</th></tr></thead><tbody>
            ${rows.slice().reverse().map(r => `<tr><td>${yrLabel(C, r)}</td>${heat(r.r[k], r.r[k] > r.r.b0050)}${heat(r.r.b0050, false)}<td class="${cls(r.r[k] - r.r.b0050)}">${pct(r.r[k] - r.r.b0050, 1)}</td>${heat(r.r.ew, false)}</tr>`).join('')}
          </tbody></table></div>
          <p class="note">紅色越深代表漲越多、綠色越深代表跌越多；粗體底線表示當年贏過 0050。</p>
        </div>
        <div class="panel">
          <h3>${pk.entered ? '本月持股' : '下個月持股'}(${esc(pk.signal)} 收盤選股，${picks.length} 檔)</h3>
          <p class="mute">產業分布：${indTop.slice(0, 8).map(([n, c]) => `${esc(n)} ${c}`).join('、')}${indTop.length > 8 ? '…' : ''}</p>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>代號</th><th>名稱</th><th style="text-align:left">產業</th><th>年化波動</th><th>每日成交金額(中位數)</th></tr></thead><tbody>
            ${picks.map(([c, n, i, v, m]) => `<tr><td>${esc(c)}</td><td>${esc(n)}</td><td style="text-align:left">${esc(i)}</td><td>${(v * 100).toFixed(1)}%</td><td>${m >= 1 ? m.toFixed(1) + ' 億' : (m * 100).toFixed(0) + ' 百萬'}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="note">資料到 ${esc(B.asof)}，當月合格股票 ${pk.n} 檔。年化波動 = 過去半年 5 日報酬標準差 × √(252/5)。歷史回測不代表未來，這裡的持股只是策略規則的結果，不是投資建議。</p>
        </div>`;
      charts(C, [k, 'b0050', 'ew'], [k, 'b0050'], k);
    }

    function draw() {
      const C = calc();
      el.querySelectorAll('.tw-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.k === view));
      if (view === 'all') renderAll(C); else renderOne(C, view);
      LTChart.bars($('#twCov'), { x: C.M.map(m => m.m), label: '合格股票數', height: 180, yMin: 0,
        xFmt: (v, tip) => tip ? v : v.endsWith('-01') ? v.slice(0, 4) : '', yFmt: v => v.toFixed(0), tipFmt: (s, v) => `${v} 檔`,
        series: [{ name: '合格股票數', y: C.M.map(m => m.n), color: 'var(--blue)' }] });
    }
    function setView(v, scroll) {
      view = v; store(VIEW_KEY, v);
      draw();
      if (scroll) $('.tw-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('.tw-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) setView(b.dataset.k); };
    $('#twScale').onchange = draw;
    draw();
  }

  /* ---------- 事件型策略(資料集 tw_strategy 的 <key>.json，pipeline/tw_strategy/events.py)：每天收盤選股、隔天開盤進場、持有幾天出場 ----------
     新增策略：events.py 的 STRATEGIES 加一筆，這裡的 EVENTS 加一筆說明，SIDES 加一筆 run: eventStrat('<key>')。
     不公開的策略(本機 private_strategies.py)：JSON 整份加密，說明文字(同 EVENTS 的格式)在解密後的 info 裡，這裡不用加 EVENTS。
     網頁端只做：做空策略依每天的放空部位比例扣借券費(年利率，可調整)、計算績效統計(一律和 0050 比較)與畫圖 */
  const EVENTS = {
    against: {
      name: '大盤跌個股逆勢漲', title: '大盤跌個股逆勢漲就是欠踹',
      idea: '大盤重挫時還逆勢大漲的股票，常是短線被拉抬、追價買盤過熱；借券賣出餘額同時創新高，代表法人與大戶也在放空。隔天開盤放空、當天收盤回補，賺短線漲多回檔的錢。',
      conds: ['加權指數當天下跌 1% 以上', '個股當天上漲 3% 以上', '收盤價在 60 日均線之上，而且 60 日均線的<b>線性迴歸斜率為正</b>(最近 60 天的 60 日均線做線性迴歸，同 XQ 的 LinearRegSlope)', '借券賣出餘額張數創 3 日新高'],
      exclude: ['選股日開盤價等於漲停價', '進場日(隔天)開盤價等於漲停價(空在漲停價不合理，這筆不放空)'],
      notes: ['<b>放空的限制</b>：借券費依上方設定的年利率扣除，未計入保證金利息；假設每檔股票都借得到券、可以在平盤以下放空，實際上有些股票不能融券，或券源不足。'],
      caveat: '借券賣出餘額在收盤後才公布，這裡假設當晚就能拿到、隔天開盤下單。',
    },
  };
  const WHY = { tp: '停利', sl: '停損', open: '持有中', delist: '下市櫃' };
  const SKIP_TXT = { up: '連兩天開盤漲停買不到', down: '開盤跌停空不到', upshort: '開盤漲停不放空', halt: '進場日沒有成交' };
  const SIDE_TXT = { long: { in: '買進', out: '賣出', inLock: '漲停', lock: '跌停', lockOut: '賣不掉' },
    short: { in: '放空', out: '回補', inLock: '跌停', lock: '漲停', lockOut: '買不回來' } };
  const NAV_COLOR = { s: 'var(--amber)', b0050: 'var(--blue)' };
  // 欄位格式(events.py 的 cols)：pct = ×100%、chg = 帶正負號的 ×100%、num = 數字%、int = 整數
  const COL_FMT = { pct: v => (v * 100).toFixed(0) + '%', chg: v => pct(v, 1), num: v => v.toFixed(1) + '%', int: v => Math.round(v).toLocaleString() };

  // 加密的策略(events.py 的 encrypt)：PBKDF2-SHA256 推導金鑰 + AES-GCM 解密；密碼錯誤時 AES-GCM 驗證失敗，回傳 null
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decrypt(E, pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(E.salt), iterations: E.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(E.iv) }, key, unb64(E.ct)))); }
    catch (e) { return null; }
  }
  // 解鎖畫面：密碼記在 sessionStorage(關掉分頁就要重新輸入)；回傳解密後的資料，切換到別的策略時回傳 null
  const PW_KEY = 'lt.twPw.';
  async function unlock(el, ctx, key, E) {
    let saved = null;
    try { saved = sessionStorage.getItem(PW_KEY + key); } catch (e) { /* 無法使用 sessionStorage */ }
    const B = saved && await decrypt(E, saved);
    if (B || !ctx.alive()) return B || null;
    el.innerHTML = `
      <div class="panel">
        <h3>需要密碼</h3>
        <p>這個策略不公開，請輸入密碼。</p>
        <form class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));align-items:end;">
          <div class="paramitem"><label for="evPw">密碼</label><input id="evPw" type="password" inputmode="numeric" autocomplete="off"></div>
          <div class="paramitem"><button type="submit">解鎖</button></div>
        </form>
        <p class="note" id="evPwMsg"></p>
      </div>`;
    const input = el.querySelector('#evPw'), msg = el.querySelector('#evPwMsg'), btn = el.querySelector('button[type=submit]');
    input.focus();
    return new Promise(resolve => {
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        btn.disabled = true; msg.textContent = '解密中…';
        const R = await decrypt(E, input.value);
        if (!ctx.alive()) return resolve(null);
        btn.disabled = false;
        if (!R) { msg.textContent = '密碼錯誤'; input.select(); return; }
        try { sessionStorage.setItem(PW_KEY + key, input.value); } catch (err) { /* 無法使用 sessionStorage */ }
        resolve(R);
      };
    });
  }

  function eventStrat(key) { return async (el, ctx) => {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B;
    try { B = (await LT.loadJSON('tw_strategy', key + '.json')).data; }
    catch (e) { if (ctx.alive()) el.innerHTML = `<div class="panel"><p class="mute">回測資料尚未產生：${esc(e.message)}</p></div>`; return; }
    if (!ctx.alive()) return;
    if (B.enc && !(B = await unlock(el, ctx, key, B.enc))) return;
    const cfg = B.info || EVENTS[key];
    const P = B.params, T0 = SIDE_TXT[B.side], long = B.side === 'long';
    const exitTxt = P.exit === 'open' ? `第 ${P.hold + 1} 個交易日開盤${T0.out}` : P.hold === 1 ? `當天收盤${T0.out}` : `第 ${P.hold} 個交易日收盤${T0.out}`;
    WHY.time = P.exit === 'close' && P.hold === 1 ? `收盤${T0.out}` : '持有期滿';
    const meta = { s: { name: cfg.name, color: NAV_COLOR.s }, b0050: { name: '0050 買進持有', color: NAV_COLOR.b0050 } };
    el.innerHTML = `
      <div class="panel">
        <h3>${esc(cfg.title)}</h3>
        <p><b>想法</b>：${cfg.idea}</p>
        <div class="doc">
          <p><b>選股規則</b>：每天收盤後，以下 ${cfg.conds.length} 個條件<b>同時</b>成立(張數單位皆為張)${cfg.exclude ? `，並排除${cfg.exclude.join('、')}` : ''}：</p>
          <ol>${cfg.conds.map(c => `<li>${c}</li>`).join('')}</ol>
          <p><b>進出場</b>：隔一個交易日<b>開盤</b>${T0.in}；${P.tp != null ? `盤中${long ? '漲' : '跌'}到 ${P.tp * 100}% 停利、${long ? '跌' : '漲'}到 ${P.sl * 100}% 停損(跳空越過則以開盤價出場，同一天兩者都碰到以停損計)；否則持有 ${P.hold} 個交易日，` : ''}${exitTxt}。同一檔股票同時只持有一筆。</p>
          <p><b>資金分配</b>：本金 100 萬元。先算出整段期間平均一天持有幾檔(只算有部位的日子，約 ${(1 / B.cap).toFixed(1)} 檔)，每筆進場金額上限 = 前一天收盤總資產 × ${(B.cap * 100).toFixed(0)}%(= 1 ÷ 平均持有檔數)，且不超過手上的現金；同一天有多檔訊號時依代號順序進場，現金用完的訊號就放棄(共 ${B.nocash.toLocaleString()} 筆)。進場金額除以進場價(含滑價與手續費)無條件捨去到整數股，持有期間不再平衡，沒用到的資金持有現金(不計利息)。${long ? '' : '放空時視為拿出同樣金額當保證金，損益 = −股價漲跌幅 × 放空金額。'}</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          ${long ? '' : '<div class="paramitem"><label for="evFee">借券費(年利率，%)</label><input id="evFee" type="number" min="0" max="20" step="0.1" value="0.1"></div>'}
          <div class="paramitem"><label for="evScale">走勢圖縱軸</label><select id="evScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
        </div>
        <p class="note">${COST_NOTE}${long ? '' : '借券費 = 放空金額 × 年利率 × 持有日曆天數 ÷ 365，可在上方調整。'}</p>
      </div>
      <div id="evPicks"></div>
      <div id="evView"></div>
      <div class="panel">
        <h3>回測作法</h3>
        <div class="doc">
          <ul>
            <li><b>淨值計算</b>：每天收盤的總資產 = 現金 ＋ 各部位市值${long ? '' : '(放空部位的市值 = 放空金額 × (1 − 股價漲跌幅))'}，期初 = 第一個訊號日收盤的 100 萬元；同一天先處理開盤出場、再進場，最後處理盤中停利停損與收盤出場。${long ? '' : '借券費依每天收盤放空部位占總資產的比例扣除。'}</li>
            <li><b>範圍與價格</b>：上市櫃普通股(不含 ETF、存託憑證)，包含已下市櫃的公司；報酬${P.tp != null ? '與停利停損' : ''}都用還原股價(含除權息)，0050 採股息再投入。</li>
            <li><b>漲跌停</b>：${long ? '進場日開盤就是漲停價，視為<b>買不到</b>，延後一天開盤買進；隔天開盤仍是漲停價就放棄這筆' : '進場日開盤就是跌停價，視為<b>空不到</b>，這筆放棄；開盤是<b>漲停價</b>也不放空、這筆取消(空在漲停價不合理)'}。要${T0.out}時(開盤或收盤)剛好是${T0.lock}價，視為<b>${T0.lockOut}</b>，延到下一個交易日同一時點再${T0.out}(可能連續延後)。漲停價 = 前一日收盤 × 1.1、跌停價 = × 0.9，依升降單位取到可成交的價格；以原始價格判斷。</li>
            <li><b>沒有成交</b>：沒有成交的日子不能當作進出場價格。進場日沒有成交${long ? '同樣延後一天，隔天仍沒有成交就放棄' : '就放棄'}；要出場時沒有成交就延到下一個交易日；持有期間下市櫃，以最後收盤價轉為現金。</li>
            ${(cfg.notes || []).map(n => `<li>${n}</li>`).join('')}
            <li><b>期間</b>：SQL 資料從 2016 年 1 月開始，回測從第一個訊號 ${esc(B.d[0])} 開始。</li>
          </ul>
          <p class="mute">仍未計入：盤中漲跌停鎖死時的停利停損成交、處置股的分盤交易；${cfg.caveat}</p>
        </div>
      </div>`;
    const $ = s => el.querySelector(s);
    // pipeline 的淨值與單筆報酬已扣手續費、交易稅、滑價；做空再依年利率扣借券費(淨值依前一天收盤的放空比例 × 日曆天數)
    const DAY = 864e5, cd = i => (Date.parse(B.d[i]) - Date.parse(B.d[i - 1])) / DAY;
    const calc = () => {
      const fee = long ? 0 : Math.max(0, +$('#evFee').value || 0) / 100, i0 = 0;
      const navs = { s: [1], b0050: B.nav.b0050 };
      for (let i = 1; i < B.d.length; i++)
        navs.s.push(navs.s[i - 1] * (B.nav.s[i] / B.nav.s[i - 1] - (long ? 0 : fee * B.expo[i - 1] * cd(i) / 365)));
      const T = B.trades.map(t => ({ c: t[0], n: t[1], e: t[2], x: t[3], why: t[5], days: t[6], delay: t[7], edelay: t[8], net: t[4] - fee * t[9] / 365 }));
      return { i0, fee, navs, st: { s: stats(navs.s), b0050: stats(navs.b0050) }, T };
    };
    const tradeRow = t => `<tr><td>${esc(t.c)}</td><td>${esc(t.n)}</td><td>${esc(t.e)}${t.edelay ? `<br><small class="mute">${T0.inLock}延後 ${t.edelay} 天</small>` : ''}</td><td>${t.x ? esc(t.x) : '—'}</td><td>${t.days}</td><td class="${cls(t.net)}">${pct(t.net, 1)}</td><td>${WHY[t.why]}${t.delay ? `<br><small class="mute">${T0.lock}延後 ${t.delay} 天</small>` : ''}</td></tr>`;
    const tradeTable = list => `<div class="tablewrap"><table class="stattable"><thead><tr><th>代號</th><th>名稱</th><th>進場日</th><th>出場日</th><th>持有天數</th><th>報酬(扣成本)</th><th>出場原因</th></tr></thead><tbody>${list.map(tradeRow).join('')}</tbody></table></div>`;

    function draw() {
      const C = calc(), { i0, navs, st, T } = C, x = st.s, S = st.b0050;
      const done = T.filter(t => t.why !== 'open'), open = T.filter(t => t.why === 'open');
      const ts = tradeStats(done.map(t => t.net), done.map(t => t.days), B.npos.slice(1));
      const by = k => done.filter(t => t.why === k).length;
      const held = ts.heldPct, avgPos = ts.pos;
      const sk = k => (B.skipped || []).filter(b => b[3] === k).length;
      const rows = yearTable(B.d, i0, navs.s, navs.b0050).map(r => { const yt = done.filter(t => t.x.startsWith(r.yr)); return { ...r, n: yt.length, w: yt.filter(t => t.net > 0).length }; });
      const yWin = rows.filter(r => r.r > r.b).length;
      $('#evView').innerHTML = `
        <div class="panel">
          <h3>回測績效</h3>
          <div class="statgrid" style="margin:12px 0;">
            ${vs0050Cards(x, S)}
            ${tradeCards(ts)}
          </div>
          <p class="note">${STAT_NOTE}每筆報酬 = 出場收回金額 ÷ 投入金額 − 1(扣手續費、交易稅、滑價${long ? '' : '與借券費'})；持倉天期以交易日計，當天進出算 1 天。</p>
          <ul class="insight">
            <li>${vs0050Txt(B.d[i0 + 1], B.asof, x, S)}，${yWin} / ${rows.length} 年贏過 0050。</li>
            <li><b>持股天數</b>：${(held * 100).toFixed(0)}% 的交易日有部位，有部位時平均 ${avgPos.toFixed(1)} 檔，其餘時間持有現金。${avgPos < 3 ? '資金常常集中在一兩檔，單筆交易的好壞對淨值影響很大。' : ''}</li>
            ${B.nocash ? `<li><b>現金不足</b>：每筆最多投入總資產的 ${(B.cap * 100).toFixed(0)}%，訊號集中的日子後面的股票沒有現金可以${T0.in}，共放棄 ${B.nocash.toLocaleString()} 筆。</li>` : ''}
            <li><b>出場原因</b>：${P.tp != null ? `停利 ${by('tp')} 筆、停損 ${by('sl')} 筆、` : ''}${WHY.time} ${by('time')} 筆${by('delist') ? `、下市櫃 ${by('delist')} 筆` : ''}${open.length ? `，目前持有中 ${open.length} 筆` : ''}。</li>
            <li><b>漲跌停與沒有成交</b>：${long ? `開盤漲停買不到、延後一天買進 ${T.filter(t => t.edelay).length} 筆；` : ''}放棄的訊號：${Object.keys(SKIP_TXT).filter(sk).map(k => `${SKIP_TXT[k]} ${sk(k)} 筆`).join('、') || '沒有'}；${T0.lock}${T0.lockOut}、延後${T0.out} ${done.filter(t => t.delay).length} 筆。</li>
          </ul>
        </div>
        <div class="panel">
          <h3>走勢</h3>
          <h4>累積報酬與回撤：${esc(cfg.name)} vs 0050</h4>
          <div id="evChart"></div>
          <div id="evLegend"></div>
          <p class="note">上方為累積報酬(期初 = 1)，下方為回撤(從前一個高點下跌的幅度)，已扣除交易成本${long ? '' : '與上方設定的借券費'}。對數刻度下，同樣的垂直距離代表同樣的報酬率；水平的部分是沒有部位、持有現金的期間。</p>
          <h4>每日持有檔數</h4>
          <div id="evPos"></div>
          <h4>每年報酬</h4>
          <div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th><th>${esc(cfg.name)}</th><th>0050</th><th>差距</th><th>出場筆數</th><th>勝率</th></tr></thead><tbody>
            ${rows.slice().reverse().map(r => `<tr><td>${r.label}</td>${heat(r.r, r.r > r.b)}${heat(r.b, false)}<td class="${cls(r.r - r.b)}">${pct(r.r - r.b, 1)}</td><td>${r.n}</td><td>${r.n ? (r.w / r.n * 100).toFixed(0) + '%' : '—'}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="note">紅色越深代表漲越多、綠色越深代表跌越多；粗體底線表示當年贏過 0050。出場筆數與勝率以出場日所在年度計。</p>
        </div>
        <div class="panel">
          <h3>交易明細</h3>
          ${open.length ? `<h4>目前持有(報酬以 ${esc(B.asof)} 收盤計，已扣進場成本${long ? '' : '與借券費'})</h4>${tradeTable(open)}` : '<p class="mute">目前沒有部位。</p>'}
          <h4>最近 20 筆已出場</h4>
          ${tradeTable(done.slice(-20).reverse())}
          ${done.length > 20 ? `<details style="margin-top:10px;"><summary>顯示全部 ${done.length} 筆</summary>${tradeTable(done.slice().reverse())}</details>` : ''}
        </div>`;
      navCharts({ d: B.d, i0, navs, meta, main: 's', log: $('#evScale').value === 'log', chart: $('#evChart'), legend: $('#evLegend') });
      LTChart.line($('#evPos'), { x: B.d.slice(i0), xType: 'date', label: '持有檔數', height: 160, xFmt: (d, tip) => tip ? d : d.slice(0, 4), yMin: 0,
        yFmt: v => v.toFixed(0), tipFmt: (s, v) => `${v} 檔`,
        series: [{ name: '持有檔數', color: NAV_COLOR.s, width: 1.2, y: B.npos.slice(i0) }] });
    }

    // 每日選股：最新一個交易日＋最近幾個交易日
    const R = B.recent, last = R[0];
    const pickRow = p => `<tr><td>${esc(p[0])}</td><td>${esc(p[1])}</td><td style="text-align:left">${esc(p[2])}</td><td>${p[3]}</td>${B.cols.map(([, f], i) => { const v = p[4 + i]; return `<td class="${f === 'chg' ? cls(v) : ''}">${v == null ? '—' : COL_FMT[f](v)}</td>`; }).join('')}</tr>`;
    $('#evPicks').innerHTML = `
      <div class="panel">
        <h3>每日選股</h3>
        <h4>${esc(last.d)} 收盤選股(下一個交易日開盤${T0.in})：${last.p.length} 檔</h4>
        ${last.p.length ? `<div class="tablewrap"><table class="stattable"><thead><tr><th>代號</th><th>名稱</th><th style="text-align:left">產業</th><th>收盤價</th>${B.cols.map(([h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${last.p.map(pickRow).join('')}</tbody></table></div>`
          : '<p class="mute">這一天沒有股票符合全部條件。</p>'}
        <h4>最近 ${R.length} 個交易日</h4>
        <div class="tablewrap"><table class="stattable"><thead><tr><th>選股日</th><th>檔數</th><th style="text-align:left">股票</th></tr></thead><tbody>
          ${R.map(r => `<tr><td>${esc(r.d)}</td><td>${r.p.length}</td><td style="text-align:left;white-space:normal">${r.p.length ? r.p.map(p => `${esc(p[0])} ${esc(p[1])}`).join('、') : '<span class="mute">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="note">資料到 ${esc(B.asof)}。歷史回測不代表未來，這裡的選股只是策略規則的結果，不是投資建議。</p>
      </div>`;
    if (!long) $('#evFee').oninput = draw; $('#evScale').onchange = draw;
    draw();
  }; }
})();
