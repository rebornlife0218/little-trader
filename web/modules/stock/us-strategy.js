/* 股票 · 美股 · 策略：S&P500 季度換股策略回測(資料集 sp500，pipeline/sp500/update.py)
   使用每季當時真實的歷史成分股；已下市公司的股價來自 Tiingo，降低倖存者偏差。
   網頁端只做：依起始年度切出期間、依換手率扣交易成本、計算績效統計與畫圖。
   原專題的回測數字保留在「原專題結果」(圖改由本頁依回測資料重畫) */
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
    { key: 'rsp', name: 'RSP 等權重 ETF', short: '實際的 S&P500 等權重 ETF(2003/05 起)，用來檢查等權重自算的偏差', color: 'var(--dim)' },
  ];
  // 原專題(操盤人講堂 2025.05)的回測數字，與本頁的資料、成分股處理方式不同，僅供對照
  const ORIG = { s1: [0.0938, 0.3479, 0.21, -0.7427], s2: [-0.0875, 0.4901, -0.22, -0.9708], s3: [0.1049, 0.2811, 0.30, -0.6747], s4: [0.0270, 0.3209, 0.02, -0.9390], spy: [0.0725, 0.1405, 0.37, -0.4596] };
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const isStrat = k => k === 'ew' || STRATS.some(s => s.key === k);   // 有換股(要扣成本)的組合
  const nameOf = k => (STRATS.find(s => s.key === k) || BENCH.find(s => s.key === k)).name;

  /* 期間 [i0, end] 的淨值：策略在每季換股日依換手率扣成本(單邊成本 × 換手率；期間第一季視為全部買進) */
  function navOf(B, key, i0, cost) {
    const v = B.nav[key], out = [1];
    const rebal = new Map(B.q.map(q => [q.start, q.turn ? q.turn[key] : undefined]));
    const strat = isStrat(key);
    if (strat) out[0] = 1 - cost;   // 第一天買進
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

  LT.register({
    section: 'stock', group: '美股', key: 'us-strategy', name: '策略',
    async mount(el, ctx) {
      el.innerHTML = `
        <header class="top"><div>
          <h1>美股策略：S&amp;P500 季度換股</h1>
          <p>每季依上一季的表現，從<b>當時</b>的 S&amp;P500 成分股挑選股票持有一季，與買進持有 SPY 比較報酬與風險</p>
        </div></header>
        <div id="usBody"><div class="panel"><p class="mute">載入回測資料中…</p></div></div>`;
      let B;
      try { B = (await LT.loadJSON('sp500', 'backtest.json')).data; }
      catch (e) {
        if (!ctx.alive()) return; el.querySelector('#usBody').innerHTML = `<div class="panel"><p class="mute">回測資料尚未產生：${esc(e.message)}</p></div>`; return; }
      if (!ctx.alive()) return;
      const years = [...new Set(B.q.map(q => +q.q.slice(0, 4)))].filter(y => y % 5 === 0 || y === 2008);
      const cur = B.q[B.q.length - 1];
      el.querySelector('#usBody').innerHTML = `
        <div class="panel">
          <h3>回測結果</h3>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
            <div class="paramitem"><label for="usFrom">回測起點</label><select id="usFrom">${years.map(y => `<option value="${y}" ${y === 2000 ? 'selected' : ''}>${y} 年初</option>`).join('')}</select></div>
            <div class="paramitem"><label for="usCost">交易成本(單邊，%)</label><input id="usCost" type="number" min="0" max="2" step="0.05" value="0.1"></div>
          </div>
          <div class="tablewrap" style="margin-top:12px;"><table class="stattable us-strat" id="usTable"></table></div>
          <p class="note">粗體底線表示優於 SPY。夏普值 = (年化報酬 − 無風險利率) ÷ 年化波動，無風險利率用期間內美國 3 個月國庫券殖利率的平均；換手率(單邊) = 每季賣出(或買進)金額占資產的比例，100% 代表整批換掉；交易成本 = 單邊成本 × (賣出 + 買進金額)，在每次換股時扣除。</p>
          <ul class="insight" id="usInsight"></ul>
        </div>
        <div class="panel">
          <h3>走勢比較</h3>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
            <div class="paramitem"><label for="usShow">顯示</label><select id="usShow">${STRATS.map(s => `<option value="${s.key}">${esc(s.name)}</option>`).join('')}<option value="all">四種策略一起比較</option></select></div>
            <div class="paramitem"><label for="usScale">縱軸</label><select id="usScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
          </div>
          <h4>累積報酬(期初 = 1，已依上方設定扣除交易成本)</h4>
          <div id="usChart"></div>
          <div id="usLegend"></div>
          <p class="note">對數刻度下，同樣的垂直距離代表同樣的報酬率(例如 1→2 和 5→10 都是翻倍)，長期走勢比較不會被後期的大數字壓扁。</p>
          <h4>回撤：從前一個高點下跌的幅度</h4>
          <div id="usDD"></div>
          <h4>每年報酬</h4>
          <div class="tablewrap"><table class="stattable us-year" id="usYear"></table></div>
          <p class="note">紅色越深代表漲越多、綠色越深代表跌越多(台股紅漲綠跌)；粗體底線表示當年贏過 SPY。已扣除交易成本。</p>
          <h4>每季報酬分布：策略 − SPY</h4>
          <div class="tablewrap"><table class="stattable" id="usQ"></table></div>
        </div>
        <div class="panel">
          <h3>本季持股(${esc(cur.q)}，${esc(cur.start)} 收盤換股)</h3>
          <div class="mode-tabs us-tabs">${STRATS.map((s, i) => `<button class="mode-tab ${i === 0 ? 'active' : ''}" data-k="${s.key}"><b>${esc(s.name)}</b><small>${esc(s.idea)}</small></button>`).join('')}</div>
          <div id="usPicks"></div>
          <p class="note">資料到 ${esc(B.asof)}。「上季報酬」是選股時用的訊號；下一次換股在本季最後一個交易日收盤。歷史回測不代表未來，這裡的持股只是策略規則的結果，不是投資建議。</p>
        </div>
        <div class="panel">
          <h3>資料夠嚴謹嗎？</h3>
          <div class="doc">
            <p><b>倖存者偏差</b>：如果只用「現在」的成分股或只用還在交易的股票回測，破產、被併購、被剔除的公司都不會出現，結果會偏好。本回測每季使用當時真實的成分股名單，但免費資料仍有缺口：</p>
          </div>
          <h4>每季可取得股價的成分股比例</h4>
          <div id="usCov"></div>
          <div class="doc">
            <p>2000 年代初期約一半到六成，2012 年後約九成以上。缺的大多是早年被併購或下市的公司；只能從可取得股價的股票中選股。</p>
          </div>
          ${B.biased ? `<h4>補上下市公司(Tiingo)前後的差異(${esc(B.q[0].q.slice(0, 4))} 年起，未扣成本)</h4>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>策略</th><th>只用 Yahoo(偏差較大)</th><th>加上 Tiingo 的下市股</th><th>差異</th></tr></thead><tbody>
            ${[...STRATS.map(s => s.key), 'ew'].map(k => { const a = B.biased.yahoo_only[k].ret, b = B.biased.with[k].ret; return `<tr><td>${esc(nameOf(k))}</td><td>${pct(a)}</td><td>${pct(b)}</td><td class="${cls(b - a)}">${pct(b - a)}</td></tr>`; }).join('')}
          </tbody></table></div>
          <p class="note">年化報酬。差異越大，代表該策略越容易被倖存者偏差誤導。</p>` : ''}
          <h4>等權重自算 vs RSP(等權重 ETF)</h4>
          <div id="usRsp"></div>
          <div class="doc">
            <ul>
              <li><b>Yahoo 的代號沿用問題</b>：有些已下市公司的代號被別家公司拿去用(例如 El Paso 的 EP，現在是小型股 Empire Petroleum)，Yahoo 會給出新公司的股價。本回測用成交金額篩掉這種情況，但兩家都是大型股的少數情況(例如舊 AT&amp;T 與 SBC 的 T)無法完全排除。</li>
              <li><b>下市的處理</b>：持有期間股票下市，以最後一個價格轉為現金(不計利息)；破產公司的最後價格通常已接近 0。</li>
              <li><b>沒有計入</b>：稅、借券與流動性；換股價格用季末收盤價，實際交易會有滑價。</li>
            </ul>
          </div>
        </div>
        <details class="panel">
          <summary><b>原專題結果(操盤人講堂 2025.05)</b></summary>
          <p class="note">原專題的回測期間、成分股名單與資料處理方式與本頁不同，數字僅供對照。</p>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>策略</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>最大回撤</th></tr></thead><tbody>
            ${[...STRATS.map(s => s.key), 'spy'].map(k => `<tr><td>${esc(nameOf(k))}</td><td class="${cls(ORIG[k][0])}">${pct(ORIG[k][0])}</td><td>${(ORIG[k][1] * 100).toFixed(2)}%</td><td>${ORIG[k][2].toFixed(2)}</td><td class="down">${pct(ORIG[k][3])}</td></tr>`).join('')}
          </tbody></table></div>
        </details>`;

      const $ = s => el.querySelector(s);
      const draw = () => {
        const y = +$('#usFrom').value, cost = Math.max(0, +$('#usCost').value || 0) / 100;
        const q0 = B.q.findIndex(q => +q.q.slice(0, 4) >= y), i0 = B.d.indexOf(B.q[q0].start);
        const Q = B.q.slice(q0), rf = Q.reduce((a, q) => a + q.rf, 0) / Q.length;
        const navs = {}, st = {};
        [...STRATS, ...BENCH].forEach(s => { navs[s.key] = navOf(B, s.key, i0, cost); });
        const rspOk = B.nav.rsp[i0] != null;
        Object.keys(navs).forEach(k => { if (k !== 'rsp' || rspOk) st[k] = stats(navs[k], rf); });
        // 每季報酬(含成本)
        const qIdx = Q.map(q => B.d.indexOf(q.start) - i0).concat([B.d.length - 1 - i0]);
        const qret = k => qIdx.slice(0, -1).map((a, j) => navs[k][qIdx[j + 1]] / navs[k][a] - 1);
        const spyQ = qret('spy');
        const turnAvg = k => Q.slice(1).reduce((a, q) => a + q.turn[k], 0) / Math.max(1, Q.length - 1);
        const S = st.spy, beat = (v, b, hi = true) => (hi ? v > b : v < b) ? 'beat' : '';
        const row = (s, strat) => { const x = st[s.key]; if (!x) return `<tr><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td><td colspan="7" class="mute">期間早於 RSP 上市(2003/05)</td></tr>`;
          const qr = strat ? qret(s.key) : null, w = qr ? qr.filter((v, j) => v > spyQ[j]).length / qr.length : null;
          return `<tr class="${strat ? '' : 'allrow'}"><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td>
            <td class="${cls(x.ret)} ${strat ? beat(x.ret, S.ret) : ''}">${pct(x.ret)}</td><td class="${strat ? beat(x.vol, S.vol, false) : ''}">${(x.vol * 100).toFixed(1)}%</td>
            <td class="${strat ? beat(x.sharpe, S.sharpe) : ''}">${x.sharpe.toFixed(2)}</td><td class="down ${strat ? beat(x.mdd, S.mdd) : ''}">${pct(x.mdd, 1)}</td>
            <td>${x.mult.toFixed(1)} 倍</td><td>${w == null ? '—' : (w * 100).toFixed(0) + '%'}</td><td>${isStrat(s.key) ? (turnAvg(s.key) / 2 * 100).toFixed(0) + '%' : '—'}</td></tr>`; };
        $('#usTable').innerHTML = `<thead><tr><th>策略</th><th>選股規則</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>最大回撤</th><th>資產成長</th><th>贏 SPY 的季數</th><th>每季換手率(單邊)</th></tr></thead>
          <tbody>${STRATS.map(s => row(s, true)).join('')}${BENCH.map(s => row(s, false)).join('')}</tbody>`;
        drawCharts(navs, i0, y);
        // 每季超額報酬分布
        $('#usQ').innerHTML = `<thead><tr><th>策略</th><th>平均每季</th><th>最好一季</th><th>最差一季</th><th>贏 SPY 超過 10% 的季數</th><th>輸 SPY 超過 10% 的季數</th></tr></thead><tbody>
          ${STRATS.map(s => { const d = qret(s.key).map((v, j) => v - spyQ[j]); const m = d.reduce((a, b) => a + b, 0) / d.length;
            const bi = d.indexOf(Math.max(...d)), wi = d.indexOf(Math.min(...d));
            return `<tr><td>${esc(s.name)}</td><td class="${cls(m)}">${pct(m)}</td><td class="up">${pct(d[bi], 1)}(${Q[bi].q})</td><td class="down">${pct(d[wi], 1)}(${Q[wi].q})</td><td>${d.filter(v => v > 0.1).length}</td><td>${d.filter(v => v < -0.1).length}</td></tr>`; }).join('')}</tbody>`;
        // 重點
        const best = STRATS.slice().sort((a, b) => st[b.key].sharpe - st[a.key].sharpe)[0];
        const beatRet = STRATS.filter(s => st[s.key].ret > S.ret), beatSh = STRATS.filter(s => st[s.key].sharpe > S.sharpe);
        $('#usInsight').innerHTML = `
          <li>${y} 年初到 ${B.asof.slice(0, 7).replace('-', '/')}，SPY 年化 ${pct(S.ret)}、夏普值 ${S.sharpe.toFixed(2)}、最大回撤 ${pct(S.mdd, 1)}。</li>
          <li><b>年化報酬</b>贏過 SPY 的有 ${beatRet.length ? beatRet.map(s => s.name.split('：')[0]).join('、') : '0 個策略'}；<b>夏普值</b>贏過 SPY 的有 ${beatSh.length ? beatSh.map(s => s.name.split('：')[0]).join('、') : '0 個策略'}。夏普值最高的是${best.name.split('：')[0]}(${st[best.key].sharpe.toFixed(2)})。</li>
          <li><b>換手率很高</b>：只挑 10～20 檔的策略每季幾乎整批換掉(單邊換手率約 ${(turnAvg('s1') / 2 * 100).toFixed(0)}%)，單邊成本 ${(cost * 100).toFixed(2)}% 時每年約吃掉 ${(turnAvg('s1') * cost * 4 * 100).toFixed(1)}% 的報酬，把成本調高看看結果怎麼變。</li>
          <li><b>等權重本身的效果</b>：全部成分股等權重年化 ${pct(st.ew.ret)}，${st.ew.ret > S.ret ? '高於 SPY：等權重讓小型成分股的權重變高，策略的超額報酬有一部分可能來自這裡，而不是選股規則' : '低於 SPY：這段期間大型股(市值加權裡權重最高的股票)領漲，只挑 10～20 檔等權重的策略要贏 SPY，得先克服這個落差'}。</li>`;
        // 覆蓋率
        LTChart.bars($('#usCov'), { x: Q.map(q => q.q), label: '可取得股價的成分股比例', height: 180, yMin: 0, yMax: 1,
          xFmt: (v, tip) => tip ? v : v.endsWith('Q1') && +v.slice(0, 4) % 5 === 0 ? v.slice(0, 4) : '', yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v, i) => `${(v * 100).toFixed(0)}%(${Q[i].usable} / ${Q[i].members} 檔)`,
          series: [{ name: '覆蓋率', y: Q.map(q => q.usable / q.members), color: 'var(--blue)' }] });
        // 等權重 vs RSP：從 RSP 上市後第一個換股日起
        const r0 = Math.max(i0, B.d.findIndex(d => d >= (B.q.find(q => B.nav.rsp[B.d.indexOf(q.start)] != null) || {}).start));
        if (r0 >= 0) {
          const a = stats(navOf(B, 'ew', r0, 0), rf), b = stats(navOf(B, 'rsp', r0, 0), rf);
          $('#usRsp').innerHTML = `<div class="statgrid" style="margin:10px 0;">
            <div class="stat"><div class="v">${pct(a.ret)}</div><div class="l">本回測的全部成分股等權重 · 年化(未扣成本)</div></div>
            <div class="stat"><div class="v">${pct(b.ret)}</div><div class="l">RSP 等權重 ETF · 年化(已扣 ETF 費用)</div></div>
            <div class="stat"><div class="v ${cls(a.ret - b.ret)}">${pct(a.ret - b.ret)}</div><div class="l">差異 · ${B.d[r0].slice(0, 7).replace('-', '/')} 起</div></div></div>
            <p class="note">RSP 每季調整、包含所有成分股，是很好的對照組。兩者都每季再平衡；RSP 有約 0.2% 的費用率與實際交易成本。差異明顯大於這個幅度時，代表自算的資料仍有偏差(偏高通常是倖存者偏差，因為表現差而下市的公司缺資料)。</p>`;
        }
      };
      /* 走勢比較：累積報酬(對數/一般刻度)、回撤、每年報酬 */
      const LOG_TICKS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
      const mulFmt = v => v >= 10 ? v.toFixed(0) + '×' : v >= 1 ? (+v.toFixed(1)) + '×' : (+v.toFixed(2)) + '×';
      function drawCharts(navs, i0, y0) {
        const show = $('#usShow').value, log = $('#usScale').value === 'log';
        const keys = show === 'all' ? [...STRATS.map(s => s.key), 'spy'] : [show, 'spy', 'ew'];
        const meta = k => STRATS.find(s => s.key === k) || BENCH.find(s => s.key === k);
        const width = k => show === 'all' ? (k === 'spy' ? 2.4 : 1.4) : k === show ? 2.4 : 1.6;
        const step = Math.max(1, Math.floor((B.d.length - i0) / 700)), idx = [];
        for (let i = 0; i < B.d.length - i0; i += step) idx.push(i);
        if (idx[idx.length - 1] !== B.d.length - 1 - i0) idx.push(B.d.length - 1 - i0);
        const xs = idx.map(i => B.d[i0 + i]), xFmt = (d, tip) => tip ? d : d.slice(0, 4);
        LTChart.line($('#usChart'), { x: xs, xType: 'date', label: '累積報酬', height: 320, xFmt,
          yFmt: log ? v => mulFmt(10 ** v) : v => mulFmt(v), tipFmt: log ? (s, v) => (10 ** v).toFixed(2) + ' 倍' : (s, v) => v.toFixed(2) + ' 倍',
          yTicks: log ? () => LOG_TICKS.map(Math.log10) : undefined, refY: [{ y: log ? 0 : 1 }],
          series: keys.map(k => ({ name: meta(k).name, color: meta(k).color, width: width(k), dash: k === 'ew' ? '5 4' : undefined,
            y: idx.map(i => log ? Math.log10(navs[k][i]) : navs[k][i]) })) });
        $('#usLegend').innerHTML = LTChart.legend(keys.map(k => meta(k)));
        // 回撤
        const dd = k => { let pk = -Infinity; return navs[k].map(v => { pk = Math.max(pk, v); return v / pk - 1; }); };
        const ddKeys = show === 'all' ? keys : [show, 'spy'];
        const D = Object.fromEntries(ddKeys.map(k => [k, dd(k)]));
        LTChart.line($('#usDD'), { x: xs, xType: 'date', label: '回撤', height: 200, xFmt, yMax: 0,
          yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => (v * 100).toFixed(1) + '%',
          series: ddKeys.map(k => ({ name: meta(k).name, color: meta(k).color, width: k === 'spy' ? 1.6 : 1.4, y: idx.map(i => D[k][i]) })) });
        // 每年報酬：每年最後一個交易日的淨值比
        const yk = [...STRATS.map(s => s.key), 'spy', 'ew'], ends = [];
        for (let i = 0; i < B.d.length - i0; i++) {
          const yr = B.d[i0 + i].slice(0, 4), nx = B.d[i0 + i + 1];
          if (!nx || nx.slice(0, 4) !== yr) ends.push({ yr, i });
        }
        const rows = [];
        ends.forEach((e, j) => {
          const a = j ? ends[j - 1].i : 0;
          if (+e.yr < y0) return;   // 起點前一天(上一年最後一個交易日)
          rows.push({ yr: e.yr, partial: !B.d[i0 + e.i + 1] && !B.d[i0 + e.i].endsWith('12-31'), r: Object.fromEntries(yk.map(k => [k, navs[k][e.i] / navs[k][a] - 1])) });
        });
        const cell = (v, beat) => { const c = v >= 0 ? 'var(--up)' : 'var(--down)', a = Math.min(55, Math.abs(v) * 110);
          return `<td class="${beat ? 'beat' : ''}" style="background:color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)">${pct(v, 1)}</td>`; };
        const wins = k => rows.filter(r => r.r[k] > r.r.spy).length;
        $('#usYear').innerHTML = `<thead><tr><th>年度</th>${yk.map(k => `<th>${esc(meta(k).name.split('：')[0])}</th>`).join('')}</tr></thead><tbody>
          ${rows.slice().reverse().map(r => `<tr><td>${r.yr}${r.partial ? `<br><small class="mute">至 ${B.asof.slice(5).replace('-', '/')}</small>` : ''}</td>${yk.map(k => cell(r.r[k], k !== 'spy' && r.r[k] > r.r.spy)).join('')}</tr>`).join('')}
          <tr class="allrow"><td>贏 SPY 的年數</td>${yk.map(k => `<td>${k === 'spy' ? '—' : `${wins(k)} / ${rows.length}`}</td>`).join('')}</tr></tbody>`;
      }

      const picks = k => {
        el.querySelectorAll('.us-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.k === k));
        const s = STRATS.find(x => x.key === k), P = cur.picks[k];
        $('#usPicks').innerHTML = `<p style="margin-top:12px;"><b>選股規則</b>：${esc(s.short)}。${esc(s.idea)}</p>
          <div class="tablewrap"><table class="stattable"><thead><tr><th>代號</th><th>權重</th><th>上季報酬</th></tr></thead><tbody>
            ${P.map(([t, w, r]) => `<tr><td><a href="https://finance.yahoo.com/quote/${encodeURIComponent(t.replace('.', '-'))}" target="_blank" rel="noopener">${esc(t)}</a></td><td>${(w * 100).toFixed(1)}%</td><td class="${cls(r)}">${pct(r, 1)}</td></tr>`).join('')}
          </tbody></table></div>`;
      };
      $('#usFrom').onchange = draw; $('#usCost').oninput = draw;
      $('#usShow').onchange = draw; $('#usScale').onchange = draw;
      $('.us-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) picks(b.dataset.k); };
      draw(); picks('s1');
    },
  });
})();
