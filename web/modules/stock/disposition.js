/* 股票 · 台股 · 處置股：新制(2026/8/10)說明與處置股的股價表現(資料集 disposition，pipeline/disposition/update.py)
   統計都由 events.json 即時計算，文字敘述依資料自動調整 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const share = (n, N) => N ? (n / N * 100).toFixed(0) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const md = d => d.slice(5).replace('-', '/');
  // 第一天的 K 棒：收盤 < 開盤為黑 K(陰線)、收盤 > 開盤為紅 K(陽線)
  const candle = e => e.d1.c < e.d1.o ? 'black' : e.d1.c > e.d1.o ? 'red' : 'flat';
  const d1ret = e => e.d1.prev ? e.d1.c / e.d1.prev - 1 : NaN;

  function summary(E) {
    const fin = E.filter(e => e.done && e.ret != null);
    const R = fin.map(e => e.ret), X = fin.filter(e => e.mkt != null).map(e => e.ret - e.mkt), P = E.filter(e => e.post5 != null).map(e => e.post5);
    return {
      n: E.length, nFin: fin.length,
      black: E.filter(e => candle(e) === 'black').length, red: E.filter(e => candle(e) === 'red').length,
      d1: mean(E.map(d1ret).filter(Number.isFinite)),
      ret: mean(R), retMed: median(R), up: R.filter(v => v > 0).length, ex: mean(X), exMed: median(X),
      post: mean(P), nPost: P.length,
    };
  }

  LT.register({
    section: 'stock', group: '台股', key: 'disposition', name: '處置股',
    async mount(el, ctx) {
      el.innerHTML = `
        <header class="top"><div>
          <h1>處置股</h1>
          <p>成交異常被交易所列為處置的股票：2026/8/10 處置新制上路後，處置期間的股價表現</p>
        </div></header>
        <div class="panel doc">
          <h3>什麼是處置股？新制改了什麼</h3>
          <p>股票短期內漲跌幅、成交量或週轉率異常，會先被列為<b>注意股</b>；一段期間內多次達到注意標準(例如連續 3 個營業日、或 30 個營業日內有 12 個營業日)，就會被列為<b>處置股</b>，在處置期間改用人工管制的分盤撮合，情節較重時還要預收款券(買賣前先把錢或股票交給券商)，目的是降低過熱的投機交易。</p>
          <p>證交所與櫃買中心在 2026/8/3 公告修正處置制度，<b>2026/8/10 起實施</b>：</p>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>項目</th><th>舊制</th><th>新制(2026/8/10 起)</th></tr></thead>
            <tbody>
              <tr><td>處置期間(一般)</td><td>10 個營業日</td><td><b>5 個營業日</b></td></tr>
              <tr><td>處置期間(當沖過熱)</td><td>12 個營業日</td><td><b>7 個營業日</b></td></tr>
              <tr><td>分盤撮合</td><td>第一次處置約每 5 分鐘、第二次約每 20 分鐘撮合一次</td><td><b>約每 2 分鐘</b>撮合一次</td></tr>
              <tr><td>預收款券、暫停融資融券、禁止現股當沖</td><td colspan="2">不變</td></tr>
              <tr><td>高價股的注意標準</td><td>—</td><td>股價 1,000 元以上，6 日價差需達 300 元才列注意(2,000 元以上每千元再加 150 元)</td></tr>
              <tr><td>制度檢討</td><td>—</td><td>每半年檢討一次</td></tr>
            </tbody>
          </table></div>
          <p>8/10 當天仍在處置中的股票，依過渡規定改按新制縮短處置期間。新制讓處置股的流動性變好、關的時間變短，處置的「冷卻」效果可能也跟著變弱，這正是下面要觀察的。</p>
          <p class="mute" style="font-size:12px;">資料來源：<a href="https://www.twse.com.tw/zh/announcement/punish.html" target="_blank" rel="noopener">臺灣證券交易所 處置有價證券</a>、<a href="https://www.tpex.org.tw/zh-tw/announce/market/disposal.html" target="_blank" rel="noopener">櫃買中心 處置有價證券</a>；新制整理參考<a href="https://www.esunsec.com.tw/article/post/671" target="_blank" rel="noopener">玉山證券</a>。</p>
        </div>
        <div id="dpBody"><div class="panel"><p class="mute">載入處置股資料中…</p></div></div>`;
      let J;
      try { J = (await LT.loadJSON('disposition', 'events.json')).data; }
      catch (e) { if (ctx.alive()) el.querySelector('#dpBody').innerHTML = `<div class="panel"><p class="mute">處置股資料尚未產生：${esc(e.message)}</p></div>`; return; }
      if (!ctx.alive()) return;
      const $ = s => el.querySelector(s);
      const NEW = J.events.filter(e => e.rule === 'new'), OLD = J.events.filter(e => e.rule === 'old');
      const sn = summary(NEW), so = summary(OLD);
      const months = [...new Set(NEW.map(e => e.start.slice(0, 7)))].sort();
      const byMonth = months.map(m => ({ m, ...summary(NEW.filter(e => e.start.startsWith(m))) }));
      // 大盤：7 月的低點
      const M = J.market, iLow = (() => { let k = -1; M.d.forEach((d, i) => { if (d >= '2026-07-01' && d <= '2026-08-31' && M.twii[i] != null && (k < 0 || M.twii[i] < M.twii[k])) k = i; }); return k; })();
      const iPeak = (() => { let k = -1; M.d.forEach((d, i) => { if (d < M.d[iLow] && M.twii[i] != null && (k < 0 || M.twii[i] > M.twii[k])) k = i; }); return k; })();
      const last = M.twii.length - 1;

      $('#dpBody').innerHTML = `
        <div class="panel">
          <h3>新制上路後的處置股(${md(J.new_rule)} ～ ${md(J.asof)})</h3>
          <div class="statgrid" style="margin:12px 0;">
            <div class="stat"><div class="v">${sn.n}</div><div class="l">處置事件(上市 ${NEW.filter(e => e.market === 'TWSE').length}、上櫃 ${NEW.filter(e => e.market === 'TPEx').length})，已出關 ${sn.nFin}</div></div>
            <div class="stat"><div class="v">${share(sn.black, sn.n)}</div><div class="l">處置第一天收黑 K 的比例(紅 K ${share(sn.red, sn.n)})</div></div>
            <div class="stat"><div class="v ${cls(sn.ret)}">${pct(sn.ret)}</div><div class="l">處置期間平均報酬(中位數 ${pct(sn.retMed)})，上漲 ${share(sn.up, sn.nFin)}</div></div>
            <div class="stat"><div class="v ${cls(sn.ex)}">${pct(sn.ex)}</div><div class="l">扣除同期大盤後的平均報酬(中位數 ${pct(sn.exMed)})</div></div>
          </div>
          <ul class="insight" id="dpInsight"></ul>
          <h4>新制 vs 舊制</h4>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th></th><th>事件數</th><th>第一天黑 K</th><th>第一天紅 K</th><th>第一天平均漲跌</th><th>處置期間平均報酬</th><th>中位數</th><th>期間上漲比例</th><th>扣除大盤</th><th>出關後 5 日</th></tr></thead>
            <tbody>${[['新制(5 / 7 天)', sn], ['舊制(10 / 12 天，2025 年起)', so]].map(([n, s]) => `<tr><td>${n}</td><td>${s.n}</td><td>${share(s.black, s.n)}</td><td>${share(s.red, s.n)}</td><td class="${cls(s.d1)}">${pct(s.d1, 2)}</td><td class="${cls(s.ret)}">${pct(s.ret)}</td><td class="${cls(s.retMed)}">${pct(s.retMed)}</td><td>${share(s.up, s.nFin)}</td><td class="${cls(s.ex)}">${pct(s.ex)}</td><td class="${cls(s.post)}">${pct(s.post)}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="note">處置期間報酬 = 處置前一天收盤 → 處置最後一天收盤(只算已出關的事件)；大盤：上市用加權指數、上櫃用櫃買指數。跨越 8/10 的處置事件依過渡規定縮短，兩邊都不列入。股價為還原股價，不計交易成本。</p>
          <h4>新制各月份</h4>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>處置開始月份</th><th>事件數</th><th>第一天黑 K</th><th>第一天紅 K</th><th>第一天平均漲跌</th><th>已出關</th><th>期間平均報酬</th><th>期間上漲比例</th></tr></thead>
            <tbody>${byMonth.map(s => `<tr><td>${s.m.replace('-', '/')}</td><td>${s.n}</td><td>${share(s.black, s.n)}</td><td>${share(s.red, s.n)}</td><td class="${cls(s.d1)}">${pct(s.d1, 2)}</td><td>${s.nFin}</td><td class="${cls(s.ret)}">${pct(s.ret)}</td><td>${share(s.up, s.nFin)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="panel">
          <h3>大盤背景：7 月底大跌後反彈</h3>
          <div id="dpMkt"></div>
          ${LTChart.legend([{ name: '加權指數', color: 'var(--amber)' }, { name: '櫃買指數', color: 'var(--blue)' }])}
          <p class="note">以 ${M.d[0].slice(0, 7).replace('-', '/')} 第一個交易日 = 100。新制剛好在大盤反彈初期上路，處置股期間偏漲，有一部分是整體市場上漲帶動，所以上面另外列出扣除大盤的報酬。</p>
        </div>
        <div class="panel">
          <h3>新制處置期間報酬的分布</h3>
          <div id="dpHist"></div>
          <h3 style="margin-top:18px;">最近的處置股</h3>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
            <div class="paramitem"><label for="dpMarket">市場</label><select id="dpMarket"><option value="">全部</option><option value="TWSE">上市</option><option value="TPEx">上櫃</option></select></div>
          </div>
          <div class="tablewrap"><table class="stattable" id="dpTable"></table></div>
          <p class="note">第一天 K 棒：收盤低於開盤為黑 K、高於開盤為紅 K，開盤等於收盤(例如一價到底的漲停)為開收同價。「進行中」表示還沒出關，期間報酬算到 ${md(J.asof)}。只列股票(不含權證、ETF)。</p>
        </div>`;

      // 重點(依資料產生)
      const first = byMonth[0], lastM = byMonth[byMonth.length - 1];
      $('#dpInsight').innerHTML = `
        <li><b>處置第一天</b>：新制以來黑 K ${share(sn.black, sn.n)}、紅 K ${share(sn.red, sn.n)}${sn.black > sn.red ? '，<b>黑 K 居多</b>' : '，整體並非黑 K 居多'}；${first ? `新制第一個月(${+first.m.slice(5)} 月)黑 K ${share(first.black, first.n)}` : ''}${lastM && lastM !== first ? `，最近(${+lastM.m.slice(5)} 月)黑 K ${share(lastM.black, lastM.n)}` : ''}。舊制時黑 K ${share(so.black, so.n)}${so.black > so.red ? '居多' : ''}。</li>
        <li><b>處置期間仍偏漲</b>：已出關的 ${sn.nFin} 筆平均 ${pct(sn.ret)}、${share(sn.up, sn.nFin)} 上漲，扣除大盤後仍有 ${pct(sn.ex)}；舊制同樣算法平均 ${pct(so.ret)}、上漲 ${share(so.up, so.nFin)}。處置的冷卻效果在新制下看起來不明顯。</li>
        <li><b>樣本數較小</b>：新制只有約 ${Math.round((Date.parse(J.asof) - Date.parse(J.new_rule)) / 864e5 / 7)} 週、${sn.nFin} 筆已出關的事件，而且期間剛好遇到大盤反彈，結論可能隨更多資料而改變。</li>
        ${iLow > 0 && iPeak >= 0 ? `<li><b>大盤背景</b>：加權指數從 ${md(M.d[iPeak])} 的 ${Math.round(M.twii[iPeak]).toLocaleString()} 跌到 ${md(M.d[iLow])} 的 ${Math.round(M.twii[iLow]).toLocaleString()}(${pct(M.twii[iLow] / M.twii[iPeak] - 1)})，之後反彈到 ${md(M.d[last])} 的 ${Math.round(M.twii[last]).toLocaleString()}(${pct(M.twii[last] / M.twii[iLow] - 1)})。</li>` : ''}`;

      // 大盤走勢
      const base = k => M[k].find(v => v != null);
      LTChart.line($('#dpMkt'), { x: M.d, xType: 'date', label: '大盤走勢', height: 240, xFmt: (d, tip) => tip ? d : d.slice(5).replace('-', '/'),
        yFmt: v => v.toFixed(0), tipFmt: (s, v) => v.toFixed(1),
        refX: [{ x: J.new_rule, label: '新制上路', color: 'var(--dim)' }].concat(iLow > 0 ? [{ x: M.d[iLow], label: '低點', color: 'var(--down)' }] : []),
        series: [{ name: '加權指數', y: M.twii.map(v => v == null ? null : v / base('twii') * 100), color: 'var(--amber)' },
                 { name: '櫃買指數', y: M.otc.map(v => v == null ? null : v / base('otc') * 100), color: 'var(--blue)' }] });

      // 期間報酬分布
      const R = NEW.filter(e => e.done && e.ret != null).map(e => e.ret);
      if (R.length) {
        const step = 0.05, lo = Math.floor(Math.min(...R) / step) * step, hi = Math.ceil(Math.max(...R) / step) * step;
        const bins = []; for (let x = lo; x < hi - 1e-9; x += step) bins.push({ x, n: 0 });
        R.forEach(v => { bins[Math.min(bins.length - 1, Math.floor((v - lo) / step + 1e-9))].n++; });
        LTChart.bars($('#dpHist'), { x: bins.map(b => b.x), label: '處置期間報酬分布', height: 200,
          xFmt: v => Math.round(v * 100) + '%', yFmt: v => Math.round(v), tipFmt: (s, v, i) => `${(bins[i].x * 100).toFixed(0)}%～${((bins[i].x + step) * 100).toFixed(0)}%：${v} 筆`,
          series: [{ name: '事件數', y: bins.map(b => b.n), color: 'var(--amber)' }], refX: [{ x: 0, color: 'var(--dim)' }] });
      }

      // 最近的處置股
      const table = () => {
        const mk = $('#dpMarket').value;
        const rows = J.events.filter(e => e.rule !== 'old' && (!mk || e.market === mk)).sort((a, b) => b.start.localeCompare(a.start) || a.code.localeCompare(b.code)).slice(0, 80);
        const K = { black: '<span class="down">黑 K</span>', red: '<span class="up">紅 K</span>', flat: '開收同價' };
        $('#dpTable').innerHTML = `<thead><tr><th>代號</th><th>名稱</th><th>市場</th><th>處置期間</th><th>處置</th><th>第一天</th><th>第一天漲跌</th><th>處置期間報酬</th><th>同期大盤</th><th>出關後 5 日</th></tr></thead><tbody>
          ${rows.map(e => `<tr><td>${esc(e.code)}</td><td>${esc(e.name)}</td><td>${e.market === 'TWSE' ? '上市' : '上櫃'}</td><td>${md(e.start)}～${md(e.end)}${e.done ? '' : ' <small class="mute">進行中</small>'}</td><td>${esc(e.kind)}</td>
            <td>${K[candle(e)]}</td><td class="${cls(d1ret(e))}">${pct(d1ret(e))}</td><td class="${cls(e.ret)}">${pct(e.ret)}</td><td class="${cls(e.mkt)}">${pct(e.mkt)}</td><td class="${cls(e.post5)}">${pct(e.post5)}</td></tr>`).join('')}</tbody>`;
      };
      $('#dpMarket').onchange = table;
      table();
    },
  });
})();
