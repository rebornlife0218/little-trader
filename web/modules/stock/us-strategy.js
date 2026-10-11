/* 股票 · 美股 · 策略：S&P500 季度換股策略回測(資料集 sp500，pipeline/sp500/update.py)
   使用每季當時真實的歷史成分股；已下市公司的股價來自 Tiingo，降低倖存者偏差。
   最上方選擇要看的分析(總覽比較或單一策略)；網頁端只做：依起始年度切出期間、依換手率扣交易成本、計算績效統計與畫圖。
   新增策略：pipeline 的 run() 加一種選股規則，這裡的 STRATS 加一筆 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STRATS = [
    { key: 's1', name: '策略一：上季贏家', short: '上一季報酬最好的 10 檔，等權重', idea: '動能(momentum)：漲多的股票繼續漲。', color: 'var(--amber)' },
    { key: 's2', name: '策略二：上季輸家', short: '上一季報酬最差的 10 檔，等權重', idea: '反轉(reversal)：跌深的股票會反彈。', color: 'var(--down)' },
    { key: 's3', name: '策略三：上季高夏普＋最佳化', short: '上一季夏普值最好的 20 檔，以極大化夏普值分配權重(只做多)', idea: '風險調整後的動能，再用平均數–變異數最佳化決定權重。', color: '#a78bfa' },
    { key: 's4', name: '策略四：上季贏家中低波動', short: '上一季報酬最好的 20 檔中，波動最小的 10 檔，等權重', idea: '動能＋低波動：想保留漲勢又降低風險。', color: 'var(--up)' },
  ];
  const BENCH = [
    { key: 'spy', name: 'SPY 買進持有', short: 'S&P500 ETF(市值加權)，比較基準', color: 'var(--blue)' },
    { key: 'ew', name: '全部成分股等權重', short: '每季把當時所有可用的成分股等權重買進(本回測自算)', color: '#94a3b8' },
  ];
  const VIEW_KEY = 'lt.usView';
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const isStrat = k => k === 'ew' || STRATS.some(s => s.key === k);   // 有換股(要扣成本)的組合
  const meta = k => STRATS.find(s => s.key === k) || BENCH.find(s => s.key === k);
  const short = k => meta(k).name.split('：')[0];
  const LOG_TICKS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const mulFmt = v => v >= 10 ? v.toFixed(0) + '×' : v >= 1 ? (+v.toFixed(1)) + '×' : (+v.toFixed(2)) + '×';

  /* 期間 [i0, end] 的淨值：策略在每季換股日依換手率扣成本(單邊成本 × 換手率；期間第一天視為全部買進) */
  function navOf(B, key, i0, cost) {
    const v = B.nav[key], out = [1];
    const rebal = new Map(B.q.map(q => [q.start, q.turn ? q.turn[key] : undefined]));
    const strat = isStrat(key);
    if (strat) out[0] = 1 - cost;
    for (let i = i0 + 1; i < v.length; i++) {
      if (v[i] == null || v[i - 1] == null) { out.push(out[out.length - 1]); continue; }
      let x = out[out.length - 1] * v[i] / v[i - 1];
      const t = strat ? rebal.get(B.d[i]) : undefined;
      if (t != null) x *= 1 - cost * t;
      out.push(x);
    }
    return out;
  }
  function stats(nav, rf) {
    const r = []; for (let i = 1; i < nav.length; i++) r.push(nav[i] / nav[i - 1] - 1);
    const yrs = r.length / 252, cagr = nav[nav.length - 1] ** (1 / yrs) - 1;
    const m = r.reduce((a, b) => a + b, 0) / r.length, vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
    let peak = -Infinity, mdd = 0; nav.forEach(x => { peak = Math.max(peak, x); mdd = Math.min(mdd, x / peak - 1); });
    return { ret: cagr, vol, sharpe: (cagr - rf) / vol, mdd, mult: nav[nav.length - 1] };
  }

  // 最上方的策略選擇：新增策略時加一筆，尚未完成的設 soon: true(顯示「努力建置中」)
  const FAMILIES = [
    { key: 'sp500', name: 'S&P500 季度換股', desc: '每季依上一季的表現，從當時的 S&P500 成分股挑選股票持有一季' },
    { key: 'more', name: '其他策略', desc: '更多美股策略', soon: true },
  ];
  const FAMILY_KEY = 'lt.usFamily';

  LT.register({
    section: 'stock', group: '美股', key: 'us-strategy', name: '策略',
    async mount(el, ctx) {
      let fam = 'sp500';
      try { const v = localStorage.getItem(FAMILY_KEY); if (FAMILIES.some(f => f.key === v)) fam = v; } catch (e) { /* 無法使用 localStorage */ }
      el.innerHTML = `
        <header class="top"><div>
          <h1>美股策略</h1>
          <p>選擇要看的策略，與買進持有 SPY 比較報酬與風險</p>
        </div></header>
        <div class="panel"><div class="mode-tabs us-family">${FAMILIES.map(f => `<button class="mode-tab" data-f="${f.key}"><b>${esc(f.name)}</b><small>${f.soon ? '努力建置中' : esc(f.desc)}</small></button>`).join('')}</div></div>
        <div id="usFam"></div>`;
      const famEl = el.querySelector('#usFam');
      let seq = 0;   // 每次切換策略加 1：還在載入的舊策略結果不會蓋掉新選的
      const showFam = f => {
        fam = f;
        try { localStorage.setItem(FAMILY_KEY, f); } catch (e) { /* 無法使用 localStorage */ }
        el.querySelectorAll('.us-family .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.f === f));
        if (FAMILIES.find(x => x.key === f).soon) famEl.innerHTML = LT.UNDER_CONSTRUCTION;
        else { const my = ++seq; sp500(famEl, { alive: () => ctx.alive() && seq === my }); }
      };
      el.querySelector('.us-family').onclick = e => { const b = e.target.closest('[data-f]'); if (b && b.dataset.f !== fam) showFam(b.dataset.f); };
      showFam(fam);
    },
  });

  /* ---------- S&P500 季度換股 ---------- */
  async function sp500(el, ctx) {
      el.innerHTML = `<div id="usBody"><div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div></div>`;
      let B;
      try { B = (await LT.loadJSON('sp500', 'backtest.json')).data; }
      catch (e) { if (ctx.alive()) el.querySelector('#usBody').innerHTML = `<div class="panel"><p class="mute">回測資料尚未產生：${esc(e.message)}</p></div>`; return; }
      if (!ctx.alive()) return;
      const years = [...new Set(B.q.map(q => +q.q.slice(0, 4)))].filter(y => y % 5 === 0 || y === 2008);
      const cur = B.q[B.q.length - 1];
      let view = 'all';
      try { const v = localStorage.getItem(VIEW_KEY); if (v === 'all' || STRATS.some(s => s.key === v)) view = v; } catch (e) { /* 無法使用 localStorage */ }

      el.querySelector('#usBody').innerHTML = `
        <div class="panel">
          <div class="mode-tabs us-tabs">
            <button class="mode-tab" data-k="all"><b>總覽比較</b><small>四種策略與 SPY 並列</small></button>
            ${STRATS.map(s => `<button class="mode-tab" data-k="${s.key}"><b>${esc(s.name)}</b><small>${esc(s.idea)}</small></button>`).join('')}
          </div>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
            <div class="paramitem"><label for="usFrom">回測起點</label><select id="usFrom">${years.map(y => `<option value="${y}" ${y === 2000 ? 'selected' : ''}>${y} 年初</option>`).join('')}</select></div>
            <div class="paramitem"><label for="usCost">交易成本(單邊，%)</label><input id="usCost" type="number" min="0" max="2" step="0.05" value="0.1"></div>
            <div class="paramitem"><label for="usScale">走勢圖縱軸</label><select id="usScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
          </div>
        </div>
        <div id="usView"></div>
        <div class="panel">
          <h3>資料夠嚴謹嗎？</h3>
          <div class="doc">
            <p><b>倖存者偏差</b>：如果只用「現在」的成分股或只用還在交易的股票回測，破產、被併購、被剔除的公司都不會出現，結果會偏好。本回測每季使用當時真實的成分股名單，但免費資料仍有缺口：</p>
          </div>
          <h4>每季可取得股價的成分股比例</h4>
          <div id="usCov"></div>
          <div class="doc">
            <p>2000 年代初期約六成，2012 年後約九成以上；只能從可取得股價的股票中選股。</p>
            <ul>
              <li><b>已下市公司的股價</b>：Yahoo 只有目前仍在交易的股票，已下市、被併購的成分股改用 Tiingo 的歷史股價補上，回測結果都已包含這些公司；仍查不到股價的公司無法納入(見上圖的比例)。</li>
              <li><b>Yahoo 的代號沿用問題</b>：有些已下市公司的代號被別家公司拿去用(例如 El Paso 的 EP，現在是小型股 Empire Petroleum)，Yahoo 會給出新公司的股價。本回測用成交金額篩掉這種情況，但兩家都是大型股的少數情況(例如舊 AT&amp;T 與 SBC 的 T)無法完全排除。</li>
              <li><b>下市的處理</b>：持有期間股票下市，以最後一個價格轉為現金(不計利息)；破產公司的最後價格通常已接近 0。</li>
              <li><b>沒有計入</b>：稅、借券與流動性；換股價格用季末收盤價，實際交易會有滑價。</li>
            </ul>
          </div>
        </div>`;

      const $ = s => el.querySelector(s);
      // 共用的計算：期間、各組合淨值與統計、每季報酬
      const calc = () => {
        const y0 = +$('#usFrom').value, cost = Math.max(0, +$('#usCost').value || 0) / 100;
        const q0 = B.q.findIndex(q => +q.q.slice(0, 4) >= y0), i0 = B.d.indexOf(B.q[q0].start);
        const Q = B.q.slice(q0), rf = Q.reduce((a, q) => a + q.rf, 0) / Q.length;
        const navs = {}, st = {};
        [...STRATS, ...BENCH].forEach(s => { navs[s.key] = navOf(B, s.key, i0, cost); st[s.key] = stats(navs[s.key], rf); });
        const qIdx = Q.map(q => B.d.indexOf(q.start) - i0).concat([B.d.length - 1 - i0]);
        const qret = k => qIdx.slice(0, -1).map((a, j) => navs[k][qIdx[j + 1]] / navs[k][a] - 1);
        const turnAvg = k => Q.slice(1).reduce((a, q) => a + q.turn[k], 0) / Math.max(1, Q.length - 1);
        return { y0, cost, i0, Q, navs, st, qret, spyQ: qret('spy'), turnAvg };
      };
      const beat = (v, b, hi = true) => (hi ? v > b : v < b) ? 'beat' : '';

      /* 累積報酬、回撤：keys 為要畫的組合，main 為加粗的那一條 */
      function charts(C, keys, ddKeys, main) {
        const log = $('#usScale').value === 'log', { i0, navs } = C;
        const step = Math.max(1, Math.floor((B.d.length - i0) / 700)), idx = [];
        for (let i = 0; i < B.d.length - i0; i += step) idx.push(i);
        if (idx[idx.length - 1] !== B.d.length - 1 - i0) idx.push(B.d.length - 1 - i0);
        const xs = idx.map(i => B.d[i0 + i]), xFmt = (d, tip) => tip ? d : d.slice(0, 4);
        LTChart.line($('#usChart'), { x: xs, xType: 'date', label: '累積報酬', height: 320, xFmt,
          yFmt: log ? v => mulFmt(10 ** v) : v => mulFmt(v), tipFmt: log ? (s, v) => (10 ** v).toFixed(2) + ' 倍' : (s, v) => v.toFixed(2) + ' 倍',
          yTicks: log ? () => LOG_TICKS.map(Math.log10) : undefined, refY: [{ y: log ? 0 : 1 }],
          series: keys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === main ? 2.6 : 1.5, dash: k === 'ew' ? '5 4' : undefined,
            y: idx.map(i => log ? Math.log10(navs[k][i]) : navs[k][i]) })) });
        $('#usLegend').innerHTML = LTChart.legend(keys.map(meta));
        const dd = k => { let pk = -Infinity; return navs[k].map(v => { pk = Math.max(pk, v); return v / pk - 1; }); };
        const D = Object.fromEntries(ddKeys.map(k => [k, dd(k)]));
        LTChart.line($('#usDD'), { x: xs, xType: 'date', label: '回撤', height: 200, xFmt, yMax: 0,
          yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => (v * 100).toFixed(1) + '%',
          series: ddKeys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === main ? 1.8 : 1.4, y: idx.map(i => D[k][i]) })) });
      }
      /* 每年報酬(熱度表)：每年最後一個交易日的淨值比 */
      function yearRows(C, keys) {
        const { i0, navs, y0 } = C, ends = [], rows = [];
        for (let i = 0; i < B.d.length - i0; i++) {
          const yr = B.d[i0 + i].slice(0, 4), nx = B.d[i0 + i + 1];
          if (!nx || nx.slice(0, 4) !== yr) ends.push({ yr, i });
        }
        ends.forEach((e, j) => {
          if (+e.yr < y0) return;   // 起點前一天(上一年最後一個交易日)
          const a = j ? ends[j - 1].i : 0;
          rows.push({ yr: e.yr, partial: !B.d[i0 + e.i + 1] && !B.d[i0 + e.i].endsWith('12-31'), r: Object.fromEntries(keys.map(k => [k, navs[k][e.i] / navs[k][a] - 1])) });
        });
        return rows;
      }
      const heat = (v, beatIt) => { const c = v >= 0 ? 'var(--up)' : 'var(--down)', a = Math.min(55, Math.abs(v) * 110);
        return `<td class="${beatIt ? 'beat' : ''}" style="background:color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)">${pct(v, 1)}</td>`; };
      const yrLabel = r => `${r.yr}${r.partial ? `<br><small class="mute">至 ${B.asof.slice(5).replace('-', '/')}</small>` : ''}`;
      const chartBlock = title => `
        <h4>${title}</h4>
        <div id="usChart"></div>
        <div id="usLegend"></div>
        <p class="note">已依上方設定扣除交易成本。對數刻度下，同樣的垂直距離代表同樣的報酬率(例如 1→2 和 5→10 都是翻倍)，長期走勢不會被後期的大數字壓扁。</p>
        <h4>回撤：從前一個高點下跌的幅度</h4>
        <div id="usDD"></div>`;

      /* ---------- 總覽比較 ---------- */
      function renderAll(C) {
        const { st, qret, spyQ, turnAvg, cost, y0, Q } = C, S = st.spy;
        const row = (s, strat) => { const x = st[s.key];
          const qr = strat ? qret(s.key) : null, w = qr ? qr.filter((v, j) => v > spyQ[j]).length / qr.length : null;
          return `<tr class="${strat ? 'click' : 'allrow'}" ${strat ? `data-go="${s.key}"` : ''}><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td>
            <td class="${cls(x.ret)} ${strat ? beat(x.ret, S.ret) : ''}">${pct(x.ret)}</td><td class="${strat ? beat(x.vol, S.vol, false) : ''}">${(x.vol * 100).toFixed(1)}%</td>
            <td class="${strat ? beat(x.sharpe, S.sharpe) : ''}">${x.sharpe.toFixed(2)}</td><td class="down ${strat ? beat(x.mdd, S.mdd) : ''}">${pct(x.mdd, 1)}</td>
            <td>${x.mult.toFixed(1)} 倍</td><td>${w == null ? '—' : (w * 100).toFixed(0) + '%'}</td><td>${isStrat(s.key) ? (turnAvg(s.key) / 2 * 100).toFixed(0) + '%' : '—'}</td></tr>`; };
        const best = STRATS.slice().sort((a, b) => st[b.key].sharpe - st[a.key].sharpe)[0];
        const beatRet = STRATS.filter(s => st[s.key].ret > S.ret), beatSh = STRATS.filter(s => st[s.key].sharpe > S.sharpe);
        const keys = [...STRATS.map(s => s.key), 'spy', 'ew'], rows = yearRows(C, keys);
        const wins = k => rows.filter(r => r.r[k] > r.r.spy).length;
        $('#usView').innerHTML = `
          <div class="panel">
            <h3>四種策略 vs SPY</h3>
            <div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>策略</th><th>選股規則</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>最大回撤</th><th>資產成長</th><th>贏 SPY 的季數</th><th>每季換手率(單邊)</th></tr></thead>
              <tbody>${STRATS.map(s => row(s, true)).join('')}${BENCH.map(s => row(s, false)).join('')}</tbody></table></div>
            <p class="note">粗體底線表示優於 SPY；點選策略列可切換到該策略的分析。夏普值 = (年化報酬 − 無風險利率) ÷ 年化波動，無風險利率用期間內美國 3 個月國庫券殖利率的平均；換手率(單邊) = 每季賣出(或買進)金額占資產的比例，100% 代表整批換掉；交易成本 = 單邊成本 × (賣出 + 買進金額)，在每次換股時扣除。</p>
            <ul class="insight">
              <li>${y0} 年初到 ${B.asof.slice(0, 7).replace('-', '/')}，SPY 年化 ${pct(S.ret)}、夏普值 ${S.sharpe.toFixed(2)}、最大回撤 ${pct(S.mdd, 1)}。</li>
              <li><b>年化報酬</b>贏過 SPY 的有 ${beatRet.length ? beatRet.map(s => short(s.key)).join('、') : '0 個策略'}；<b>夏普值</b>贏過 SPY 的有 ${beatSh.length ? beatSh.map(s => short(s.key)).join('、') : '0 個策略'}。夏普值最高的是${short(best.key)}(${st[best.key].sharpe.toFixed(2)})。</li>
              <li><b>換手率很高</b>：只挑 10～20 檔的策略每季幾乎整批換掉(單邊換手率約 ${(turnAvg('s1') / 2 * 100).toFixed(0)}%)，單邊成本 ${(cost * 100).toFixed(2)}% 時每年約吃掉 ${(turnAvg('s1') * cost * 4 * 100).toFixed(1)}% 的報酬。</li>
              <li><b>等權重本身的效果</b>：全部成分股等權重年化 ${pct(st.ew.ret)}，${st.ew.ret > S.ret ? '高於 SPY：等權重讓小型成分股的權重變高，策略的超額報酬有一部分可能來自這裡，而不是選股規則' : '低於 SPY：這段期間大型股(市值加權裡權重最高的股票)領漲，只挑 10～20 檔等權重的策略要贏 SPY，得先克服這個落差'}。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>走勢比較</h3>
            ${chartBlock('累積報酬(期初 = 1)')}
            <h4>每年報酬</h4>
            <div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th>${keys.map(k => `<th>${esc(short(k))}</th>`).join('')}</tr></thead><tbody>
              ${rows.slice().reverse().map(r => `<tr><td>${yrLabel(r)}</td>${keys.map(k => heat(r.r[k], k !== 'spy' && r.r[k] > r.r.spy)).join('')}</tr>`).join('')}
              <tr class="allrow"><td>贏 SPY 的年數</td>${keys.map(k => `<td>${k === 'spy' ? '—' : `${wins(k)} / ${rows.length}`}</td>`).join('')}</tr></tbody></table></div>
            <p class="note">紅色越深代表漲越多、綠色越深代表跌越多(台股紅漲綠跌)；粗體底線表示當年贏過 SPY。</p>
            <h4>每季報酬：策略 − SPY</h4>
            <div class="tablewrap"><table class="stattable"><thead><tr><th>策略</th><th>平均每季</th><th>最好一季</th><th>最差一季</th><th>贏 SPY 超過 10% 的季數</th><th>輸 SPY 超過 10% 的季數</th></tr></thead><tbody>
              ${STRATS.map(s => { const d = qret(s.key).map((v, j) => v - spyQ[j]), m = d.reduce((a, b) => a + b, 0) / d.length, bi = d.indexOf(Math.max(...d)), wi = d.indexOf(Math.min(...d));
                return `<tr><td>${esc(s.name)}</td><td class="${cls(m)}">${pct(m)}</td><td class="up">${pct(d[bi], 1)}(${Q[bi].q})</td><td class="down">${pct(d[wi], 1)}(${Q[wi].q})</td><td>${d.filter(v => v > 0.1).length}</td><td>${d.filter(v => v < -0.1).length}</td></tr>`; }).join('')}
            </tbody></table></div>
          </div>`;
        charts(C, [...STRATS.map(s => s.key), 'spy'], [...STRATS.map(s => s.key), 'spy'], 'spy');
        el.querySelectorAll('#usView tr[data-go]').forEach(tr => { tr.onclick = () => setView(tr.dataset.go, true); });
      }

      /* ---------- 單一策略 ---------- */
      function renderOne(C, k) {
        const { st, qret, spyQ, turnAvg, cost, y0, Q } = C, s = meta(k), x = st[k], S = st.spy;
        const qr = qret(k), d = qr.map((v, j) => v - spyQ[j]), win = d.filter(v => v > 0).length;
        const rows = yearRows(C, [k, 'spy', 'ew']), yWin = rows.filter(r => r.r[k] > r.r.spy).length;
        const bi = d.indexOf(Math.max(...d)), wi = d.indexOf(Math.min(...d)), dMean = d.reduce((a, b) => a + b, 0) / d.length;
        const P = cur.picks[k];
        const card = (v, label, sub, c = '') => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${label}<br>${sub}</div></div>`;
        $('#usView').innerHTML = `
          <div class="panel">
            <h3>${esc(s.name)}</h3>
            <p><b>選股規則</b>：每季最後一個交易日，${esc(s.short)}，持有一季後重新挑選。<b>想法</b>：${esc(s.idea)}</p>
            <div class="statgrid" style="margin:12px 0;">
              ${card(pct(x.ret), '年化報酬', `SPY ${pct(S.ret)}`, `${cls(x.ret)} ${beat(x.ret, S.ret)}`)}
              ${card((x.vol * 100).toFixed(1) + '%', '年化波動', `SPY ${(S.vol * 100).toFixed(1)}%`, beat(x.vol, S.vol, false))}
              ${card(x.sharpe.toFixed(2), '夏普值', `SPY ${S.sharpe.toFixed(2)}`, beat(x.sharpe, S.sharpe))}
              ${card(pct(x.mdd, 1), '最大回撤', `SPY ${pct(S.mdd, 1)}`, `down ${beat(x.mdd, S.mdd)}`)}
              ${card(`${(win / d.length * 100).toFixed(0)}%`, '贏 SPY 的季數', `${win} / ${d.length} 季，年度 ${yWin} / ${rows.length}`)}
              ${card(`${(turnAvg(k) / 2 * 100).toFixed(0)}%`, '每季換手率(單邊)', `每年成本約 ${(turnAvg(k) * cost * 4 * 100).toFixed(1)}%`)}
            </div>
            <ul class="insight">
              <li>${y0} 年初到 ${B.asof.slice(0, 7).replace('-', '/')}，資產成長 ${x.mult.toFixed(1)} 倍(SPY ${S.mult.toFixed(1)} 倍)；年化報酬${x.ret > S.ret ? '高於' : '低於'} SPY ${pct(Math.abs(x.ret - S.ret)).replace('+', '')}，夏普值${x.sharpe > S.sharpe ? '高於' : '低於'} SPY(${x.sharpe.toFixed(2)} vs ${S.sharpe.toFixed(2)})${x.ret > S.ret && x.sharpe <= S.sharpe ? '：多賺的報酬是靠承擔更大的波動換來的' : ''}。</li>
              <li>每季平均比 SPY ${dMean >= 0 ? '多' : '少'} ${pct(Math.abs(dMean)).replace('+', '')}；表現最好的一季 ${Q[bi].q} 贏 ${pct(d[bi], 1)}，最差的一季 ${Q[wi].q} 輸 ${pct(d[wi], 1)}。</li>
              <li>最大回撤 ${pct(x.mdd, 1)}，${x.mdd < S.mdd ? `比 SPY 的 ${pct(S.mdd, 1)} 更深，持有這個策略要能承受更大的帳面虧損` : `比 SPY 的 ${pct(S.mdd, 1)} 淺`}。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>走勢</h3>
            ${chartBlock(`累積報酬(期初 = 1)：${esc(short(k))} vs SPY vs 全部成分股等權重`)}
            <h4>每年報酬</h4>
            <div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th><th>${esc(short(k))}</th><th>SPY</th><th>差距</th><th>全部成分股等權重</th></tr></thead><tbody>
              ${rows.slice().reverse().map(r => `<tr><td>${yrLabel(r)}</td>${heat(r.r[k], r.r[k] > r.r.spy)}${heat(r.r.spy, false)}<td class="${cls(r.r[k] - r.r.spy)}">${pct(r.r[k] - r.r.spy, 1)}</td>${heat(r.r.ew, false)}</tr>`).join('')}
            </tbody></table></div>
            <p class="note">紅色越深代表漲越多、綠色越深代表跌越多(台股紅漲綠跌)；粗體底線表示當年贏過 SPY。</p>
          </div>
          <div class="panel">
            <h3>本季持股(${esc(cur.q)}，${esc(cur.start)} 收盤換股)</h3>
            <div class="tablewrap"><table class="stattable"><thead><tr><th>代號</th><th>權重</th><th>上季報酬</th></tr></thead><tbody>
              ${P.map(([t, w, r]) => `<tr><td><a href="https://finance.yahoo.com/quote/${encodeURIComponent(t.replace('.', '-'))}" target="_blank" rel="noopener">${esc(t)}</a></td><td>${(w * 100).toFixed(1)}%</td><td class="${cls(r)}">${pct(r, 1)}</td></tr>`).join('')}
            </tbody></table></div>
            <p class="note">資料到 ${esc(B.asof)}。「上季報酬」是選股時用的訊號；下一次換股在本季最後一個交易日收盤。歷史回測不代表未來，這裡的持股只是策略規則的結果，不是投資建議。</p>
          </div>`;
        charts(C, [k, 'spy', 'ew'], [k, 'spy'], k);
      }

      function draw() {
        const C = calc();
        el.querySelectorAll('.us-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.k === view));
        if (view === 'all') renderAll(C); else renderOne(C, view);
        LTChart.bars($('#usCov'), { x: C.Q.map(q => q.q), label: '可取得股價的成分股比例', height: 180, yMin: 0, yMax: 1,
          xFmt: (v, tip) => tip ? v : v.endsWith('Q1') && +v.slice(0, 4) % 5 === 0 ? v.slice(0, 4) : '', yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v, i) => `${(v * 100).toFixed(0)}%(${C.Q[i].usable} / ${C.Q[i].members} 檔)`,
          series: [{ name: '覆蓋率', y: C.Q.map(q => q.usable / q.members), color: 'var(--blue)' }] });
      }
      function setView(v, scroll) {
        view = v;
        try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* 無法使用 localStorage */ }
        draw();
        if (scroll) $('.us-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      $('.us-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) setView(b.dataset.k); };
      $('#usFrom').onchange = draw; $('#usCost').oninput = draw; $('#usScale').onchange = draw;
      draw();
  }
})();
