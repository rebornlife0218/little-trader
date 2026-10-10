/* 選擇權 · Black-Scholes 計算器：理論價格、Greeks、敏感度熱力圖、Greeks 曲線，並與市場結算價比較
   預設值取自最新資料：現貨 = 加權指數收盤、到期日 = TXO 各到期契約、波動率 = 該契約價平 IV */
(() => {
  const { fmt, pct, esc, codeName, MULT, price, greeks, impliedVol } = LTOpt;
  const GREEKS = [
    ['delta', 'Delta', '標的漲 1 點，選擇權價格變動幾點'],
    ['gamma', 'Gamma', '標的漲 1 點，Delta 變動多少'],
    ['theta', 'Theta', '每過一天，選擇權價格減少幾點(時間價值流失)'],
    ['vega', 'Vega', '波動率上升 1%，選擇權價格變動幾點'],
    ['rho', 'Rho', '利率上升 1%，選擇權價格變動幾點'],
  ];

  LT.register({
    section: 'option', key: 'calculator', name: 'Black-Scholes 計算器',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入選擇權資料…</p></div></div>`;
      let D;
      try { D = await LTOpt.load(); } catch (err) { if (ctx.alive()) el.innerHTML = LTOpt.errorPanel(err.message); return; }
      if (!ctx.alive()) return;
      const { meta, chain, spot } = D;
      const exps = chain.expiries.filter(e => e.days > 0);
      const near = exps.find(e => !e.code[6]) || exps[0];
      const S0 = spot ? spot.close : near.fwd;
      el.innerHTML = `
        <header class="top"><div>
          <h1>Black-Scholes 計算器</h1>
          <p>輸入條件，計算歐式選擇權的理論價格與風險指標(Greeks)，並與臺指選擇權的市場結算價比較</p>
          ${LT.sourceLine(meta)}
        </div></header>
        <div class="panel">
          <h3>輸入條件</h3>
          <div class="paramgrid opt-form">
            <div class="paramitem"><label for="bsS">現貨價格 S</label><input id="bsS" type="number" step="10" value="${Math.round(S0)}"></div>
            <div class="paramitem"><label for="bsK">履約價 K</label><input id="bsK" type="number" step="50" value="${Math.ceil(S0 / 100) * 100}"></div>
            <div class="paramitem"><label for="bsExp">到期契約</label><select id="bsExp">${exps.map((e, i) => `<option value="${i}" ${e === near ? 'selected' : ''}>${esc(codeName(e.code))}(剩 ${e.days} 天)</option>`).join('')}<option value="custom">自訂天數</option></select></div>
            <div class="paramitem"><label for="bsDays">距到期天數</label><input id="bsDays" type="number" min="0.1" step="1" value="${near.days}"></div>
            <div class="paramitem"><label for="bsVol">波動率 σ(%)</label><input id="bsVol" type="number" min="0.1" step="0.5" value="${(near.atm_iv * 100).toFixed(1)}"></div>
            <div class="paramitem"><label for="bsR">無風險利率 r(%)</label><input id="bsR" type="number" step="0.1" value="${(LTOpt.R_DEFAULT * 100).toFixed(1)}"></div>
          </div>
          <p class="note">預設：現貨為加權指數最新收盤${spot ? `(${esc(spot.date)})` : ''}、波動率為所選契約的價平隱含波動率、利率約為一年期定存利率。選擇到期契約會自動帶入天數與波動率。</p>
        </div>
        <div class="panel"><div class="statgrid" id="bsOut"></div><div id="bsMarket" class="note" style="margin-top:10px;"></div></div>
        <div class="panel">
          <h3>Greeks</h3>
          <div class="tablewrap"><table class="stattable" id="bsGreeks"></table></div>
        </div>
        <div class="panel">
          <h3>敏感度分析：現貨價格 × 波動率</h3>
          <p class="note" style="margin-top:0;">不同現貨價格(欄)與波動率(列)下的理論價格(點)，顏色越深越貴。</p>
          <div class="heat-pair"><div><h4>買權 Call</h4><div class="tablewrap" id="heatC"></div></div><div><h4>賣權 Put</h4><div class="tablewrap" id="heatP"></div></div></div>
        </div>
        <div class="panel">
          <h3>Greeks 隨現貨價格的變化</h3>
          ${LTChart.legend([{ name: '買權 Call', color: 'var(--up)' }, { name: '賣權 Put', color: 'var(--down)' }])}
          <div class="greek-grid">${GREEKS.map(g => `<div><h4>${g[1]} <small class="mute">${g[2]}</small></h4><div id="gc-${g[0]}"></div></div>`).join('')}</div>
        </div>
        <div class="panel doc">
          <h3>Black-Scholes 公式</h3>
          ${LTOpt.tex('C = S\\,N(d_1) - K e^{-rT} N(d_2), \\qquad P = K e^{-rT} N(-d_2) - S\\,N(-d_1)')}
          ${LTOpt.tex('d_1 = \\frac{\\ln(S/K) + \\left(r + \\frac{\\sigma^2}{2}\\right)T}{\\sigma\\sqrt{T}}, \\qquad d_2 = d_1 - \\sigma\\sqrt{T}')}
          <p>$N(\\cdot)$ 為標準常態累積分配函數。模型假設標的價格服從幾何布朗運動、波動率與利率固定、只能在到期日履約(歐式，臺指選擇權即為歐式)。實際市場的波動率會隨履約價不同(波動率微笑)，所以用單一 σ 算出的理論價和市場價格會有差距；反過來用市場價格反推的 σ 就是「隱含波動率」。</p>
          <ul>
            <li>價格單位為「點」，臺指選擇權每點 ${MULT} 元。</li>
            <li>Theta 以「每日」、Vega 與 Rho 以「每 1%」表示。</li>
          </ul>
        </div>`;
      el.querySelectorAll('.doc p').forEach(p => { p.innerHTML = p.innerHTML.replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t, { throwOnError: false })); });

      const $ = id => document.getElementById(id);
      $('bsExp').onchange = () => {
        const v = $('bsExp').value;
        if (v !== 'custom') { const e = exps[+v]; $('bsDays').value = e.days; $('bsVol').value = (e.atm_iv * 100).toFixed(1); }
        calc();
      };
      $('bsDays').oninput = () => { $('bsExp').value = 'custom'; calc(); };
      ['bsS', 'bsK', 'bsVol', 'bsR'].forEach(id => { $(id).oninput = calc; });

      function calc() {
        const S = +$('bsS').value, K = +$('bsK').value, T = +$('bsDays').value / 365, v = +$('bsVol').value / 100, r = +$('bsR').value / 100;
        if (!(S > 0 && K > 0 && T > 0 && v > 0)) return;
        const c = price('C', S, K, T, r, v), p = price('P', S, K, T, r, v);
        const gc = greeks('C', S, K, T, r, v), gp = greeks('P', S, K, T, r, v);
        $('bsOut').innerHTML = `
          <div class="stat"><div class="v up">${fmt(c, 1)}</div><div class="l">買權理論價(點) · ${fmt(c * MULT, 0)} 元</div></div>
          <div class="stat"><div class="v down">${fmt(p, 1)}</div><div class="l">賣權理論價(點) · ${fmt(p * MULT, 0)} 元</div></div>
          <div class="stat"><div class="v">${fmt(Math.max(S - K, 0), 0)} / ${fmt(Math.max(K - S, 0), 0)}</div><div class="l">內含價值(買權 / 賣權)</div></div>
          <div class="stat"><div class="v">${fmt(c - Math.max(S - K, 0), 1)} / ${fmt(p - Math.max(K - S, 0), 1)}</div><div class="l">時間價值(買權 / 賣權)</div></div>`;
        // 與市場比較：所選契約中有這個履約價時
        const e = $('bsExp').value === 'custom' ? null : exps[+$('bsExp').value];
        const row = e && e.strikes.find(x => x.k === K);
        $('bsMarket').innerHTML = row
          ? `市場結算價(${esc(chain.date)}，${esc(codeName(e.code))}，履約價 ${K.toLocaleString()})：買權 <b>${fmt(row.c[0], 1)}</b> 點(IV ${pct(row.c[3])})、賣權 <b>${fmt(row.p[0], 1)}</b> 點(IV ${pct(row.p[3])})。
             用現貨價反推：買權 IV ${pct(impliedVol('C', row.c[0], S, K, T, r))}、賣權 IV ${pct(impliedVol('P', row.p[0], S, K, T, r))}。`
          : (e ? `所選契約沒有履約價 ${K.toLocaleString()} 的報價(履約價間距通常為 50 或 100 點)。` : '');
        $('bsGreeks').innerHTML = `<thead><tr><th>Greek</th><th>買權 Call</th><th>賣權 Put</th><th>意義</th></tr></thead><tbody>
          ${GREEKS.map(([k, name, desc]) => `<tr><td>${name}</td>${[gc[k], gp[k]].map(x => `<td class="${x < 0 ? 'down' : 'up'}">${fmt(x, k === 'gamma' ? 6 : 4)}</td>`).join('')}<td style="text-align:left;font-family:Inter,sans-serif;">${desc}</td></tr>`).join('')}</tbody>`;
        heat('heatC', 'C', S, K, T, r); heat('heatP', 'P', S, K, T, r);
        curves(S, K, T, r, v);
      }
      function heat(id, type, S, K, T, r) {
        const spots = Array.from({ length: 9 }, (_, i) => S * (0.96 + i * 0.01));
        const vols = Array.from({ length: 8 }, (_, i) => 0.10 + i * 0.05);
        const grid = vols.map(v => spots.map(s => price(type, s, K, T, r, v)));
        const max = Math.max(...grid.flat()) || 1;
        $(id).innerHTML = `<table class="stattable heat"><thead><tr><th>σ ＼ S</th>${spots.map(s => `<th>${Math.round(s).toLocaleString()}</th>`).join('')}</tr></thead><tbody>
          ${grid.map((row, i) => `<tr><td>${(vols[i] * 100).toFixed(0)}%</td>${row.map(x => `<td style="background:color-mix(in srgb, ${type === 'C' ? 'var(--up)' : 'var(--down)'} ${Math.round(x / max * 55)}%, transparent)">${fmt(x, 0)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      function curves(S, K, T, r, v) {
        const xs = Array.from({ length: 121 }, (_, i) => S * (0.92 + i * 0.17 / 120));
        GREEKS.forEach(([k, name]) => {
          const dg = k === 'gamma' ? 6 : 3;
          LTChart.line($('gc-' + k), {
            x: xs.map(x => Math.round(x)), height: 190, label: name, xFmt: x => Math.round(x).toLocaleString(), yFmt: y => +y.toFixed(dg) + '', tipFmt: (s, y) => fmt(y, dg),
            series: [{ name: 'Call', y: xs.map(x => greeks('C', x, K, T, r, v)[k]), color: 'var(--up)' }, { name: 'Put', y: xs.map(x => greeks('P', x, K, T, r, v)[k]), color: 'var(--down)' }],
            refX: [{ x: Math.round(S), label: '現貨', color: 'var(--amber)' }, ...(Math.abs(K / S - 1) < 0.08 ? [{ x: K, label: 'K', color: 'var(--dim)' }] : [])],
          });
        });
      }
      calc();
    },
  });
})();
