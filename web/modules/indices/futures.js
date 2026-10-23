/* 指數 · 台指期貨：近月走勢與現貨價差、每月轉倉(換月)、結算日曆、三大法人淨未平倉、成交量與未平倉量、各月份契約
   資料集：data/options/futures.json(pipeline/options/futures.py，隨選擇權資料一起更新)
   需要 modules/option/lib.js(LTOpt.load、結算日曆)先載入 */
(() => {
  const { esc } = LTOpt;
  const int = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '—';
  const signed = v => Number.isFinite(v) ? (v > 0 ? '+' : '') + Math.round(v).toLocaleString() : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const monthName = code => code ? `${code.slice(0, 4)}/${code.slice(4, 6)}` : '—';

  LT.register({
    section: 'index', key: 'futures', name: '台指期貨',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入台指期資料…</p></div></div>`;
      let D;
      try { D = await LTOpt.load(); } catch (err) { if (ctx.alive()) el.innerHTML = LTOpt.errorPanel(err.message); return; }
      if (!ctx.alive()) return;
      const { futures, spot } = D;
      if (!futures) { el.innerHTML = LTOpt.errorPanel('台指期資料尚未產生'); return; }
      const s = futures.series, n = s.d.length - 1, curve = futures.curve;
      // 現貨對齊期貨的日期，算價差(期貨 − 現貨)
      const spotAt = spot ? new Map(spot.data.d.map((d, i) => [d, spot.data.c[i]])) : new Map();
      const idx = s.d.map(d => spotAt.get(d) ?? null);
      const basis = s.c.map((c, i) => Number.isFinite(c) && Number.isFinite(idx[i]) ? c - idx[i] : null);
      const roll = s.c.map((c, i) => Number.isFinite(c) && Number.isFinite(s.c2[i]) ? s.c2[i] - c : null);   // 轉倉價差 = 次月 − 近月
      const share = s.oi1.map((a, i) => a + s.oi2[i] > 0 ? a / (a + s.oi2[i]) * 100 : null);                   // 近月未平倉占比
      // 換月日(近月契約改變)與主力換月日(次月未平倉超過近月)
      const switches = s.d.filter((d, i) => i > 0 && s.code[i] !== s.code[i - 1]);
      const majors = s.d.filter((d, i) => i > 0 && s.oi2[i] > s.oi1[i] && !(s.oi2[i - 1] > s.oi1[i - 1]) && s.code[i] === s.code[i - 1]);
      const near = curve.contracts.find(x => x.code === s.code[n]) || curve.contracts[0];
      const dFi = n > 0 && Number.isFinite(s.fi[n - 1]) ? s.fi[n] - s.fi[n - 1] : null;
      const nextMonthly = LTOpt.settlements(D, 20).find(x => x.kind === 'month');
      el.innerHTML = `
        <header class="top"><div>
          <h1>台指期貨</h1>
          <p>臺股期貨(TX)近月契約、與加權指數的價差、每月轉倉、三大法人未平倉與各月份報價</p>
        </div></header>
        <div class="panel"><div class="statgrid">
          <div class="stat"><div class="v" style="font-size:18px;">${esc(s.d[n])}</div><div class="l">最新交易日</div></div>
          <div class="stat"><div class="v ${cls(near.chg)}">${int(s.c[n])}</div><div class="l">近月 ${monthName(s.code[n])} 收盤 · ${signed(near.chg)}</div></div>
          <div class="stat"><div class="v">${int(idx[n])}</div><div class="l">加權指數收盤</div></div>
          <div class="stat"><div class="v ${cls(basis[n])}">${signed(basis[n])}</div><div class="l">期現貨價差${Number.isFinite(basis[n]) ? (basis[n] >= 0 ? ' · 正價差' : ' · 逆價差') : ''}</div></div>
          <div class="stat"><div class="v" style="font-size:18px;">${nextMonthly ? esc(nextMonthly.date) : '—'}</div><div class="l">近月結算日${nextMonthly ? ` · 剩 ${nextMonthly.days} 天` : ''}</div></div>
          <div class="stat"><div class="v ${cls(roll[n])}">${signed(roll[n])}</div><div class="l">轉倉價差(${monthName(s.code2[n])} − ${monthName(s.code[n])})</div></div>
          <div class="stat"><div class="v">${Number.isFinite(share[n]) ? share[n].toFixed(0) + '%' : '—'}</div><div class="l">近月未平倉占比(近月 ÷ 近月＋次月)</div></div>
          <div class="stat"><div class="v ${cls(s.fi[n])}">${signed(s.fi[n])}</div><div class="l">外資淨未平倉(口) · 較前日 ${signed(dFi)}</div></div>
        </div></div>
        <div class="panel">
          <h3>台指期近月 vs 加權指數</h3>
          <div id="fChart"></div>
          ${LTChart.legend([{ name: '台指期近月收盤', color: 'var(--amber)' }, { name: '加權指數', color: 'var(--blue)' }])}
          <p class="note">虛線為換月日：近月契約結算後，連續走勢改接下一個月份的契約，換月前後的價格差距是兩個契約本身的價差，不是當天真的漲跌。</p>
          <h3>期現貨價差(期貨 − 現貨)</h3>
          <div id="bChart"></div>
          <p class="note">期貨價格理論上 ≈ 現貨 × (1 + 利率 − 股利率) ^ 剩餘時間，越接近結算日價差越小、結算時歸零。台股 6～8 月除權息旺季時，期貨會先扣掉預期的股利而出現逆價差，屬於正常現象；其他時間的大幅逆價差通常代表市場偏空、避險需求高。</p>
        </div>
        <div class="panel">
          <h3>每月轉倉</h3>
          <div class="heat-pair">
            <div><h4>近月與次月的未平倉量(口)</h4><div id="rOiChart"></div>
              ${LTChart.legend([{ name: '近月', color: 'var(--amber)' }, { name: '次月', color: 'var(--blue)' }])}</div>
            <div><h4>轉倉價差(次月 − 近月，點)</h4><div id="rSpreadChart"></div></div>
          </div>
          <div class="doc" style="margin-top:12px;">
            <ul>
              <li><b>結算</b>：台指期每個月第 3 個週三(遇假日順延)結算，到期的近月契約以當天的特別結算價現金結算。</li>
              <li><b>轉倉</b>：想繼續持有部位的人，要在結算前平掉近月、同時建立次月部位。左圖可以看到結算前幾天，未平倉量從近月(橘)大量移到次月(藍)；次月未平倉超過近月的那天，次月就成為成交最熱絡的<b>主力合約</b>。</li>
              <li><b>轉倉價差</b>：次月比近月貴的點數。多單轉倉要「賣近買遠」，價差為正代表要多付這些點數(成本)，空單轉倉則相反；價差大小反映持有成本與市場對除權息、多空的預期。</li>
              <li>最近的主力換月日：${majors.slice(-3).map(d => esc(d)).join('、') || '—'}；換月(結算)日：${switches.slice(-3).map(d => esc(d)).join('、') || '—'}。</li>
            </ul>
          </div>
        </div>
        <div class="panel">
          <h3>結算日曆</h3>
          ${LTOpt.settlementTable(LTOpt.settlements(D, 8))}
          <p class="note">台指期只有月契約；選擇權另有每週三、週五到期的週選擇權(見<a href="option/market">選擇權市場概況</a>)。月結算日期貨與月選擇權同時結算，成交量與波動通常較大。</p>
        </div>
        <div class="panel">
          <h3>三大法人台指期淨未平倉(口)</h3>
          <div id="iChart"></div>
          ${LTChart.legend([{ name: '外資及陸資', color: 'var(--amber)' }, { name: '投信', color: 'var(--blue)' }, { name: '自營商', color: 'var(--dim)' }])}
          <p class="note">多方未平倉 − 空方未平倉(所有月份合計，不受轉倉影響)。外資的淨部位常被當成籌碼面的參考，但其中有大量是為現股部位避險，淨空單不一定代表看空；觀察「變化方向」比看絕對數字更有意義。投信的大量淨多單多半是期貨 ETF 的部位。</p>
        </div>
        <div class="panel">
          <div class="heat-pair">
            <div><h3>總成交量(口)</h3><div id="vChart"></div></div>
            <div><h3>總未平倉量(口)</h3><div id="oChart"></div></div>
          </div>
          <p class="note">所有月份合計。總未平倉在結算日會因近月契約到期而下降。</p>
        </div>
        <div class="panel">
          <h3>各月份契約(${esc(curve.date)})</h3>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>月份</th><th>到期日</th><th>收盤</th><th>漲跌</th><th>結算價</th><th>與現貨價差</th><th>成交量</th><th>未平倉</th></tr></thead>
            <tbody>${curve.contracts.map(x => `<tr><td>${monthName(x.code)}${x.code === s.code[n] ? ' <span class="tag">近月</span>' : x.code === s.code2[n] ? ' <span class="tag">次月</span>' : ''}</td><td>${esc(x.expiry)}</td>
              <td>${int(x.c)}</td><td class="${cls(x.chg)}">${signed(x.chg)}</td><td>${int(x.s)}</td>
              <td class="${cls((x.c ?? x.s) - idx[n])}">${signed((x.c ?? x.s) - idx[n])}</td><td>${int(x.vol)}</td><td>${int(x.oi)}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="note">遠月契約成交量少，收盤價可能是很久以前的成交，比較時以結算價為準。</p>
        </div>
        <div class="panel doc">
          <h3>契約規格</h3>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>商品</th><th>代號</th><th>每點價值</th><th>說明</th></tr></thead>
            <tbody>
              <tr><td>臺股期貨(大台)</td><td>TX</td><td>200 元</td><td style="text-align:left">本頁資料；每月第 3 個週三結算</td></tr>
              <tr><td>小型臺指期貨(小台)</td><td>MTX</td><td>50 元</td><td style="text-align:left">價格與大台幾乎相同，每點價值與臺指選擇權相同</td></tr>
              <tr><td>微型臺指期貨(微台)</td><td>TMF</td><td>10 元</td><td style="text-align:left">適合小資金練習</td></tr>
            </tbody>
          </table></div>
        </div>`;

      const dfmt = (d, tip) => tip ? d : String(d).slice(2, 7).replace('-', '/');
      const switchLines = switches.map(d => ({ x: d, color: 'var(--border-strong)' }));
      LTChart.line(document.getElementById('fChart'), {
        x: s.d, xType: 'date', label: '台指期與加權指數', xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v), refX: switchLines,
        series: [{ name: '台指期近月', y: s.c, color: 'var(--amber)' }, { name: '加權指數', y: idx, color: 'var(--blue)', width: 1.4 }],
      });
      LTChart.bars(document.getElementById('bChart'), {
        x: s.d, label: '期現貨價差', height: 200, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => signed(v) + ' 點',
        series: [{ name: '價差', y: basis, color: 'var(--amber)' }],
      });
      LTChart.line(document.getElementById('rOiChart'), {
        x: s.d, xType: 'date', label: '近月與次月未平倉', height: 220, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v) + ' 口', refX: switchLines,
        series: [{ name: '近月', y: s.oi1, color: 'var(--amber)' }, { name: '次月', y: s.oi2, color: 'var(--blue)' }],
      });
      LTChart.line(document.getElementById('rSpreadChart'), {
        x: s.d, xType: 'date', label: '轉倉價差', height: 220, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => signed(v) + ' 點', refY: [{ y: 0 }], refX: switchLines,
        series: [{ name: '轉倉價差', y: roll, color: 'var(--amber)' }],
      });
      LTChart.line(document.getElementById('iChart'), {
        x: s.d, xType: 'date', label: '三大法人淨未平倉', xFmt: dfmt, yFmt: int, tipFmt: (_, v) => signed(v) + ' 口', refY: [{ y: 0 }],
        series: [{ name: '外資及陸資', y: s.fi, color: 'var(--amber)' }, { name: '投信', y: s.it, color: 'var(--blue)' }, { name: '自營商', y: s.dl, color: 'var(--dim)', width: 1.4 }],
      });
      LTChart.bars(document.getElementById('vChart'), {
        x: s.d, label: '成交量', height: 200, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v) + ' 口',
        series: [{ name: '成交量', y: s.vol, color: 'var(--blue)' }],
      });
      LTChart.line(document.getElementById('oChart'), {
        x: s.d, xType: 'date', label: '未平倉量', height: 200, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v) + ' 口', refX: switchLines,
        series: [{ name: '未平倉', y: s.oi, color: 'var(--amber)' }],
      });
    },
  });
})();
