/* 股票 · 台股 · 策略：台股策略回測(資料集 tw_strategy，pipeline/tw_strategy/update.py，資料來自本機 PostgreSQL 的 CMoney 日資料)
   最上方選策略；網頁端只做：依起始年度切出期間、依換手率扣交易成本、計算績效統計與畫圖(版型同美股策略 us-strategy.js)。
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
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const isStrat = k => k === 'ew' || STRATS.some(s => s.key === k);   // 有換股(要扣成本)的組合
  const meta = k => STRATS.find(s => s.key === k) || BENCH.find(s => s.key === k);
  const short = k => meta(k).name;
  const LOG_TICKS = [0.2, 0.5, 1, 2, 5, 10, 20];
  const mulFmt = v => v >= 10 ? v.toFixed(0) + '×' : v >= 1 ? (+v.toFixed(1)) + '×' : (+v.toFixed(2)) + '×';

  /* 期間 [i0, end] 的淨值：策略在每月換股日依換手率扣成本(單邊成本 × 換手率；期間第一天視為全部買進) */
  function navOf(B, key, i0, cost) {
    const v = B.nav[key], out = [1];
    const rebal = new Map(B.m.map(m => [m.start, m.turn[key]]));
    const strat = isStrat(key);
    if (strat) out[0] = 1 - cost;
    for (let i = i0 + 1; i < v.length; i++) {
      let x = out[out.length - 1] * v[i] / v[i - 1];
      const t = strat && i > i0 + 1 ? rebal.get(B.d[i]) : undefined;
      if (t != null) x *= 1 - cost * t;
      out.push(x);
    }
    return out;
  }
  function stats(nav) {
    const r = []; for (let i = 1; i < nav.length; i++) r.push(nav[i] / nav[i - 1] - 1);
    const yrs = r.length / 252, cagr = nav[nav.length - 1] ** (1 / yrs) - 1;
    const m = r.reduce((a, b) => a + b, 0) / r.length, vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
    let peak = -Infinity, mdd = 0; nav.forEach(x => { peak = Math.max(peak, x); mdd = Math.min(mdd, x / peak - 1); });
    return { ret: cagr, vol, sharpe: cagr / vol, mdd, mult: nav[nav.length - 1] };
  }

  // 最上方的策略選擇：新增策略時加一筆，尚未完成的設 soon: true(顯示「努力建置中」)
  const FAMILIES = [
    { key: 'lowvol', name: '低波動選股', desc: '每月挑選過去半年波動最小的股票，持有一個月' },
    { key: 'more', name: '其他策略', desc: '更多台股策略', soon: true },
  ];
  const FAMILY_KEY = 'lt.twFamily';

  LT.register({
    section: 'stock', group: '台股', key: 'tw-strategy', name: '策略',
    async mount(el, ctx) {
      let fam = 'lowvol';
      try { const v = localStorage.getItem(FAMILY_KEY); if (FAMILIES.some(f => f.key === v)) fam = v; } catch (e) { /* 無法使用 localStorage */ }
      el.innerHTML = `
        <header class="top"><div>
          <h1>台股策略</h1>
          <p>選擇要看的策略，與買進持有 0050 比較報酬與風險</p>
        </div></header>
        <div class="panel"><div class="mode-tabs us-family tw-family">${FAMILIES.map(f => `<button class="mode-tab" data-f="${f.key}"><b>${esc(f.name)}</b><small>${f.soon ? '努力建置中' : esc(f.desc)}</small></button>`).join('')}</div></div>
        <div id="twFam"></div>`;
      const famEl = el.querySelector('#twFam');
      let seq = 0;   // 每次切換策略加 1：還在載入的舊策略結果不會蓋掉新選的
      const showFam = f => {
        fam = f;
        try { localStorage.setItem(FAMILY_KEY, f); } catch (e) { /* 無法使用 localStorage */ }
        el.querySelectorAll('.tw-family .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.f === f));
        if (FAMILIES.find(x => x.key === f).soon) famEl.innerHTML = LT.UNDER_CONSTRUCTION;
        else { const my = ++seq; lowvol(famEl, { alive: () => ctx.alive() && seq === my }); }
      };
      el.querySelector('.tw-family').onclick = e => { const b = e.target.closest('[data-f]'); if (b && b.dataset.f !== fam) showFam(b.dataset.f); };
      showFam(fam);
    },
  });

  /* ---------- 低波動選股 ---------- */
  async function lowvol(el, ctx) {
    el.innerHTML = `<div id="twBody"><div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div></div>`;
    let B;
    try { B = (await LT.loadJSON('tw_strategy', 'backtest.json')).data; }
    catch (e) { if (ctx.alive()) el.querySelector('#twBody').innerHTML = `<div class="panel"><p class="mute">回測資料尚未產生：${esc(e.message)}</p></div>`; return; }
    if (!ctx.alive()) return;
    const P = B.params, years = [...new Set(B.m.map(m => +m.m.slice(0, 4)))];
    let view = 'all';
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'all' || STRATS.some(s => s.key === v)) view = v; } catch (e) { /* 無法使用 localStorage */ }

    el.querySelector('#twBody').innerHTML = `
      <div class="panel">
        <div class="mode-tabs tw-tabs">
          <button class="mode-tab" data-k="all"><b>總覽比較</b><small>兩種低波動組合與 0050 並列</small></button>
          ${STRATS.map(s => `<button class="mode-tab" data-k="${s.key}"><b>${esc(s.name)}</b><small>${esc(s.short)}</small></button>`).join('')}
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="twFrom">回測起點</label><select id="twFrom">${years.map((y, j) => `<option value="${y}">${j ? y + ' 年初' : B.m[0].start.replace(/-/g, '/') + ' 起'}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="twCost">交易成本(單邊，%)</label><input id="twCost" type="number" min="0" max="2" step="0.05" value="0.3"></div>
          <div class="paramitem"><label for="twScale">走勢圖縱軸</label><select id="twScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
        </div>
        <p class="note">交易成本預設 0.3%：買進手續費 0.1425%、賣出手續費 0.1425% ＋ 證交稅 0.3%，平均每邊約 0.29%(未計券商折扣)。</p>
      </div>
      <div id="twView"></div>
      <div class="panel">
        <h3>規則與資料</h3>
        <div class="doc">
          <ul>
            <li><b>選股</b>：每月最後一個交易日收盤後，計算每檔普通股過去 ${P.lookback} 個交易日(約半年)<b>5 日報酬的標準差</b>，由小到大排序，取最小的 ${P.top_n} 檔或 ${P.top_pct * 100}%，等權重。</li>
            <li><b>進出場</b>：下一個交易日<b>開盤</b>買進，持有到下個月第一個交易日開盤換股；持有期間不再平衡，權重隨股價漂移。</li>
            <li><b>流動性條件</b>：選股日當天有成交、過去半年至少 ${P.min_traded * 100}% 的日子有成交、每日成交金額中位數至少 ${(P.min_value / 1000).toFixed(0)} 百萬元。沒成交的日子價格不變，這種股票的波動「看起來」很低，不加條件會選到一堆幾乎買不到的冷門股。</li>
            <li><b>範圍</b>：上市櫃普通股(不含 ETF、存託憑證)，包含期間內已下市櫃的公司；持有期間下市，以最後收盤價轉為現金(不計利息)。</li>
            <li><b>報酬</b>：用還原股價計算(含現金股利再投入)，0050 也用還原股價。</li>
            <li><b>期間</b>：CMoney 資料從 2016 年 1 月開始，需要先累積半年的資料計算波動，回測從 ${esc(B.m[0].start)} 開始。</li>
          </ul>
          <h4>和原始版本的差別(修正前視偏誤)</h4>
          <p>原始版本(<a href="https://github.com/rebornlife0218/Trading_Strategy/tree/cf78ce9/LowVolatility" target="_blank" rel="noopener">Trading_Strategy/LowVolatility</a>，Yahoo Finance、2014~2024)有幾個會讓回測結果偏好的地方：</p>
          <ul>
            <li><b>前視偏誤</b>：用當天收盤價算出波動、決定持股，同一天的報酬就算進組合，等於事先知道當天的價格。這裡改為月底收盤後選股、隔天開盤才進場。</li>
            <li><b>倖存者偏差</b>：股票清單是「現在」的上市櫃公司，期間內下市、被併購的公司都不在裡面。這裡使用每個月當時有交易的股票，包含後來下市櫃的公司。</li>
            <li><b>比較基準不公平</b>：個股用含股息的還原股價，大盤卻用不含股息的加權指數，每年大約少算 3～4% 的股利。這裡改為與 0050 的還原股價比較。</li>
            <li><b>沒有流動性條件、沒有交易成本</b>：見上方說明。</li>
          </ul>
          <p class="mute">仍未計入：滑價、漲跌停買不到或賣不掉、處置股的分盤交易；換股以開盤價成交，實際成交價可能不同。</p>
        </div>
        <h4>每月合格股票數</h4>
        <div id="twCov"></div>
      </div>`;

    const $ = s => el.querySelector(s);
    const calc = () => {
      const y0 = +$('#twFrom').value, cost = Math.max(0, +$('#twCost').value || 0) / 100;
      const m0 = B.m.findIndex(m => +m.m.slice(0, 4) >= y0), M = B.m.slice(m0);
      const i0 = B.d.indexOf(M[0].start) - 1;   // 換股日的前一天收盤(= 下一個開盤)為期初
      const navs = {}, st = {};
      [...STRATS, ...BENCH].forEach(s => { navs[s.key] = navOf(B, s.key, i0, cost); st[s.key] = stats(navs[s.key]); });
      const mIdx = M.map(m => B.d.indexOf(m.start) - 1 - i0).concat([B.d.length - 1 - i0]);
      const mret = k => mIdx.slice(0, -1).map((a, j) => navs[k][mIdx[j + 1]] / navs[k][a] - 1);
      const turnAvg = k => M.slice(1).reduce((a, m) => a + m.turn[k], 0) / Math.max(1, M.length - 1);
      return { y0, cost, i0, M, navs, st, mret, bQ: mret('b0050'), turnAvg };
    };
    const beat = (v, b, hi = true) => (hi ? v > b : v < b) ? 'beat' : '';
    const periodTxt = C => `${B.d[C.i0 + 1].replace(/-/g, '/')} 到 ${B.asof.replace(/-/g, '/')}`;

    function charts(C, keys, ddKeys, main) {
      const log = $('#twScale').value === 'log', { i0, navs } = C;
      const step = Math.max(1, Math.floor((B.d.length - i0) / 700)), idx = [];
      for (let i = 0; i < B.d.length - i0; i += step) idx.push(i);
      if (idx[idx.length - 1] !== B.d.length - 1 - i0) idx.push(B.d.length - 1 - i0);
      const xs = idx.map(i => B.d[i0 + i]), xFmt = (d, tip) => tip ? d : d.slice(0, 4);
      LTChart.line($('#twChart'), { x: xs, xType: 'date', label: '累積報酬', height: 320, xFmt,
        yFmt: log ? v => mulFmt(10 ** v) : v => mulFmt(v), tipFmt: log ? (s, v) => (10 ** v).toFixed(2) + ' 倍' : (s, v) => v.toFixed(2) + ' 倍',
        yTicks: log ? () => LOG_TICKS.map(Math.log10) : undefined, refY: [{ y: log ? 0 : 1 }],
        series: keys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === main ? 2.6 : 1.5, dash: k === 'ew' ? '5 4' : undefined,
          y: idx.map(i => log ? Math.log10(navs[k][i]) : navs[k][i]) })) });
      $('#twLegend').innerHTML = LTChart.legend(keys.map(meta));
      const dd = k => { let pk = -Infinity; return navs[k].map(v => { pk = Math.max(pk, v); return v / pk - 1; }); };
      const D = Object.fromEntries(ddKeys.map(k => [k, dd(k)]));
      LTChart.line($('#twDD'), { x: xs, xType: 'date', label: '回撤', height: 200, xFmt, yMax: 0,
        yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => (v * 100).toFixed(1) + '%',
        series: ddKeys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === main ? 1.8 : 1.4, y: idx.map(i => D[k][i]) })) });
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
    const heat = (v, beatIt) => { const c = v >= 0 ? 'var(--up)' : 'var(--down)', a = Math.min(55, Math.abs(v) * 110);
      return `<td class="${beatIt ? 'beat' : ''}" style="background:color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)">${pct(v, 1)}</td>`; };
    const yrLabel = (C, r) => `${r.yr}${r.partial ? `<br><small class="mute">${r.yr === B.asof.slice(0, 4) ? '至 ' + B.asof.slice(5).replace('-', '/') : B.d[C.i0 + 1].slice(5).replace('-', '/') + ' 起'}</small>` : ''}`;
    const chartBlock = title => `
      <h4>${title}</h4>
      <div id="twChart"></div>
      <div id="twLegend"></div>
      <p class="note">已依上方設定扣除交易成本。對數刻度下，同樣的垂直距離代表同樣的報酬率(例如 1→2 和 5→10 都是翻倍)。</p>
      <h4>回撤：從前一個高點下跌的幅度</h4>
      <div id="twDD"></div>`;

    /* ---------- 總覽比較 ---------- */
    function renderAll(C) {
      const { st, mret, bQ, turnAvg, cost } = C, S = st.b0050;
      const row = (s, strat) => { const x = st[s.key];
        const mr = strat ? mret(s.key) : null, w = mr ? mr.filter((v, j) => v > bQ[j]).length / mr.length : null;
        return `<tr class="${strat ? 'click' : 'allrow'}" ${strat ? `data-go="${s.key}"` : ''}><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td>
          <td class="${cls(x.ret)} ${strat ? beat(x.ret, S.ret) : ''}">${pct(x.ret)}</td><td class="${strat ? beat(x.vol, S.vol, false) : ''}">${(x.vol * 100).toFixed(1)}%</td>
          <td class="${strat ? beat(x.sharpe, S.sharpe) : ''}">${x.sharpe.toFixed(2)}</td><td class="down ${strat ? beat(x.mdd, S.mdd) : ''}">${pct(x.mdd, 1)}</td>
          <td>${x.mult.toFixed(1)} 倍</td><td>${w == null ? '—' : (w * 100).toFixed(0) + '%'}</td><td>${isStrat(s.key) ? (turnAvg(s.key) / 2 * 100).toFixed(0) + '%' : '—'}</td></tr>`; };
      const keys = [...STRATS.map(s => s.key), 'b0050', 'ew'], rows = yearRows(C, keys);
      const wins = k => rows.filter(r => r.r[k] > r.r.b0050).length;
      const E = st.ew, lv = st.lv10p;
      const topInd = (P, n) => { const c = {}; P.forEach(p => { const k = (p[2] || '其他').replace(/^OTC/, '').replace(/類$/, ''); c[k] = (c[k] || 0) + 1; });
        return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => esc(k)).join('、'); };
      $('#twView').innerHTML = `
        <div class="panel">
          <h3>低波動 vs 0050</h3>
          <div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>組合</th><th>選股規則</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>最大回撤</th><th>資產成長</th><th>贏 0050 的月數</th><th>每月換手率(單邊)</th></tr></thead>
            <tbody>${STRATS.map(s => row(s, true)).join('')}${BENCH.map(s => row(s, false)).join('')}</tbody></table></div>
          <p class="note">粗體底線表示優於 0050；點選策略列可切換到該策略的分析。夏普值 = 年化報酬 ÷ 年化波動(無風險利率以 0 計，與原始版本相同)；換手率(單邊) = 每月賣出(或買進)金額占資產的比例；交易成本 = 單邊成本 × (賣出 + 買進金額)，在每次換股時扣除。</p>
          <ul class="insight">
            <li>${periodTxt(C)}，0050 年化 ${pct(S.ret)}、年化波動 ${(S.vol * 100).toFixed(1)}%、最大回撤 ${pct(S.mdd, 1)}。</li>
            <li><b>波動確實比較低</b>：低波動 10% 的年化波動 ${(lv.vol * 100).toFixed(1)}%，${lv.vol < S.vol ? '低於' : '高於'} 0050；最大回撤 ${pct(lv.mdd, 1)}${lv.mdd > S.mdd ? '，比 0050 淺' : ''}。</li>
            <li>${lv.ret < S.ret ? `<b>報酬落後 0050</b>：0050 資產成長 ${S.mult.toFixed(1)} 倍、低波動 10% ${lv.mult.toFixed(1)} 倍。0050 以台積電等大型電子股為主，低波動 10% 目前持股以${topInd(B.picks.lv10p, 3)}為主，${E.ret < S.ret ? '連全部股票等權重也落後 0050，代表這段期間是少數大型權值股領漲' : '漲勢參與得比較少'}。` : `<b>報酬贏過 0050</b>：低波動 10% 資產成長 ${lv.mult.toFixed(1)} 倍，0050 ${S.mult.toFixed(1)} 倍。`}</li>
            <li><b>和等權重比</b>：全部合格股票等權重年化 ${pct(E.ret)}、夏普值 ${E.sharpe.toFixed(2)}；低波動 10% 夏普值 ${lv.sharpe.toFixed(2)}，${lv.sharpe > E.sharpe ? '風險調整後比等權重好，低波動因子在台股有一些效果' : '風險調整後也沒有比等權重好，這段期間台股的低波動因子沒有超額報酬'}。單邊成本 ${(cost * 100).toFixed(2)}% 時，低波動 10 檔每年成本約 ${(turnAvg('lv10') * cost * 12 * 100).toFixed(1)}%。</li>
          </ul>
        </div>
        <div class="panel">
          <h3>走勢比較</h3>
          ${chartBlock('累積報酬(期初 = 1)')}
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
      const { st, mret, bQ, turnAvg, cost, M } = C, s = meta(k), x = st[k], S = st.b0050;
      const d = mret(k).map((v, j) => v - bQ[j]), win = d.filter(v => v > 0).length;
      const rows = yearRows(C, [k, 'b0050', 'ew']), yWin = rows.filter(r => r.r[k] > r.r.b0050).length;
      const bi = d.indexOf(Math.max(...d)), wi = d.indexOf(Math.min(...d)), dMean = d.reduce((a, b) => a + b, 0) / d.length;
      const pk = B.picks, picks = pk[k];
      const ind = {}; picks.forEach(p => { ind[p[2] || '其他'] = (ind[p[2] || '其他'] || 0) + 1; });
      const indTop = Object.entries(ind).sort((a, b) => b[1] - a[1]);
      const card = (v, label, sub, c = '') => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${label}<br>${sub}</div></div>`;
      $('#twView').innerHTML = `
        <div class="panel">
          <h3>${esc(s.name)}</h3>
          <p><b>選股規則</b>：每月最後一個交易日收盤後，${esc(s.short)}，隔天開盤進場、持有一個月。<b>想法</b>：${esc(s.idea)}</p>
          <div class="statgrid" style="margin:12px 0;">
            ${card(pct(x.ret), '年化報酬', `0050 ${pct(S.ret)}`, `${cls(x.ret)} ${beat(x.ret, S.ret)}`)}
            ${card((x.vol * 100).toFixed(1) + '%', '年化波動', `0050 ${(S.vol * 100).toFixed(1)}%`, beat(x.vol, S.vol, false))}
            ${card(x.sharpe.toFixed(2), '夏普值', `0050 ${S.sharpe.toFixed(2)}`, beat(x.sharpe, S.sharpe))}
            ${card(pct(x.mdd, 1), '最大回撤', `0050 ${pct(S.mdd, 1)}`, `down ${beat(x.mdd, S.mdd)}`)}
            ${card(`${(win / d.length * 100).toFixed(0)}%`, '贏 0050 的月數', `${win} / ${d.length} 個月，年度 ${yWin} / ${rows.length}`)}
            ${card(`${(turnAvg(k) / 2 * 100).toFixed(0)}%`, '每月換手率(單邊)', `每年成本約 ${(turnAvg(k) * cost * 12 * 100).toFixed(1)}%`)}
          </div>
          <ul class="insight">
            <li>${periodTxt(C)}，資產成長 ${x.mult.toFixed(1)} 倍(0050 ${S.mult.toFixed(1)} 倍)；年化報酬${x.ret > S.ret ? '高於' : '低於'} 0050 ${pct(Math.abs(x.ret - S.ret)).replace('+', '')}，年化波動${x.vol < S.vol ? '低於' : '高於'} 0050(${(x.vol * 100).toFixed(1)}% vs ${(S.vol * 100).toFixed(1)}%)。</li>
            <li>每月平均比 0050 ${dMean >= 0 ? '多' : '少'} ${pct(Math.abs(dMean)).replace('+', '')}；表現最好的一個月 ${M[bi].m} 贏 ${pct(d[bi], 1)}，最差的一個月 ${M[wi].m} 輸 ${pct(d[wi], 1)}。</li>
            <li>最大回撤 ${pct(x.mdd, 1)}，${x.mdd < S.mdd ? `比 0050 的 ${pct(S.mdd, 1)} 更深` : `比 0050 的 ${pct(S.mdd, 1)} 淺：低波動的好處主要在跌勢`}。</li>
          </ul>
        </div>
        <div class="panel">
          <h3>走勢</h3>
          ${chartBlock(`累積報酬(期初 = 1)：${esc(short(k))} vs 0050 vs 全部合格股票等權重`)}
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
      view = v;
      try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* 無法使用 localStorage */ }
      draw();
      if (scroll) $('.tw-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('.tw-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) setView(b.dataset.k); };
    $('#twFrom').onchange = draw; $('#twCost').oninput = draw; $('#twScale').onchange = draw;
    draw();
  }
})();
