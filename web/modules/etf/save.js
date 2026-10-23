/* ETF · 怎麼存ETF(etf/save)：常存 ETF 績效比較、ETF 配息課稅試算、0050 vs 勞退基金(共用函式與資料載入在 lib.js) */
(() => {
  const { esc, pctf, cls, ym, statsOf, corr, growth, monthly, MIN_NOW, rollingStudy, pctl, TAX, taxCase, best, rateOf } = LTETF;
  async function save(el, ctx) {
    el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入資料…</p></div></div>`;
    const { C, E, twList, MO, colorOf, failed } = await LTETF.load();
    if (!ctx.alive()) return;
    const $ = s => el.querySelector(s);
    el.innerHTML = `
      <header class="top"><div><h1>怎麼存ETF</h1><p>常存 ETF 比較、配息怎麼繳稅、0050 vs 勞退基金</p></div></header>

      <div class="pk-pane" data-pane="save">${C && E ? `
        <div class="panel">
          <h3>一、常存的 ETF 績效比較</h3>
          <div class="pk-picks" id="pkPicks">${twList.map(x => `<label><input type="checkbox" value="${x.code}" checked> <b>${x.code}</b> ${esc(x.name)}<small>${x.kind}</small></label>`).join('')}</div>
          <p class="note" id="pkCommonNote" style="margin-top:6px;"></p>
          <div id="pkEtfChart"></div>
          <div id="pkEtfLegend"></div>
          <div class="tablewrap" style="margin-top:10px;"><table class="stattable" id="pkEtfTable"></table></div>
          <p class="note">共同期間：從勾選的 ETF 中最晚上市的那一檔開始比較，期間越短越容易受單一年度行情影響，可以取消勾選上市較晚的 ETF 拉長比較期間。<b>配息貢獻</b> = 年化總報酬 − 年化價格報酬。2016 年以前的收盤價取自 Yahoo Finance，不含沒有成交的日子；總報酬用臺灣證券交易所的除息資料自行計算(股利在除息日以收盤價再投入)。</p>
          <div class="tablewrap" style="margin-top:6px;"><table class="stattable" id="pkSince"></table></div>
        </div>

        <div class="panel">
          <h3>二、ETF 配息怎麼繳稅(試算)</h3>
          <div class="doc">
            <p>ETF 的配息不一定全部是「股利」：投信會依來源拆成幾種所得，課稅方式各不相同。每次配息的組成可以在投信網站的「收益分配組成」公告或年初寄的扣繳憑單查到。</p>
          </div>
          <div class="tablewrap"><table class="stattable tx-src">
            <thead><tr><th>配息來源</th><th>常見於</th><th>綜合所得稅</th><th>二代健保補充保費</th></tr></thead>
            <tbody>
              <tr><td>股利所得</td><td>台股 ETF(0050、高股息 ETF)的主要來源</td><td style="text-align:left">二選一：<b>合併計稅</b>(併入所得，可抵減股利的 8.5%，每戶上限 8 萬元)或<b>分開計稅</b>(單一稅率 28%)</td><td rowspan="2" style="text-align:left">單次給付達 <b>2 萬元</b>就扣 <b>2.11%</b>(股利、利息分開計算)</td></tr>
              <tr><td>利息所得</td><td>持有債券或現金的部分</td><td style="text-align:left">併入綜合所得，境內利息可適用每戶 <b>27 萬元</b>儲蓄投資特別扣除額(與銀行存款利息合計)</td></tr>
              <tr><td>收益平準金</td><td>高股息 ETF 規模快速增加時較多</td><td>不課稅</td><td>不扣</td></tr>
              <tr><td>資本利得(證券交易所得)</td><td>賣出成分股的已實現獲利</td><td>停徵，不課稅</td><td>不扣</td></tr>
              <tr><td>海外所得</td><td>投資海外股票、債券的 ETF</td><td style="text-align:left">不併入綜合所得；全戶海外所得達 100 萬元才計入基本所得額(最低稅負制)</td><td>不扣</td></tr>
            </tbody>
          </table></div>
          <h4>試算你的稅</h4>
          <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
            <div class="paramitem"><label for="txStatus">申報方式</label><select id="txStatus"><option value="1">單身</option><option value="2">夫妻合併申報</option></select></div>
            <div class="paramitem"><label for="txDeps">受扶養親屬(人)</label><input id="txDeps" type="number" min="0" max="10" step="1" value="0"></div>
            <div class="paramitem"><label for="txSal1">本人薪資(元/年)</label><input id="txSal1" type="number" min="0" step="10000" value="600000"></div>
            <div class="paramitem tx-spouse"><label for="txSal2">配偶薪資(元/年)</label><input id="txSal2" type="number" min="0" step="10000" value="0"></div>
            <div class="paramitem"><label for="txDiv">ETF 股利所得(元/年)</label><input id="txDiv" type="number" min="0" step="10000" value="200000"></div>
            <div class="paramitem"><label for="txInt">利息所得(含存款，元/年)</label><input id="txInt" type="number" min="0" step="1000" value="10000"></div>
            <div class="paramitem"><label for="txEq">收益平準金等免稅部分(元/年)</label><input id="txEq" type="number" min="0" step="1000" value="0"></div>
            <div class="paramitem"><label for="txPay">一年配息幾次</label><select id="txPay"><option value="1">年配(1 次)</option><option value="2">半年配(2 次)</option><option value="4" selected>季配(4 次)</option><option value="12">月配(12 次)</option></select></div>
          </div>
          <div class="statgrid" id="txStats" style="margin:14px 0;"></div>
          <div class="tablewrap"><table class="stattable" id="txTable"></table></div>
          <ul class="insight" id="txInsight"></ul>
          <p class="note">依財政部公告的 115 年度(116 年 5 月申報)數額：免稅額每人 101,000 元、標準扣除額單身 136,000 元 / 夫妻 272,000 元、薪資所得特別扣除額每人最多 227,000 元、儲蓄投資特別扣除額 270,000 元；課稅級距 5%(61 萬以下)、12%(138 萬以下)、20%(277 萬以下)、30%(519 萬以下)、40%。試算假設使用標準扣除額、沒有其他所得、扶養親屬未滿 70 歲，未計入基本生活費差額(可能使稅額再少一點)；實際請以國稅局報稅軟體試算為準。負數代表可以退稅。</p>
        </div>

        <div class="panel">
          <div class="pickrow" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <h3 style="margin:0;">三、0050 vs 勞退基金</h3>
            <div class="btnrow-l pk-range">${[['all', '全期間'], [120, '近 10 年'], [60, '近 5 年'], [36, '近 3 年']].map(([k, n], i) => `<button data-r="${k}" class="${i === 0 ? 'active' : ''}">${n}</button>`).join('')}</div>
          </div>
          <div class="statgrid" id="pkStats" style="margin:14px 0;"></div>
          <div id="pkChart"></div>
          ${LTChart.legend([{ name: '勞退基金(新制)', color: 'var(--blue)' }, { name: '0050 總報酬(股利再投入)', color: 'var(--amber)' }, { name: '0050 價格報酬(不含股利)', color: 'var(--dim)' }])}
          <details class="pk-more"><summary>每年報酬與說明</summary>
            <div class="tablewrap" style="margin-top:10px;"><table class="stattable" id="pkYears"></table></div>
            <div class="doc"><ul>
              <li><b>勞退基金的收益率怎麼算</b>：勞動基金運用局每月公告的「最近月份收益率」是<b>當年度截至該月的累計收益率</b>，每年 1 月重新起算。本頁換成每月報酬再連乘：1 月就是公告數字，其他月份為 (1 + 本月累計) ÷ (1 + 上月累計) − 1，連乘後每年 12 月的結果與公告的全年收益率相同。</li>
              <li><b>保證收益</b>：勞退新制個人專戶在請領時，累積收益不得低於以當地銀行二年定期存款利率計算的收益(勞工退休金條例第 23 條)。</li>
              <li><b>為什麼差這麼多</b>：勞退基金分散投資國內外股票、債券等資產，波動小、回撤淺；0050 是 100% 台股大型股，長期報酬較高但波動與回撤也大得多。</li>
            </ul></div>
          </details>
        </div>
` : failed}
      </div>
`;
    if (!C || !E) return;

    /* ---------- 一、0050 vs 勞退基金 ---------- */
    const drawLpf = r => {
      el.querySelectorAll('.pk-range button').forEach(b => b.classList.toggle('active', b.dataset.r === String(r)));
      const from = r === 'all' ? 0 : Math.max(0, C.months.length - r);
      const M = C.months.slice(from), L = C.lpf.slice(from), T = C.etf_total.slice(from), P = C.etf_price.slice(from);
      const sL = statsOf(L, 12), sT = statsOf(T, 12), sP = statsOf(P, 12);
      const card = (v, l, style = '') => `<div class="stat"><div class="v" style="${style}">${v}</div><div class="l">${l}</div></div>`;
      $('#pkStats').innerHTML = card(`${ym(M[0])}～${ym(M[M.length - 1])}`, `比較期間(${M.length} 個月)`, 'font-size:16px;') +
        card(pctf(sL.cum, 0), `勞退基金累積 · 年化 ${pctf(sL.cagr)}`) + card(pctf(sT.cum, 0), `0050 總報酬累積 · 年化 ${pctf(sT.cagr)}`) +
        card(pctf(sP.cum, 0), `0050 價格累積 · 年化 ${pctf(sP.cagr)}`) + card(`${(sL.vol * 100).toFixed(1)}% / ${(sT.vol * 100).toFixed(1)}%`, '年化波動(勞退 / 0050)') +
        card(`${pctf(sL.mdd, 0)} / ${pctf(sT.mdd, 0)}`, '最大回撤(勞退 / 0050)') + card(corr(L, T).toFixed(2), '月報酬相關係數');
      const labels = ['起點', ...M], g = a => [100, ...growth(a).map(v => v * 100)];
      LTChart.line($('#pkChart'), {
        x: labels.map((_, i) => i), label: '0050 vs 勞退基金', height: 280,
        xFmt: (i, tip) => i === 0 ? (tip ? `起點(${ym(M[0])} 初)` : '') : (tip ? ym(labels[i]) : labels[i].slice(2).replace('-', '/')),
        yFmt: v => Math.round(v), tipFmt: (s, v) => `${v.toFixed(1)}(${pctf(v / 100 - 1, 1)})`, refY: [{ y: 100 }],
        series: [{ name: '勞退基金', y: g(L), color: 'var(--blue)' }, { name: '0050 總報酬', y: g(T), color: 'var(--amber)' }, { name: '0050 價格', y: g(P), color: 'var(--dim)', width: 1.4 }],
      });
    };
    $('.pk-range').onclick = e => { const b = e.target.closest('[data-r]'); if (b) drawLpf(b.dataset.r === 'all' ? 'all' : +b.dataset.r); };
    drawLpf('all');
    const years = [...new Set(C.months.map(m => m.slice(0, 4)))];
    const yr = (arr, y) => { const idx = C.months.map((m, i) => m.startsWith(y) ? i : -1).filter(i => i >= 0); return { r: idx.reduce((v, i) => v * (1 + arr[i]), 1) - 1, n: idx.length, first: C.months[idx[0]], last: C.months[idx[idx.length - 1]] }; };
    $('#pkYears').innerHTML = `<thead><tr><th>年度</th><th>勞退基金</th><th>0050 總報酬</th><th>0050 價格報酬</th><th>誰比較好(總報酬)</th></tr></thead><tbody>
      ${years.slice().reverse().map(y => { const l = yr(C.lpf, y), t = yr(C.etf_total, y), p = yr(C.etf_price, y), partial = l.n < 12;
        return `<tr><td>${y}${partial ? ` <small class="mute">(${+l.first.slice(5)}～${+l.last.slice(5)} 月)</small>` : ''}</td><td class="${cls(l.r)}">${pctf(l.r)}</td><td class="${cls(t.r)}">${pctf(t.r)}</td><td class="${cls(p.r)}">${pctf(p.r)}</td>
          <td style="font-family:Inter,sans-serif;font-weight:700;color:${t.r > l.r ? 'var(--up)' : 'var(--blue)'}">${t.r > l.r ? '0050' : '勞退基金'}</td></tr>`; }).join('')}</tbody>`;

    /* ---------- 二、常存的 ETF 績效比較 ---------- */
    const drawEtfs = () => {
      const picked = [...el.querySelectorAll('#pkPicks input:checked')].map(i => i.value);
      if (!picked.length) { $('#pkEtfTable').innerHTML = ''; $('#pkEtfChart').innerHTML = '<p class="mute">請至少勾選一檔 ETF</p>'; $('#pkEtfLegend').innerHTML = ''; return; }
      const start = picked.map(c => MO[c].m[0]).sort().pop();          // 最晚上市那一檔的第一個月
      const months = MO[picked[0]].m.filter(m => m >= start && picked.every(c => MO[c].m.includes(m)));
      const ret = (c, key) => { const mo = MO[c]; return months.slice(1).map((m, k) => mo[key][mo.m.indexOf(m)] / mo[key][mo.m.indexOf(months[k])] - 1); };
      $('#pkCommonNote').textContent = `共同期間：${ym(months[0])} 月底 ～ ${ym(months[months.length - 1])}(${months.length - 1} 個月)`;
      const series = picked.map(c => ({ name: c, y: [100, ...growth(ret(c, 'a')).map(v => v * 100)], color: colorOf(c) }));
      LTChart.line($('#pkEtfChart'), { x: months, xType: 'date', label: '常存 ETF 總報酬比較', height: 300, xFmt: (m, tip) => tip ? ym(m) : m.slice(2).replace('-', '/'),
        yFmt: v => Math.round(v), tipFmt: (s, v) => `${v.toFixed(1)}(${pctf(v / 100 - 1, 1)})`, refY: [{ y: 100 }], series });
      $('#pkEtfLegend').innerHTML = LTChart.legend(series.map(s => ({ name: `${s.name} ${twList.find(x => x.code === s.name).name}`, color: s.color })));
      const rows = picked.map(c => { const t = statsOf(ret(c, 'a'), 12), p = statsOf(ret(c, 'c'), 12); return { c, t, p }; }).sort((a, b) => b.t.cagr - a.t.cagr);
      $('#pkEtfTable').innerHTML = `<thead><tr><th>ETF</th><th>種類</th><th>總報酬(累積)</th><th>年化總報酬</th><th>年化價格報酬</th><th>配息貢獻</th><th>年化波動</th><th>最大回撤</th></tr></thead><tbody>
        ${rows.map(({ c, t, p }) => `<tr><td><b>${c}</b> ${esc(twList.find(x => x.code === c).name)}</td><td>${twList.find(x => x.code === c).kind}</td>
          <td class="${cls(t.cum)}">${pctf(t.cum, 0)}</td><td class="${cls(t.cagr)}">${pctf(t.cagr)}</td><td class="${cls(p.cagr)}">${pctf(p.cagr)}</td><td>${pctf(t.cagr - p.cagr)}</td>
          <td>${(t.vol * 100).toFixed(1)}%</td><td class="down">${pctf(t.mdd, 0)}</td></tr>`).join('')}</tbody>`;
    };
    el.querySelector('#pkPicks').onchange = drawEtfs;
    drawEtfs();
    // 各自上市以來
    $('#pkSince').innerHTML = `<thead><tr><th colspan="5" style="text-align:left">各自上市(資料起點)以來</th></tr><tr><th>ETF</th><th>資料起點</th><th>年數</th><th>年化總報酬</th><th>最大回撤</th></tr></thead><tbody>
      ${twList.map(x => { const mo = MO[x.code], r = mo.a.slice(1).map((v, k) => v / mo.a[k] - 1), s = statsOf(r, 12);
        return `<tr><td><b>${x.code}</b> ${esc(x.name)}</td><td>${x.start}</td><td>${(r.length / 12).toFixed(1)}</td><td class="${cls(s.cagr)}">${pctf(s.cagr)}</td><td class="down">${pctf(s.mdd, 0)}</td></tr>`; }).join('')}</tbody>`;


    /* ---------- 二、ETF 配息課稅試算 ---------- */
    const money = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString();
    const drawTax = () => {
      const num = id => Math.max(0, +$(id).value || 0);
      const o = { married: $('#txStatus').value === '2', deps: Math.round(num('#txDeps')), sal1: num('#txSal1'), sal2: num('#txSal2'), int: num('#txInt') };
      el.querySelectorAll('.tx-spouse').forEach(x => { x.hidden = !o.married; });
      const div = num('#txDiv'), eq = num('#txEq'), pay = +$('#txPay').value;
      const c = taxCase(o, div), c0 = taxCase(o, 0), useA = c.A <= c.B;
      const divTax = best(c) - best(c0);   // 這筆股利讓稅增加(或減少)多少
      // 二代健保補充保費：每次給付的股利、利息分別判斷是否達 2 萬
      const per = div / pay, perInt = o.int / pay;
      const nhi = (per >= TAX.nhiMin ? per * TAX.nhi * pay : 0) + (perInt >= TAX.nhiMin ? perInt * TAX.nhi * pay : 0);
      // 不用繳稅的股利上限(合併計稅，稅額 ≤ 0)、合併與分開的交叉點
      const search = f => { let lo = 0, hi = 2e7; if (!f(lo)) return 0; if (f(hi)) return Infinity; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return lo; };
      // 不會讓稅變多的股利上限：合併計稅後的稅額不超過沒有股利時(先每 1,000 元掃描，再細分)
      const noMore = d => best(taxCase(o, d)) <= best(c0) + 0.5;
      let free = 0;
      for (let d = 0; d <= 5e6; d += 1000) if (noMore(d)) free = d;
      if (free >= 5e6) free = Infinity; else { let lo = free, hi = free + 1000; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (noMore(m)) lo = m; else hi = m; } free = lo < 100 ? 0 : lo; }   // 不到 100 元是計算誤差，視為 0
      const cross = search(d => { const t = taxCase(o, d); return t.A <= t.B; });
      $('#txStats').innerHTML = `
        <div class="stat"><div class="v">${money(divTax)}</div><div class="l">這些股利讓你多繳(負數為少繳 / 退稅)的稅<br>有效稅率 ${div ? (divTax / div * 100).toFixed(1) + '%' : '—'}</div></div>
        <div class="stat"><div class="v">${useA ? '合併計稅' : '分開計稅'}</div><div class="l">比較划算的方式<br>省 ${money(Math.abs(c.A - c.B))} 元</div></div>
        <div class="stat"><div class="v">${money(nhi)}</div><div class="l">二代健保補充保費<br>每次配息股利約 ${money(per)} 元</div></div>
        <div class="stat"><div class="v">${free === Infinity ? '—' : money(free)}</div><div class="l">不會讓稅變多的股利上限<br>其他條件不變時</div></div>`;
      $('#txTable').innerHTML = `<thead><tr><th></th><th>合併計稅</th><th>分開計稅</th></tr></thead><tbody>
        <tr><td>綜合所得淨額</td><td>${money(c.netA)}</td><td>${money(c.netB)}(股利不併入)</td></tr>
        <tr><td>適用最高稅率</td><td>${(rateOf(c.netA) * 100).toFixed(0)}%</td><td>${(rateOf(c.netB) * 100).toFixed(0)}% ＋ 股利 28%</td></tr>
        <tr><td>股利可抵減稅額</td><td>${money(c.credit)}${div * TAX.credit > TAX.creditCap ? '(已達上限 8 萬)' : ''}</td><td>—</td></tr>
        <tr><td>應納稅額</td><td class="${useA ? 'beat' : ''}">${money(c.A)}</td><td class="${useA ? '' : 'beat'}">${money(c.B)}</td></tr>
        <tr><td>沒有這些股利時的稅額</td><td colspan="2">${money(best(c0))}</td></tr></tbody>`;
      const fullCredit = TAX.creditCap / TAX.credit;
      $('#txInsight').innerHTML = `
        <li><b>怎麼選</b>：合併計稅時，每多 1 元股利實際多繳「適用稅率 − 8.5%」；分開計稅固定 28%。所以適用 5%～30% 稅率時通常<b>合併計稅</b>比較省(5% 的人甚至會退稅)；適用 40% 稅率，或股利多到 8.5% 抵減超過 8 萬元上限(約 94 萬元股利)時，<b>分開計稅</b>才可能比較省。${Number.isFinite(cross) && cross > 0 ? `以你目前的條件，股利在 ${money(cross)} 元以下選合併計稅比較省，超過後改選分開計稅。` : useA ? '以你目前的條件，股利再多都是合併計稅比較省。' : ''}</li>
        <li><b>股利的免稅額度</b>：${free === Infinity ? '以目前條件，股利再多都不會讓稅變多。' : free < 1 ? '以目前條件，有股利就會多繳稅(適用稅率已高於 8.5%)。' : `其他所得不變時，一年股利在 ${money(free)} 元以內，合併計稅的 8.5% 抵減足以抵掉增加的稅，<b>不會多繳稅</b>，適用 5% 稅率的人甚至可以退稅；超過後才開始多繳。`}8.5% 抵減每戶上限 8 萬元，大約股利 ${money(fullCredit)} 元就會用滿。</li>
        <li><b>補充保費</b>：${per >= TAX.nhiMin ? `每次配息的股利約 ${money(per)} 元，超過 2 萬元，每次會被先扣 2.11%，一年約 ${money(nhi)} 元。` : `每次配息的股利約 ${money(per)} 元，未達 2 萬元，不會被扣。`}門檻是<b>每一次、每一個人</b>：一年股利在 ${money(TAX.nhiMin * pay)} 元以內就不會扣；選月配或季配 ETF、或由家人分別持有，都能讓單次金額低於 2 萬元。</li>
        <li><b>收益平準金</b>${eq ? `(你填了 ${money(eq)} 元)` : ''}、已實現資本利得都不用繳稅也不扣補充保費，不需要填進股利。</li>`;
    };
    ['#txStatus', '#txPay'].forEach(id => { $(id).onchange = drawTax; });
    ['#txDeps', '#txSal1', '#txSal2', '#txDiv', '#txInt', '#txEq'].forEach(id => { $(id).oninput = drawTax; });
    drawTax();
  }
  LT.register({ section: 'etf', key: 'save', name: '怎麼存ETF', mount: save });
})();
