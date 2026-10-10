/* 選擇權 · 策略損益圖：24 種常見策略的到期損益與今日理論損益、損益兩平點、最大獲利/虧損
   權利金預設帶入所選契約的市場結算價(沒有報價時用 Black-Scholes 理論價)，每一隻腳都可以手動修改。
   策略定義在 lib.js 的 STRATEGIES，新增策略只要加一筆。 */
(() => {
  const { fmt, esc, codeName, MULT, STRATEGIES, pnl } = LTOpt;
  const TYPE = { C: '買權', P: '賣權', F: '小台期貨' };   // 標的部位以小台(每點 50 元，與選擇權相同)計

  LT.register({
    section: 'option', key: 'strategy', name: '策略損益圖',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入選擇權資料…</p></div></div>`;
      let D;
      try { D = await LTOpt.load(); } catch (err) { if (ctx.alive()) el.innerHTML = LTOpt.errorPanel(err.message); return; }
      if (!ctx.alive()) return;
      const { meta, chain, futures } = D;
      const exps = chain.expiries.filter(e => e.days > 0);
      const near = exps.find(e => !e.code[6]) || exps[0];
      const groups = [...new Set(STRATEGIES.map(s => s.group))];
      el.innerHTML = `
        <header class="top"><div>
          <h1>策略損益圖</h1>
          <p>臺指選擇權常見組合策略的損益結構，權利金預設帶入最新市場結算價</p>
          ${LT.sourceLine(meta)}
        </div></header>
        <div class="panel">
          <div class="paramgrid opt-form">
            <div class="paramitem"><label for="stPick">策略</label><select id="stPick">${groups.map(g => `<optgroup label="${g}">${STRATEGIES.filter(s => s.group === g).map(s => `<option value="${s.key}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
            <div class="paramitem"><label for="stExp">到期契約</label><select id="stExp">${exps.map((e, i) => `<option value="${i}" ${e === near ? 'selected' : ''}>${esc(codeName(e.code))}(剩 ${e.days} 天)</option>`).join('')}</select></div>
            <div class="paramitem"><label for="stStep">履約價間距(點)</label><select id="stStep">${[100, 200, 300, 500, 1000].map(s => `<option ${s === 200 ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="paramitem"><label for="stQty">口數(整組)</label><input id="stQty" type="number" min="1" step="1" value="1"></div>
          </div>
          <div id="stView" class="callout" style="margin-bottom:0;"></div>
        </div>
        <div class="panel">
          <h3>部位明細 <small class="mute" style="font-weight:400;">履約價與價格可以直接修改</small></h3>
          <div class="tablewrap"><table class="stattable legs" id="stLegs"></table></div>
        </div>
        <div class="panel">
          <div class="statgrid" id="stStats"></div>
          <h3>損益圖</h3>
          <div id="stChart"></div>
          ${LTChart.legend([{ name: '到期損益', color: 'var(--amber)' }, { name: '今日理論損益(Black-Scholes)', color: 'var(--blue)' }])}
          <p class="note">橫軸為到期時的加權指數，縱軸為整組策略的損益(點；每點 ${MULT} 元)。紅色區域獲利、綠色區域虧損(紅漲綠跌)。藍線用所選契約的價平隱含波動率估計「現在」的損益，越接近到期越貼近橘線。</p>
        </div>`;
      const $ = id => document.getElementById(id);
      let legs = [];

      // 依策略與到期契約重建部位：履約價取價平附近，價格取市場結算價
      function build() {
        const st = STRATEGIES.find(s => s.key === $('stPick').value), e = exps[+$('stExp').value], step = +$('stStep').value;
        const F = e.fwd, atm = Math.round(F / step) * step;
        const K = st.strikes.map(n => atm + n * step);
        legs = st.legs.map(l => {
          const leg = { ...l, qty: l.qty || 1 };
          if (l.type === 'F') { const f = LTOpt.futuresFor(futures, e.code); leg.K = null; leg.entry = Math.round(f ? f.price : F); leg.src = f ? `台指期 ${f.code.slice(4, 6)} 月收盤` : '遠期價格'; }
          else { leg.K = K[l.k - 1]; leg.entry = marketPrice(e, leg.type, leg.K); }
          return leg;
        });
        $('stView').innerHTML = `<b>${esc(st.name)}</b>　適用：${esc(st.view)}　·　結構：${legs.map(l => `${l.side > 0 ? '買進' : '賣出'}${l.qty > 1 ? ' ' + l.qty + ' 口' : ''} ${TYPE[l.type]}${l.K ? ' ' + l.K.toLocaleString() : ''}`).join(' ＋ ')}`;
        drawLegs(); draw();
      }
      function marketPrice(e, type, K) {
        const row = e.strikes.find(x => x.k === K), q = row && row[type === 'C' ? 'c' : 'p'];
        if (q && q[0] > 0) return q[0];
        return +LTOpt.price(type, e.fwd, K, e.days / 365, 0, e.atm_iv).toFixed(1);
      }
      function drawLegs() {
        const e = exps[+$('stExp').value];
        $('stLegs').innerHTML = `<thead><tr><th>買賣</th><th>商品</th><th>口數</th><th>履約價</th><th>價格(點)</th><th>來源</th></tr></thead><tbody>
          ${legs.map((l, i) => `<tr>
            <td class="${l.side > 0 ? 'up' : 'down'}">${l.side > 0 ? '買進' : '賣出'}</td><td>${TYPE[l.type]}</td><td>${l.qty}</td>
            <td>${l.type === 'F' ? '—' : `<input type="number" step="50" data-i="${i}" data-f="K" value="${l.K}">`}</td>
            <td><input type="number" step="0.5" data-i="${i}" data-f="entry" value="${l.entry}"></td>
            <td class="mute">${l.type === 'F' ? l.src : (e.strikes.find(x => x.k === l.K) ? '市場結算價' : '理論價')}</td></tr>`).join('')}</tbody>`;
        $('stLegs').querySelectorAll('input').forEach(inp => inp.oninput = () => {
          const l = legs[+inp.dataset.i];
          l[inp.dataset.f] = +inp.value;
          if (inp.dataset.f === 'K' && l.type !== 'F') {   // 改履約價時重新帶入價格
            l.entry = marketPrice(exps[+$('stExp').value], l.type, l.K);
            inp.closest('tr').querySelector('[data-f=entry]').value = l.entry;
          }
          draw();
        });
      }
      function draw() {
        const e = exps[+$('stExp').value], qty = Math.max(1, +$('stQty').value || 1), F = e.fwd;
        const ks = legs.filter(l => l.K).map(l => l.K);
        const lo = Math.min(F * 0.88, ...ks.map(k => k * 0.97)), hi = Math.max(F * 1.12, ...ks.map(k => k * 1.03));
        const xs = Array.from({ length: 241 }, (_, i) => Math.round(lo + (hi - lo) * i / 240));
        const exp = xs.map(s => pnl(legs, s, 0, 0, 0) * qty);
        const now = xs.map(s => pnl(legs, s, e.days / 365, chain.r, e.atm_iv) * qty);
        // 損益兩平點：到期損益變號處線性內插
        const be = [];
        for (let i = 1; i < xs.length; i++) {
          if ((exp[i - 1] < 0) !== (exp[i] < 0) && exp[i] !== exp[i - 1]) be.push(xs[i - 1] + (xs[i] - xs[i - 1]) * (0 - exp[i - 1]) / (exp[i] - exp[i - 1]));
        }
        // 最大獲利/虧損：兩端斜率不為 0 代表無上限
        const slopeL = exp[1] - exp[0], slopeR = exp[exp.length - 1] - exp[exp.length - 2];
        const maxP = (slopeR > 1e-6 || slopeL < -1e-6) ? Infinity : Math.max(...exp);
        const maxL = (slopeR < -1e-6 || slopeL > 1e-6) ? -Infinity : Math.min(...exp);
        const premium = legs.filter(l => l.type !== 'F').reduce((a, l) => a - l.side * l.qty * l.entry, 0) * qty;
        $('stStats').innerHTML = `
          <div class="stat"><div class="v">${fmt(Math.abs(premium), 1)}</div><div class="l">${premium >= 0 ? '淨收' : '淨付'}權利金(點) · ${fmt(Math.abs(premium) * MULT, 0)} 元</div></div>
          <div class="stat"><div class="v up">${Number.isFinite(maxP) ? fmt(maxP, 1) : '無上限'}</div><div class="l">最大獲利(點)${Number.isFinite(maxP) ? ' · ' + fmt(maxP * MULT, 0) + ' 元' : ''}</div></div>
          <div class="stat"><div class="v down">${Number.isFinite(maxL) ? fmt(maxL, 1) : '無下限'}</div><div class="l">最大虧損(點)${Number.isFinite(maxL) ? ' · ' + fmt(maxL * MULT, 0) + ' 元' : ''}</div></div>
          <div class="stat"><div class="v">${be.length ? be.map(b => fmt(b, 0)).join(' / ') : '—'}</div><div class="l">損益兩平點</div></div>
          <div class="stat"><div class="v">${fmt(F, 0)}</div><div class="l">目前遠期價格</div></div>`;
        LTChart.line($('stChart'), {
          x: xs, label: '策略損益圖', height: 320, xFmt: x => Math.round(x).toLocaleString(), yFmt: y => Math.round(y).toLocaleString(),
          tipFmt: (s, y) => `${fmt(y, 1)} 點(${fmt(y * MULT, 0)} 元)`,
          series: [{ name: '到期損益', y: exp, color: 'var(--amber)', width: 2.5, fill: 'sign' }, { name: '今日理論', y: now, color: 'var(--blue)', dash: '5 4', width: 1.6 }],
          refY: [{ y: 0 }], refX: [{ x: F, label: '目前 ' + fmt(F, 0), color: 'var(--dim)' }],
          points: be.map(b => ({ x: b, y: 0, color: 'var(--amber)', label: fmt(b, 0) })),
        });
      }
      ['stPick', 'stExp', 'stStep'].forEach(id => { $(id).onchange = build; });
      $('stQty').oninput = draw;
      build();
    },
  });
})();
