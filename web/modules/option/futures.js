/* 選擇權 · 台指期貨：近月走勢與現貨價差、三大法人淨未平倉、成交量與未平倉量、期限結構
   資料集：data/options/futures.json(pipeline/options/futures.py，隨選擇權資料一起更新) */
(() => {
  const { fmt, esc } = LTOpt;
  const int = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '—';
  const signed = v => Number.isFinite(v) ? (v > 0 ? '+' : '') + Math.round(v).toLocaleString() : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const monthName = code => `${code.slice(0, 4)}/${code.slice(4, 6)}`;

  LT.register({
    section: 'option', key: 'futures', name: '台指期貨',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入台指期資料…</p></div></div>`;
      let D;
      try { D = await LTOpt.load(); } catch (err) { if (ctx.alive()) el.innerHTML = LTOpt.errorPanel(err.message); return; }
      if (!ctx.alive()) return;
      const { meta, futures, spot } = D;
      if (!futures) { el.innerHTML = LTOpt.errorPanel('台指期資料尚未產生'); return; }
      const s = futures.series, n = s.d.length - 1, curve = futures.curve;
      // 現貨對齊期貨的日期，算價差(期貨 − 現貨)
      const spotAt = spot ? new Map(spot.data.d.map((d, i) => [d, spot.data.c[i]])) : new Map();
      const idx = s.d.map(d => spotAt.get(d) ?? null);
      const basis = s.c.map((c, i) => Number.isFinite(c) && Number.isFinite(idx[i]) ? c - idx[i] : null);
      const near = curve.contracts.find(x => x.code === s.code[n]) || curve.contracts[0];
      const dFi = n > 0 && Number.isFinite(s.fi[n - 1]) ? s.fi[n] - s.fi[n - 1] : null;
      el.innerHTML = `
        <header class="top"><div>
          <h1>台指期貨</h1>
          <p>臺股期貨(TX)近月契約、與加權指數的價差、三大法人未平倉與各月份報價</p>
          ${LT.sourceLine(meta)}
        </div></header>
        <div class="panel"><div class="statgrid">
          <div class="stat"><div class="v" style="font-size:18px;">${esc(s.d[n])}</div><div class="l">最新交易日</div></div>
          <div class="stat"><div class="v ${cls(near.chg)}">${int(s.c[n])}</div><div class="l">近月 ${monthName(s.code[n])} 收盤 · ${signed(near.chg)}</div></div>
          <div class="stat"><div class="v">${int(s.s[n])}</div><div class="l">近月結算價</div></div>
          <div class="stat"><div class="v">${int(idx[n])}</div><div class="l">加權指數收盤</div></div>
          <div class="stat"><div class="v ${cls(basis[n])}">${signed(basis[n])}</div><div class="l">價差(期貨 − 現貨)${Number.isFinite(basis[n]) ? (basis[n] >= 0 ? ' · 正價差' : ' · 逆價差') : ''}</div></div>
          <div class="stat"><div class="v">${int(s.vol[n])}</div><div class="l">總成交量(口，含盤後)</div></div>
          <div class="stat"><div class="v">${int(s.oi[n])}</div><div class="l">總未平倉(口)</div></div>
          <div class="stat"><div class="v ${cls(s.fi[n])}">${signed(s.fi[n])}</div><div class="l">外資淨未平倉(口) · 較前日 ${signed(dFi)}</div></div>
        </div></div>
        <div class="panel">
          <h3>台指期近月 vs 加權指數</h3>
          <div id="fChart"></div>
          ${LTChart.legend([{ name: '台指期近月收盤', color: 'var(--amber)' }, { name: '加權指數', color: 'var(--blue)' }])}
          <h3>價差(期貨 − 現貨)</h3>
          <div id="bChart"></div>
          <p class="note">期貨價格理論上 ≈ 現貨 × (1 + 利率 − 股利率) ^ 剩餘時間。台股 6～8 月除權息旺季時，期貨會先扣掉預期的股利而出現逆價差，屬於正常現象；其他時間的大幅逆價差通常代表市場偏空、避險需求高。</p>
        </div>
        <div class="panel">
          <h3>三大法人台指期淨未平倉(口)</h3>
          <div id="iChart"></div>
          ${LTChart.legend([{ name: '外資及陸資', color: 'var(--amber)' }, { name: '投信', color: 'var(--blue)' }, { name: '自營商', color: 'var(--dim)' }])}
          <p class="note">多方未平倉 − 空方未平倉。外資的淨部位常被當成籌碼面的參考，但其中有大量是為現股部位避險，淨空單不一定代表看空；觀察「變化方向」比看絕對數字更有意義。投信的大量淨多單多半是期貨 ETF 的部位。</p>
        </div>
        <div class="panel">
          <div class="heat-pair">
            <div><h3>總成交量(口)</h3><div id="vChart"></div></div>
            <div><h3>總未平倉量(口)</h3><div id="oChart"></div></div>
          </div>
        </div>
        <div class="panel">
          <h3>各月份契約(${esc(curve.date)})</h3>
          <div class="tablewrap"><table class="stattable">
            <thead><tr><th>月份</th><th>到期日</th><th>收盤</th><th>漲跌</th><th>結算價</th><th>與現貨價差</th><th>成交量</th><th>未平倉</th></tr></thead>
            <tbody>${curve.contracts.map(x => `<tr><td>${monthName(x.code)}${x.code === s.code[n] ? ' <span class="tag">近月</span>' : ''}</td><td>${esc(x.expiry)}</td>
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
              <tr><td>臺股期貨(大台)</td><td>TX</td><td>200 元</td><td style="text-align:left">本頁資料；最後交易日為到期月份第 3 個週三</td></tr>
              <tr><td>小型臺指期貨(小台)</td><td>MTX</td><td>50 元</td><td style="text-align:left">價格與大台幾乎相同，每點價值與臺指選擇權相同</td></tr>
              <tr><td>微型臺指期貨(微台)</td><td>TMF</td><td>10 元</td><td style="text-align:left">適合小資金練習</td></tr>
            </tbody>
          </table></div>
        </div>`;

      const dfmt = (d, tip) => tip ? d : String(d).slice(2, 7).replace('-', '/');
      LTChart.line(document.getElementById('fChart'), {
        x: s.d, xType: 'date', label: '台指期與加權指數', xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v),
        series: [{ name: '台指期近月', y: s.c, color: 'var(--amber)' }, { name: '加權指數', y: idx, color: 'var(--blue)', width: 1.4 }],
      });
      LTChart.bars(document.getElementById('bChart'), {
        x: s.d, label: '價差', height: 200, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => signed(v) + ' 點',
        series: [{ name: '價差', y: basis, color: 'var(--amber)' }],
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
        x: s.d, xType: 'date', label: '未平倉量', height: 200, xFmt: dfmt, yFmt: int, tipFmt: (_, v) => int(v) + ' 口',
        series: [{ name: '未平倉', y: s.oi, color: 'var(--amber)' }],
      });
    },
  });
})();
