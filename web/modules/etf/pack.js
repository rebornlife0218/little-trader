/* ETF · ETF大禮包：三個分頁
   · ETF介紹：ETF 是什麼、種類、成本、配息與總報酬、折溢價
   · 怎麼存ETF：常存 ETF 績效比較、ETF 配息課稅試算、0050 vs 勞退基金
   · ETF研究：和台股其他研究一樣，最上方選主題、再用下拉式選單選研究(RCATS)
       投資方式：ARKK 研究(追高的代價)、單筆投入、定期定額、逢低買入(LSI vs DCA vs BTD)
       主動式 ETF：A 系列 ETF 跟單(資料集 etf_research；pipeline/etf_research/update.py；績效統計與圖表共用 tw-strategy.js 的 LTTW)
   資料集：data/etf_compare/(compare.json、etfs.json；pipeline/etf_compare/update.py)、data/etf_research/(etf_follow.json) */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pctf = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const ym = m => m.replace('-', '/');
  const PREMIUM_REFS = [
    { name: '臺灣證券交易所 · ETF 盤中預估淨值與折溢價', desc: '各檔國內 ETF 的市價、預估淨值與折溢價率，盤中即時揭露',
      url: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant' },
  ];
  const ARKK_REFS = [
    { name: 'Morningstar · ARKK: An Object Lesson in How Not to Invest(Amy C. Arnott，2021-12-21)', url: 'https://www.morningstar.com.au/funds/arkk-an-object-lesson-in-how-not-to-invest' },
    { name: 'WealthManagement · The Top 15 Wealth-Destroying Funds of the Last Decade(引用 Morningstar，2024)', url: 'https://www.wealthmanagement.com/etfs/top-15-wealth-destroying-funds-last-decade' },
  ];

  /* ---------- 計算工具 ---------- */
  function statsOf(rets, perYear) {
    const n = rets.length; if (!n) return {};
    const cum = rets.reduce((v, r) => v * (1 + r), 1) - 1, m = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / Math.max(1, n - 1));
    let peak = 1, v = 1, mdd = 0;
    rets.forEach(r => { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    return { cum, cagr: (1 + cum) ** (perYear / n) - 1, vol: sd * Math.sqrt(perYear), mdd };
  }
  const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sab / Math.sqrt(sa * sb); };
  const growth = rets => { let v = 1; return rets.map(r => (v *= 1 + r)); };
  // 月底取樣：回傳 {m: ['YYYY-MM'…], c: [...], a: [...]}
  function monthly(dd) {
    const out = { m: [], c: [], a: [], i: [] };
    dd.d.forEach((d, i) => {
      const k = d.slice(0, 7);
      if (out.m[out.m.length - 1] === k) { out.c[out.c.length - 1] = dd.c[i]; out.a[out.a.length - 1] = dd.a[i]; out.i[out.i.length - 1] = i; }
      else { out.m.push(k); out.c.push(dd.c[i]); out.a.push(dd.a[i]); out.i.push(i); }
    });
    return out;
  }

  /* 單筆投入(LSI) vs 定期定額(DCA) vs 逢低買入(BTD)：仿 PWL Capital 的滾動期間比較
     P：月底的總報酬指數(或價格指數)；H：持有年數；dcaN：定期定額分幾個月投入；dip：逢低買入的跌幅門檻
     cash：等待投入的現金每月利率；每個起點 t 都比較 t ～ t + 12H 的年化報酬
     H = 0 代表「持有至今」：每個起點都持有到最後一個月，持有期間各不相同(至少 MIN_NOW 個月) */
  const MIN_NOW = 36;
  function rollingStudy(P, H, dcaN, dips, cashYear) {
    const n = P.length, r = (1 + cashYear) ** (1 / 12) - 1;
    const ath = []; P.forEach((v, i) => ath.push(Math.max(v, i ? ath[i - 1] : v)));   // 歷史高點(到當月為止)
    const out = [];
    for (let t = 0; t < n; t++) {
      const m = H ? H * 12 : n - 1 - t;
      if (H ? t + m >= n : m < Math.max(MIN_NOW, dcaN)) break;
      const end = t + m, yrs = m / 12, ann = v => v ** (1 / yrs) - 1;
      const lsi = ann(P[end] / P[t]);
      // 定期定額：每月投入 1/dcaN，還沒投入的錢放現金賺利息
      let dcaV = 0;
      for (let k = 0; k < dcaN; k++) dcaV += (1 / dcaN) * (1 + r) ** k * P[end] / P[t + k];
      const btd = dips.map(d => {
        let buy = -1;
        for (let k = t; k <= end; k++) if (P[k] <= (1 - d) * ath[k]) { buy = k; break; }
        return buy < 0 ? ann((1 + r) ** m) : ann((1 + r) ** (buy - t) * P[end] / P[buy]);   // 沒跌到門檻就一直拿著現金
      });
      const btdNow = dips.map(d => P[t] <= (1 - d) * ath[t]);   // 起點當月已經跌超過門檻：立刻進場，和單筆相同
      out.push({ t, lsi, dca: ann(dcaV), btd, btdNow });
    }
    return out;
  }
  const pctl = (arr, q) => { const a = [...arr].sort((x, y) => x - y), i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); };

  /* ETF 配息課稅試算(115 年度數額，財政部 114/11/27 公告) */
  const TAX = {
    year: 115, exempt: 101000, std: 136000, salary: 227000, savings: 270000,
    credit: 0.085, creditCap: 80000, sep: 0.28, nhi: 0.0211, nhiMin: 20000,
    // [所得淨額上限, 稅率, 累進差額]
    brackets: [[610000, 0.05, 0], [1380000, 0.12, 42700], [2770000, 0.2, 153100], [5190000, 0.3, 430100], [Infinity, 0.4, 949100]],
  };
  const progTax = net => { if (net <= 0) return 0; const b = TAX.brackets.find(x => net <= x[0]); return net * b[1] - b[2]; };
  const rateOf = net => (TAX.brackets.find(x => Math.max(net, 0) <= x[0]) || TAX.brackets[0])[1];
  // 回傳合併計稅(A)與分開計稅(B)的應納稅額；負數 = 退稅
  function taxCase(o, div) {
    const n = o.married ? 2 : 1;
    const exempt = (n + o.deps) * TAX.exempt, std = TAX.std * n;
    const salDed = Math.min(o.sal1, TAX.salary) + (o.married ? Math.min(o.sal2, TAX.salary) : 0);
    const savDed = Math.min(o.int, TAX.savings);
    const base = o.sal1 + (o.married ? o.sal2 : 0) + o.int - exempt - std - salDed - savDed;
    const netA = Math.max(0, base + div), netB = Math.max(0, base);
    const credit = Math.min(div * TAX.credit, TAX.creditCap);
    return { netA, netB, credit, A: progTax(netA) - credit, B: progTax(netB) + div * TAX.sep };
  }
  const best = c => Math.min(c.A, c.B);

  /* ---------- ETF研究：主題與研究清單(同台股其他研究：最上方選主題，再用下拉式選單選研究；同一系列同一個顏色) ----------
     新增研究：RCATS 加一筆，mount 裡的 VIEWS 加上畫面函式；需要資料檔的研究放在資料集 etf_research(pipeline/etf_research/update.py) */
  const RSERIES = { how: { name: '投資方式', color: 'var(--amber)' }, active: { name: '主動式 ETF', color: '#B07CF0' } };
  const RCATS = [
    { key: 'how', name: '投資方式', desc: 'ARKK 研究、單筆 vs 定期定額 vs 逢低買入', studies: [
      { key: 'arkk', name: 'ARKK 研究', series: 'how', desc: '主題型 ETF 追高的代價：基金賺錢，投資人卻賠錢' },
      { key: 'lsi', name: '單筆 vs 定期定額 vs 逢低買入', series: 'how', desc: '已經有一筆錢，一次投入、分批投入，還是等下跌再買' },
    ] },
    { key: 'active', name: '主動式 ETF', desc: 'A 系列 ETF 跟單', studies: [
      { key: 'etf_follow', name: 'A 系列 ETF 跟單', series: 'active', desc: '主動式 ETF 每天公布持股，經理人加碼、調整、新納入之後跟著買，有沒有超額報酬' },
    ] },
  ];
  const RCAT_KEY = 'lt.erCat', RSTUDY_KEY = 'lt.erStudy';
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無法使用 localStorage */ } };
  const recall = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const tagOf = s => `<span class="series-tag"><i style="background:${RSERIES[s].color}"></i>${esc(RSERIES[s].name)}</span>`;

  // 報告(Markdown)：表格加上站內表格樣式，## → h3、### → h4；圖片 ![說明](xxx.png) 換成依 JSON 畫的圖(網站不放 png)
  function md(src) {
    const box = document.createElement('div');
    src = src.replace(/^!\[([^\]]*)\]\(([\w.-]+\.png)\)[ \t]*$/gm, (_, cap, f) => `
<figure class="md-fig twr-fig"><div data-fig="${esc(f)}"></div><figcaption>${esc(cap)}</figcaption></figure>
`);
    box.innerHTML = marked.parse(src);
    box.querySelectorAll('table').forEach(t => { t.classList.add('stattable', 'md-table'); t.outerHTML = `<div class="tablewrap">${t.outerHTML}</div>`; });
    const retag = (s, tagName, c) => box.querySelectorAll(s).forEach(h => { const e = document.createElement(tagName); e.className = c; e.innerHTML = h.innerHTML; h.replaceWith(e); });
    retag('h3', 'h4', 'md-h3');
    retag('h2', 'h3', 'md-h2');
    box.querySelectorAll('a').forEach(a => { if (!/^https?:/.test(a.getAttribute('href') || '')) a.replaceWith(...a.childNodes); });
    return box.innerHTML;
  }

  /* ---------- ETF研究 · A 系列 ETF 跟單(資料集 etf_research；淨值與交易統計已在研究程式算好，網頁只算績效統計、畫圖與顯示報告) ---------- */
  const MC = { 加碼: 'var(--amber)', 調整: '#B07CF0', 新納入: '#5fd0c5' };   // 三種模式的顏色
  const fade = c => `color-mix(in srgb, ${c} 35%, transparent)`;
  const EF_STAT = '夏普值 = 日報酬平均 ÷ 日報酬標準差 × √252(這份研究用的算法，和台股策略頁的「年化報酬 ÷ 年化波動」不同)；索提諾比率 = 年化報酬 ÷ 年化下檔波動；無風險利率以 0 計。最長連續回撤 = 淨值從前一個高點跌下來、到重新站回高點經過的交易日數(還沒站回就算到最新一天)。';
  const EF_COST = '績效都已扣除交易成本：手續費 0.1425% 打 3 折(買賣都收)、證交稅 0.3%(賣出時收)、滑價買賣合計一個升降單位(買進 +0.5、賣出 −0.5 個升降單位，依成交價的級距，不超過漲跌停價)；0050 不扣成本。';
  const EF_RULES = '開盤漲停或沒有成交買不到，延後一天，隔天仍買不到就放棄；要賣出時跌停或沒有成交，延到下一個交易日同一時點再賣；持有期間下市櫃，以最後收盤價轉為現金。報酬用還原股價(含除權息)。';
  // 績效統計同 LTTW.stats，只有夏普值改用日報酬平均 ÷ 標準差 × √252
  function statsC(nav) {
    const x = window.LTTW.stats(nav), r = [];
    for (let i = 1; i < nav.length; i++) r.push(nav[i] / nav[i - 1] - 1);
    const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
    return { ...x, sharpe: m / sd * Math.sqrt(252) };
  }
  async function etfFollow(el, alive) {
    el.innerHTML = `<div class="panel"><div class="page-loading"><span class="spinner"></span>載入中…</div></div>`;
    let B;
    try { B = (await LT.loadJSON('etf_research', 'etf_follow.json')).data; } catch (e) {
      if (alive()) el.innerHTML = `<div class="panel"><p class="mute">研究資料尚未產生：${esc(e.message)}</p></div>`;
      return;
    }
    if (!alive()) return;
    const W = window.LTTW, pct = W.pct, $ = s => el.querySelector(s);
    const MODES = ['加碼', '調整', '新納入'], GROUPS = [...new Set(B.strats.map(s => s.group))];
    const HN = { 跟單出場: '跟單出場(ETF 減碼或剔除，隔天開盤賣)', '20日': '持有 20 日(收盤賣)', '5日': '持有 5 日(收盤賣)' };
    const hname = h => h === '跟單出場' ? '跟單出場' : '持有 ' + h.replace('日', ' 日');
    const SK = (m, g, h) => B.strats.find(s => s.mode === m && s.group === g && s.hold === h);
    const sub = T => B.b0050s[`${T.mode}｜${T.group}`];   // 和策略同一個期初的 0050(期初現金，隔天開盤買進)
    let mode = '加碼', group = '全部', hold = '跟單出場';
    el.innerHTML = `
      <div class="panel">
        <h3>A 系列 ETF 跟單 ${tagOf('active')}</h3>
        <div class="doc">
          <p><b>資料</b>：${B.etfs.length} 檔主動式 ETF(${B.etfs.map(e => `${e.code} ${esc(e.name)}`).join('、')})每天公布的持股，從各自上市日到 ${B.asof.replace(/-/g, '/')}。日期 D 的持股是 D 收盤後的部位，假設 D 收盤後就看得到。</p>
          <p><b>訊號</b>：同一檔 ETF 前後兩個揭露日比較。<b>加碼</b> = 權重上升(至少 0.01 個百分點)且股數增加；<b>調整</b> = 權重上升但股數沒有增加(多半是股價漲多)；<b>新納入</b> = 前一天沒有、這天有。上市後前 10 個揭露日是建倉期，不算訊號。</p>
          <p><b>進出場</b>：D+1 開盤買進。<b>跟單出場</b>：這檔 ETF 之後第一次減碼(股數減少)或剔除的揭露日 D'，D'+1 開盤賣出；同一天有多家 ETF 時，任何一家減碼就賣。另比較持有 5 日、20 日(收盤賣)。<b>同日 ≥ 2 家</b> = 同一天有 2 家以上 ETF 對同一檔股票做同樣的動作。</p>
          <p><b>資金分配</b>：本金 100 萬元，每檔上限 = 前一天收盤總資產 ÷ 平均一天持有檔數；有新股票進場的那天，所有部位調整到 min(上限, 1 ÷ 持有檔數)(先減碼、再進場、最後補足，都以整數股調整)；現金不夠時新股票平分剩下的現金；同一檔持有中不重複進場，沒用到的資金持有現金(不計利息)。</p>
        </div>
        <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:12px;">
          <div class="paramitem"><label for="efMode">模式</label><select id="efMode">${MODES.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="efGroup">範圍</label><select id="efGroup"></select></div>
          <div class="paramitem"><label for="efHold">出場</label><select id="efHold">${Object.keys(HN).map(h => `<option value="${h}">${esc(HN[h])}</option>`).join('')}</select></div>
          <div class="paramitem"><label for="efScale">走勢圖縱軸</label><select id="efScale"><option value="log">對數刻度(看報酬率)</option><option value="lin">一般刻度(看金額)</option></select></div>
        </div>
        <p class="note">${EF_COST}${EF_RULES}</p>
      </div>
      <div id="efView"></div>
      <div class="panel"><h3>所有策略比較</h3><div id="efAll"></div></div>
      <div class="panel">
        <h3>研究報告 ${tagOf('active')}</h3>
        <div class="doc">${md(B.report)}</div>
      </div>`;
    const extra = t => [
      t.fail ? W.card(`${t.fail.toLocaleString()} 筆`, '開盤漲停買不到', '放棄的訊號') : '',
      t.nocash ? W.card(`${t.nocash.toLocaleString()} 筆`, '買不起一股而放棄', `每檔上限為總資產的 ${(t.cap * 100).toFixed(1)}%`) : '',
      t.delist ? W.card(`${t.delist} 筆`, '持有期間下市櫃', '以最後收盤價轉現金') : '',
    ].join('');
    const yearHtml = (T, b) => `<div class="tablewrap"><table class="stattable us-year"><thead><tr><th>年度</th><th>策略</th><th>0050</th></tr></thead><tbody>
      ${W.yearTable(B.d, T.i0, T.nav, b).slice().reverse().map(r => `<tr><td>${r.label}</td>${W.heat(r.r, r.r > r.b)}${W.heat(r.b, false)}</tr>`).join('')}</tbody></table></div>
      <p class="note">紅色越深代表漲越多、綠色越深代表跌越多；粗體底線表示當年贏過 0050。</p>`;
    const allTable = cur => `<div class="tablewrap"><table class="stattable us-strat"><thead><tr><th>策略</th><th>期間</th><th>總報酬</th><th>年化報酬</th><th>夏普值</th><th>最大回撤</th><th>交易筆數 / 勝率</th><th>每筆平均 / 中位數</th><th>平均持倉天期</th><th>0050 總報酬 / 夏普值</th></tr></thead><tbody>
      ${B.strats.map(T => { const x = statsC(T.nav), Sx = statsC(sub(T)), t = T.ts;
        return `<tr class="${T === cur ? 'allrow' : ''}" data-k="${esc(T.key)}" style="cursor:pointer"><td>${esc(`${T.mode}｜${T.group}｜${hname(T.hold)}`)}</td><td>${B.d[T.i0 + 1].replace(/-/g, '/')} 起</td>
          <td class="${W.cls(x.mult - 1)} ${W.beat(x.mult, Sx.mult)}">${W.totalRet(x)}</td><td class="${W.cls(x.ret)} ${W.beat(x.ret, Sx.ret)}">${pct(x.ret)}</td>
          <td class="${W.beat(x.sharpe, Sx.sharpe)}">${x.sharpe.toFixed(2)}</td><td class="down ${W.beat(x.mdd, Sx.mdd)}">${pct(x.mdd, 1)}</td>
          <td>${t.n.toLocaleString()} 筆 / ${(t.win * 100).toFixed(0)}%</td><td class="${W.cls(t.mean)}">${pct(t.mean, 2)} / ${pct(t.median, 2)}</td><td>${t.days.toFixed(1)} 天</td>
          <td>${W.totalRet(Sx)} / ${Sx.sharpe.toFixed(2)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="note">粗體底線表示優於同期 0050；點選一列可切換到該策略。各策略從第一個訊號的前一天開始計算，所以期間略有不同。${EF_STAT}</p>`;
    const fillGroup = () => {
      const gs = GROUPS.filter(g => SK(mode, g, hold));
      if (!gs.includes(group)) group = gs[0];
      $('#efGroup').innerHTML = gs.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
      $('#efMode').value = mode; $('#efGroup').value = group; $('#efHold').value = hold;
    };
    function draw() {
      const T = SK(mode, group, hold), x = statsC(T.nav), b = sub(T), Sx = statsC(b), name = `${mode}｜${group}｜${hname(hold)}`;
      $('#efView').innerHTML = `
        <div class="panel">
          <h3>${esc(name)}</h3>
          <div class="statgrid" style="margin:12px 0;">${W.vs0050Cards(x, Sx)}${W.tradeCards(T.ts)}${extra(T.ts)}</div>
          <p class="note">${EF_STAT}每筆報酬 = 賣出收回金額 ÷ 買進投入金額 − 1(扣成本)；持倉天期以交易日計。</p>
          <ul class="insight"><li>${W.vs0050Txt(B.d[T.i0 + 1], B.asof, x, Sx)}。</li></ul>
          <h4>累積報酬與回撤：${esc(name)} vs 0050</h4>
          <div id="efChart"></div><div id="efLegend"></div>
          <h4>每日持有檔數</h4><div id="efPos"></div>
          <h4>每年報酬</h4>
          ${yearHtml(T, b)}
        </div>`;
      W.navCharts({ d: B.d, i0: T.i0, navs: { s: T.nav, b0050: b }, meta: { s: { name, color: MC[mode] }, b0050: { name: '0050 買進持有', color: 'var(--blue)' } },
        main: 's', log: $('#efScale').value === 'log', chart: $('#efChart'), legend: $('#efLegend'), xFmt: (v, tip) => tip ? v : v.slice(0, 7).replace('-', '/') });
      LTChart.line($('#efPos'), { x: B.d.slice(T.i0), xType: 'date', label: '持有檔數', height: 150, xFmt: (d, tip) => tip ? d : d.slice(0, 7).replace('-', '/'), yMin: 0,
        yFmt: v => v.toFixed(0), tipFmt: (s, v) => `${v} 檔`, series: [{ name: '持有檔數', color: MC[mode], width: 1.2, y: T.npos }] });
      $('#efAll').innerHTML = allTable(T);
    }
    $('#efMode').onchange = () => { mode = $('#efMode').value; fillGroup(); draw(); };
    $('#efGroup').onchange = () => { group = $('#efGroup').value; draw(); };
    $('#efHold').onchange = () => { hold = $('#efHold').value; fillGroup(); draw(); };
    $('#efScale').onchange = draw;
    $('#efAll').onclick = e => { const r = e.target.closest('tr[data-k]'); if (!r) return; [mode, group, hold] = r.dataset.k.split('｜'); fillGroup(); draw(); $('#efView').scrollIntoView({ behavior: 'smooth' }); };
    fillGroup(); draw();

    /* 報告裡的圖：依 JSON 重畫；長條實心 = |t| ≥ 2，淡色 = 不顯著 */
    const sigBars = (div, xs, series, height = 220) => LTChart.bars(div, { x: xs, xAll: true, xFmt: v => v, label: '每筆平均超額報酬', height, refY: [{ y: 0 }],
      yFmt: v => (v * 100).toFixed(1) + '%', tipFmt: (s, v, i) => `${pct(v, 2)}(t = ${Number.isFinite(s.t[i]) ? s.t[i].toFixed(1) : '—'})`,
      series: series.map(s => ({ name: s.name, y: s.v, t: s.t, color: s.color, colors: s.v.map((_, i) => Math.abs(s.t[i]) >= 2 ? s.color : fade(s.color)) })) });
    // 一張圖可以有上下幾個子圖：parts = [{ title, x, series }]，圖例放最後
    const figBars = (div, parts) => {
      div.innerHTML = parts.map((p, i) => `${p.title ? `<p class="note" style="text-align:left;margin:10px 0 2px;"><b>${esc(p.title)}</b></p>` : ''}<div data-part="${i}"></div>`).join('');
      parts.forEach((p, i) => sigBars(div.querySelector(`[data-part="${i}"]`), p.x, p.series));
      div.insertAdjacentHTML('beforeend', LTChart.legend(parts[0].series) + '<p class="note">實心 = |t| ≥ 2，淡色 = 不顯著；t 值為日期聚類，滑鼠移到長條上可看數字。</p>');
    };
    const pick = (rows, f, keys, val = 'mean', tv = 't') => keys.map(k => { const r = rows.find(x => f(x, k)); return r && r.n !== undefined && r.n < 20 ? { v: null, t: null } : r ? { v: r[val], t: r[tv] } : { v: null, t: null }; });
    const ser = (name, color, pts) => ({ name, color, v: pts.map(p => p.v), t: pts.map(p => p.t) });
    const HOLDS = ['1日', '5日', '10日', '20日', '跟單出場'], HX = ['1 日', '5 日', '10 日', '20 日', '跟單出場'];
    const KS = ['1 家', '2 家', '3 家以上'];
    const ETFS = B.etfs.map(e => e.code);
    const ENT = [...new Set(B.entry.map(r => r.entry))];
    const navFull = T => Array(T.i0).fill(1).concat(T.nav);   // 開始前持有現金
    const LOG_TICKS = [0.5, 1, 1.5, 2, 2.5, 3].map(v => Math.log10(v));
    const figs = {
      'holding.png': div => figBars(div, [{ x: HX, series: MODES.map(m => ser(m, MC[m], pick(B.holding, (r, h) => r.mode === m && r.hold === h, HOLDS))) }]),
      'consensus.png': div => figBars(div, ['跟單出場', '20日'].map(h => ({ title: hname(h), x: KS,
        series: MODES.map(m => ser(m, MC[m], pick(B.consensus, (r, k) => r.by === '同一天' && r.mode === m && r.k === k && r.hold === h, KS)))}))),
      'by_etf.png': div => figBars(div, ['跟單出場', '20日'].map(h => ({ title: hname(h), x: [...ETFS, '全部'],
        series: MODES.map(m => ser(m, MC[m], [...pick(B.by_etf, (r, e) => r.etf === e && r.mode === m && r.hold === h, ETFS), ...pick(B.holding, (r, k) => r.mode === m && r.hold === k, [h])]))}))),
      'extra_entry.png': div => figBars(div, [['mean', 't', '跟單出場'], ['mean20', 't20', '持有 20 日']].map(([v, t, title]) => ({ title, x: ENT,
        series: MODES.map(m => ser(m, MC[m], pick(B.entry, (r, k) => r.group === `${m}｜全部` && r.entry === k, ENT, v, t)))}))),
      'extra_flow.png': div => figBars(div, ['淨股數變化', '權重增加'].map(by => { const R = B.flow.filter(r => r.by === by && r.mode === '加碼'), xs = R.map(r => r.bin);
        return { title: by === '淨股數變化' ? '加碼：扣掉申贖後的淨股數變化' : '加碼：權重增加(百分點)', x: xs,
          series: [ser('跟單出場', MC.加碼, pick(R, (r, k) => r.bin === k, xs)), ser('持有 20 日', 'var(--blue)', pick(R, (r, k) => r.bin === k, xs, 'mean20', 't20'))] }; })),
      'extra_ex81.png': div => figBars(div, [['mean', 't', '跟單出場'], ['mean20', 't20', '持有 20 日']].map(([v, t, title]) => ({ title, x: MODES,
        series: [['全部 10 檔', 'var(--amber)'], ['拿掉 00981A', 'var(--blue)'], ['只有 00981A', '#B07CF0']].map(([sc, c]) =>
          ser(sc, c, pick(B.ex81, (r, m) => r.scope === sc && r.mode === m && r.k === '全部', MODES, v, t))) }))),
      'extra_consensus_exit.png': div => { const xs = ['加碼｜同日 2 家', '加碼｜同日 ≥ 3 家', '調整｜同日 2 家', '調整｜同日 ≥ 3 家'];
        figBars(div, [{ x: xs, series: [['任何一家減碼就賣', 'var(--amber)'], ['各家分別跟（平均）', 'var(--blue)'], ['全部都減碼才賣', '#B07CF0']].map(([rl, c]) =>
          ser(rl.replace('（', '(').replace('）', ')'), c, pick(B.cexit, (r, k) => `${r.mode}｜${r.k}` === k && r.rule === rl, xs))) }]); },
      'cum_return.png': div => {
        const L = [['加碼｜全部｜跟單出場', 'var(--amber)', 2.4], ['加碼｜全部｜20日', '#F06FB0'], ['加碼｜同日 ≥ 2 家｜20日', '#B07CF0'], ['調整｜全部｜20日', '#5fd0c5'],
          ['加碼｜拿掉 00981A｜跟單出場', '#94a3b8']].map(([k, color, width]) => { const T = B.strats.find(s => s.key === k); return T && { name: `${T.mode}｜${T.group}｜${hname(T.hold)}`, nav: navFull(T), color, width }; }).filter(Boolean);
        L.push({ name: '0050 買進持有', nav: B.b0050, color: 'var(--blue)', width: 2 });
        LTChart.line(div, { x: B.d, xType: 'date', label: '累積報酬', height: 300, xFmt: (v, tip) => tip ? v : v.slice(0, 7).replace('-', '/'),
          yFmt: v => pct(10 ** v - 1, 0), tipFmt: (s, v) => pct(10 ** v - 1, 1), yTicks: () => LOG_TICKS, refY: [{ y: 0 }],
          series: L.map(l => ({ name: l.name, color: l.color, width: l.width || 1.6, y: l.nav.map(v => Math.log10(v)) })) });
        div.insertAdjacentHTML('afterend', LTChart.legend(L));
      },
    };
    el.querySelectorAll('.twr-fig [data-fig]').forEach(div => { const f = figs[div.dataset.fig]; if (f) f(div); else div.parentElement.remove(); });
  }

  LT.register({
    section: 'etf', key: 'pack', name: 'ETF大禮包',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入資料…</p></div></div>`;
      let C = null, E = null, loadErr = '';
      try {
        [C, E] = await Promise.all([LT.loadJSON('etf_compare', 'compare.json').then(r => r.data), LT.loadJSON('etf_compare', 'etfs.json').then(r => r.data)]);
        // 長期回測用：加權報酬指數(含股息，2003 起)、加權指數(不含股息，1999 起)；沒有時只能選 ETF
        await Promise.all([['taiex', 'TAIEX.json'], ['taiex_tr', 'TAIEX_TR.json']].map(([k, f]) => LT.loadJSON('indices', f).then(r => { E[k] = r.data; }).catch(() => {})));
      } catch (err) { loadErr = err.message; }
      if (!ctx.alive()) return;
      const failed = `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(loadErr)}</p></div></div>`;
      const twList = E ? E.list.filter(x => x.currency === 'TWD') : [];
      el.innerHTML = `
        <header class="top"><div>
          <h1>ETF大禮包</h1>
          <p>從認識 ETF 到怎麼存 ETF：種類、成本、折溢價，以及存股的績效比較與投入方式</p>
        </div></header>
        <div class="mode-tabs pk-tabs">
          <button class="mode-tab active" data-tab="intro"><b>ETF介紹</b><small>是什麼、種類、成本、配息、折溢價</small></button>
          <button class="mode-tab" data-tab="save"><b>怎麼存ETF</b><small>常存 ETF 比較、配息怎麼繳稅、0050 vs 勞退</small></button>
          <button class="mode-tab" data-tab="research"><b>ETF研究</b><small>投資方式、主動式 ETF 跟單</small></button>
        </div>

        <div class="pk-pane" data-pane="intro">
          <div class="panel doc">
            <h3>什麼是 ETF</h3>
            <p><b>ETF</b>(Exchange Traded Fund，指數股票型基金)是把一籃子股票或債券包成一檔基金，在證券交易所掛牌，可以像股票一樣隨時買賣。</p>
            <ul>
              <li><b>分散風險</b>：一次買進很多檔股票，單一公司出問題的影響較小。</li>
              <li><b>成本低</b>：被動追蹤指數，管理費通常比主動型基金低；交易稅也比個股低(下方說明)。</li>
              <li><b>透明</b>：持股與淨值每天公布，盤中也有預估淨值。</li>
              <li><b>門檻低</b>：可以零股或定期定額買進，小額也能開始。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>ETF 的種類與分類</h3>
            <div class="doc">
              <p>台股 ETF 可以從三個角度分類：<b>管理方式</b>(被動或主動)、<b>投資標的</b>(股票、債券、期貨、槓桿反向、股債平衡)、<b>成分證券在國內或國外</b>。證券代號的第六碼(尾碼)就能看出前兩項；股票型再依指數的選股規則分成市值型、高股息、主題／產業等：</p>
            </div>
            <div class="tablewrap"><table class="stattable pk-kind">
              <thead><tr><th>管理方式</th><th>類型</th><th>代號尾碼(台幣 / 外幣)</th><th>例子</th><th>特色與要注意</th></tr></thead>
              <tbody>
                <tr><td rowspan="8" class="pk-mgmt">被動式<br><small class="mute">追蹤指數</small></td><td class="pk-type">股票型｜市值型</td><td>全數字 / K</td><td class="pk-ex">0050、006208</td><td class="pk-note">依市值挑選大型股，跟著大盤走，最適合長期持有、定期定額；台股權值集中在少數大型股(如台積電)，產業集中度高</td></tr>
                <tr><td class="pk-type">股票型｜高股息</td><td>全數字</td><td class="pk-ex">0056、00878、00713、00919、00929、00918、00939、00940</td><td class="pk-note">挑選殖利率高的股票，配息較多、部分月配或季配；配息不等於多賺(見下方「配息與總報酬」)，選股規則、換股頻率各檔差異大</td></tr>
                <tr><td class="pk-type">股票型｜主題、產業、因子</td><td>全數字 / K</td><td class="pk-ex">半導體、AI、ESG、低波動；00625K(國外成分)</td><td class="pk-note">集中投資某個產業、題材或因子；題材熱門時容易追高，產業集中、波動大(見「怎麼存ETF」的 ARKK 研究)</td></tr>
                <tr><td class="pk-type">債券型</td><td>B / C</td><td class="pk-ex">00679B；00687C</td><td class="pk-note">價格波動通常比股票小，與股市的相關性較低，可用來平衡資產；利率上升時債券價格下跌，長天期債券波動並不小。交易稅目前為 0(見下方「持有 ETF 的成本」)</td></tr>
                <tr><td class="pk-type">槓桿型</td><td>L</td><td class="pk-ex">00631L(台灣50正2)</td><td class="pk-note" rowspan="2">追蹤指數單日漲跌的 2 倍或反向，適合短線操作；每日重新平衡，長期持有的報酬不等於指數的 2 倍或 −1 倍，盤整時會耗損</td></tr>
                <tr><td class="pk-type">反向型</td><td>R</td><td class="pk-ex">00632R(台灣50反1)</td></tr>
                <tr><td class="pk-type">期貨型</td><td>U</td><td class="pk-ex">00635U</td><td class="pk-note">用期貨追蹤商品或指數；有轉倉成本，期貨價格與現貨會有價差</td></tr>
                <tr><td class="pk-type">平衡型(股債多資產)</td><td>T</td><td class="pk-ex">00980T</td><td class="pk-note">同時持有股票、債券等多種資產</td></tr>
                <tr><td rowspan="2" class="pk-mgmt">主動式<br><small class="mute">經理人選股</small></td><td class="pk-type">股票型</td><td>A</td><td class="pk-ex">00981A</td><td class="pk-note" rowspan="2">經理人主動選股或選債、目標是打敗指數；費用通常較高，持股會揭露但可能隨時調整(見「ETF研究」的主動式 ETF 跟單)</td></tr>
                <tr><td class="pk-type">債券型</td><td>D</td><td class="pk-ex">00980D</td></tr>
              </tbody>
            </table></div>
            <div class="doc" style="margin-top:12px;">
              <ul>
                <li><b>被動式 vs 主動式</b>：被動式 ETF 依指數規則持股，費用較低；主動式 ETF 由經理人選股、目標是打敗指數，費用通常較高。</li>
                <li><b>國內成分 vs 國外成分</b>：尾碼看不出來，要看追蹤的指數或投資範圍。國外成分 ETF(例如美國股票、美國公債)多了<b>匯率風險</b>與時差，淨值以國外收盤計算，台股盤中的價格比較容易出現折溢價。</li>
                <li><b>風險由低到高</b>(證交所投資人教育的排列)：一般台股 ETF → 海外股債 ETF(跨市場、匯率) → 期貨 ETF(期現貨價差、轉倉風險) → 槓桿/反向 ETF(長期報酬偏離倍數，限制較多)。期貨與槓反 ETF 屬於需要簽署風險預告書的商品。</li>
              </ul>
            </div>
          </div>
          <div class="panel doc">
            <h3>被動型 ETF 怎麼追蹤指數</h3>
            <p>被動型 ETF 的目標是讓報酬盡量貼近指數，常見的做法有三種：</p>
            <div class="tablewrap"><table class="stattable pk-kind">
              <thead><tr><th>方法</th><th>做法</th><th>適用</th><th>優缺點</th></tr></thead>
              <tbody>
                <tr><td>完全複製法</td><td style="text-align:left">依指數權重買進<b>全部</b>成分股</td><td style="text-align:left">成分股少、流動性好的指數，例如 0050 追蹤的臺灣 50 指數</td><td style="text-align:left">追蹤誤差最小、最透明；成分股很多或流動性差時成本高</td></tr>
                <tr><td>抽樣(最佳化)複製法</td><td style="text-align:left">只買具代表性的<b>部分</b>成分，讓產業、市值、存續期間等特徵與指數相近</td><td style="text-align:left">成分數量很多的指數，例如全球股票、債券指數</td><td style="text-align:left">交易成本較低；與指數的差距較大</td></tr>
                <tr><td>合成複製法</td><td style="text-align:left">用<b>期貨</b>或交換契約取得指數報酬，不直接持有成分</td><td style="text-align:left">期貨 ETF(商品、指數期貨)、槓桿與反向 ETF</td><td style="text-align:left">可以做到槓桿、反向或投資商品；有期貨轉倉成本、交易對手風險，期貨價格與現貨會有價差</td></tr>
              </tbody>
            </table></div>
            <ul>
              <li><b>指數怎麼決定權重</b>：市值加權(最常見，大公司權重高，例如臺灣 50 指數)、等權重、股利率加權(高股息指數常用)、因子或規則加權(低波動、品質)，並常設單一成分股的權重上限。ETF 的特性其實是由它追蹤的<b>指數規則</b>決定的。</li>
              <li><b>定期調整</b>：指數會定期審核成分股(例如每季或每半年)，ETF 跟著換股；換股頻率越高、週轉率越大，交易成本越高。</li>
              <li><b>追蹤誤差與追蹤差距</b>：追蹤差距是一段期間 ETF 報酬與指數報酬的差(主要來自費用)；追蹤誤差是兩者每日報酬差異的標準差(衡量貼得穩不穩)。</li>
              <li><b>實物申購買回</b>：參與券商可以用一籃子成分股向投信換 ETF，或反過來，市價偏離淨值時就有套利空間，所以大型 ETF 的折溢價通常很小。</li>
            </ul>
          </div>
          <div class="panel doc">
            <h3>持有 ETF 的成本</h3>
            <ul>
              <li><b>內扣費用</b>：經理費、保管費等直接從基金資產扣除，反映在淨值裡，不會另外收費。費用率每年差 0.3%，存 20 年後的差距就很明顯，同樣追蹤臺灣 50 指數的 0050 與 006208 就常被拿來比較費用。</li>
              <li><b>交易成本</b>：買賣時的券商手續費(上限 0.1425%，通常有折扣)；賣出時的證券交易稅，股票型 ETF 為 0.1%，比個股的 0.3% 低。<b>債券型 ETF</b>(被動式，尾碼 B、C)目前停徵證券交易稅，交易稅為 0；但<b>主動式債券 ETF</b>(尾碼 D)不適用停徵，賣出時仍要繳 0.1%。</li>
              <li><b>追蹤誤差</b>：ETF 的報酬與指數的差距，來自費用、現金部位、換股時點等，越小越好。</li>
            </ul>
          </div>
          <div class="panel doc">
            <h3>配息與總報酬</h3>
            <p>ETF 配息時，<b>淨值會同時扣掉配出去的金額</b>(除息)，所以配息本身不是額外賺到的錢，而是把基金裡的錢拿一部分給你。真正的報酬要看<b>總報酬</b>(股價漲跌 + 配息)：</p>
            <div class="formula">總報酬 ＝ 價格報酬 ＋ 配息報酬　　(配息再投入時，用「還原股價」計算)</div>
            <ul>
              <li><b>填息</b>：除息後股價漲回除息前的價格。沒有填息時，拿到的配息被股價下跌抵銷。</li>
              <li>配息在台灣可能要繳二代健保補充保費與所得稅；長期累積資產時，把配息再投入才能發揮複利。</li>
              <li>比較 ETF 績效時，一定要用總報酬比較，只看股價會低估高股息 ETF，只看殖利率則會忽略股價下跌。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>ETF 折溢價</h3>
            ${PREMIUM_REFS.map(r => `<a class="linkcard" href="${r.url}" target="_blank" rel="noopener">
              <div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${esc(r.url)}</small></div><span class="go">前往 ↗</span></a>`).join('')}
            <div class="doc" style="margin-top:12px;">
              <p>ETF 在交易所買賣的價格(市價)由買賣雙方決定，不一定等於它實際持有資產的價值(淨值)。兩者的差距就是折溢價：</p>
              <div class="formula">折溢價率 ＝ (市價 − 淨值) ÷ 淨值</div>
              <ul>
                <li><b>溢價(正值)</b>：市價高於淨值，買進等於用比實際價值更貴的價格買。熱門 ETF 搶購時容易出現。</li>
                <li><b>折價(負值)</b>：市價低於淨值，賣出等於用比實際價值更便宜的價格賣。市場恐慌或流動性差時容易出現。</li>
              </ul>
              <p>盤中看的是「預估淨值」，由投信依成分股即時報價推算。折溢價過大時，日後價格可能向淨值靠攏，追高溢價的 ETF 要特別留意這個風險。</p>
            </div>
          </div>
        </div>

        <div class="pk-pane" data-pane="save" hidden>${C && E ? `
          <div class="panel">
            <h3>一、常存的 ETF 績效比較</h3>
            <div class="pk-picks" id="pkPicks">${twList.map(x => `<label><input type="checkbox" value="${x.code}" checked> <b>${x.code}</b> ${esc(x.name)}<small>${x.kind}</small></label>`).join('')}</div>
            <p class="note" id="pkCommonNote" style="margin-top:6px;"></p>
            <div id="pkEtfChart"></div>
            <div id="pkEtfLegend"></div>
            <div class="tablewrap" style="margin-top:10px;"><table class="stattable" id="pkEtfTable"></table></div>
            <p class="note">共同期間：從勾選的 ETF 中最晚上市的那一檔開始比較，期間越短越容易受單一年度行情影響，可以取消勾選上市較晚的 ETF 拉長比較期間。<b>配息貢獻</b> = 年化總報酬 − 年化價格報酬。收盤價不含沒有成交的日子；總報酬用臺灣證券交易所的除息資料自行計算(股利在除息日以收盤價再投入)。</p>
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

        <div class="pk-pane" data-pane="research" hidden>
          <div class="panel">
            <div class="mode-tabs er-cat">${RCATS.map(c => `<button class="mode-tab" data-c="${c.key}"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></button>`).join('')}</div>
            <div class="paramgrid opt-form er-pick" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end;">
              <div class="paramitem"><label for="erStudy">研究</label><select id="erStudy"></select></div>
              <p class="note" id="erDesc" style="margin:0 0 8px;"></p>
            </div>
          </div>
          <div id="erBody"></div>
        </div>`;

      const showTab = t => {
        el.querySelectorAll('.pk-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        el.querySelectorAll('.pk-pane').forEach(p => { p.hidden = p.dataset.pane !== t; });
        try { localStorage.setItem('lt.pkTab', t); } catch (e) {}
      };
      el.querySelector('.pk-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
      let saved = 'intro'; try { saved = localStorage.getItem('lt.pkTab') || 'intro'; } catch (e) {}
      const link = (location.hash.split('/')[3] || '').trim();   // 網址 #/etf/pack/<研究> 直接開啟 ETF研究的該研究
      const linked = RCATS.some(c => c.studies.some(x => x.key === link));
      showTab(linked ? 'research' : ['save', 'research'].includes(saved) ? saved : 'intro');
      if (!C || !E) { initResearch(); return; }
      const $ = s => el.querySelector(s);

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
      const COLORS = ['var(--amber)', 'var(--blue)', 'var(--up)', 'var(--down)', 'var(--ma20)', 'var(--ma120)', 'var(--ma240)'];
      const colorOf = code => COLORS[twList.findIndex(x => x.code === code) % COLORS.length];
      const MO = {}; E.list.forEach(x => { MO[x.code] = monthly(E.daily[x.code]); });
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

      /* ---------- ETF研究：最上方選主題，再用下拉式選單選研究(同台股其他研究) ---------- */
      function arkkView(body) {
        if (!C || !E) { body.innerHTML = failed; return; }
        body.innerHTML = `
          <div class="panel">
            <h3>ARKK 研究：基金賺錢，投資人卻賠錢 ${tagOf('how')}</h3>
            <div id="pkArkkChart"></div>
            <p class="note" id="pkArkkNote"></p>
            <div class="doc">
              <p>ARK Innovation ETF(ARKK)是美國最知名的主題型 ETF，2020 年大漲後吸引大量資金湧入，接著在 2021～2022 年大幅下跌。晨星(Morningstar)分析師 Amy C. Arnott 的研究比較了<b>基金報酬</b>(時間加權，假設一開始投入一直持有)與<b>投資人報酬</b>(金額加權，考慮資金何時進出)：</p>
              <div class="tablewrap"><table class="stattable">
                <thead><tr><th>研究</th><th>期間</th><th>基金報酬</th><th>投資人報酬</th></tr></thead>
                <tbody>
                  <tr><td>Morningstar(2021-12-21)</td><td>截至 2021-11 的 5 年(年化)</td><td class="up">+41.3%</td><td class="up">+9.9%</td></tr>
                  <tr><td>Morningstar(2021-12-21)</td><td>截至 2021-11 的 1 年</td><td class="down">−4.3%</td><td class="down">約 −12%</td></tr>
                </tbody>
              </table></div>
              <ul>
                <li><b>為什麼差這麼多</b>：大部分資金是在大漲之後、接近高點時才買進，緊接著遇到大跌；早期少數人賺到的大漲，多數投資人並沒有參與到。</li>
                <li><b>財富毀損</b>：晨星另一份研究(截至 2023 年的 10 年)估計，ARKK 讓投資人損失約 71 億美元，名列「毀損最多投資人財富的基金」第 3 名；ARK 旗下基金合計約 143 億美元，是損失最多的基金公司。</li>
                <li><b>研究給的教訓</b>：三位數的報酬不會持續、要先了解風險、<b>考慮定期定額</b>——分批投入可以避免一次在高點投入大筆資金。</li>
              </ul>
            </div>
          </div>
`;
        const ak = MO.ARKK;
        if (ak) {
          const peakI = ak.a.reduce((b, v, i) => v > ak.a[b] ? i : b, 0), last = ak.a.length - 1;
          LTChart.line($('#pkArkkChart'), { x: ak.m, xType: 'date', label: 'ARKK 還原股價', height: 240, xFmt: (m, tip) => tip ? ym(m) : m.slice(2).replace('-', '/'),
            yFmt: v => '$' + Math.round(v), tipFmt: (s, v) => '$' + v.toFixed(2), series: [{ name: 'ARKK', y: ak.a, color: 'var(--amber)' }],
            points: [{ x: ak.m[peakI], y: ak.a[peakI], color: 'var(--up)', label: `高點 ${ym(ak.m[peakI])}` }] });
          const sAll = statsOf(ak.a.slice(1).map((v, k) => v / ak.a[k] - 1), 12);
          $('#pkArkkNote').innerHTML = `ARKK 還原股價(美元，月底)：上市以來年化 ${pctf(sAll.cagr)}；${ym(ak.m[peakI])} 的高點到 ${ym(ak.m[last])}，${pctf(ak.a[last] / ak.a[peakI] - 1, 0)}；期間最大回撤 ${pctf(sAll.mdd, 0)}。`;
        }
      }
      function lsiView(body) {
        if (!C || !E) { body.innerHTML = failed; return; }
        body.innerHTML = `
          <div class="panel">
            <h3>單筆投入、定期定額、逢低買入(LSI vs DCA vs BTD) ${tagOf('how')}</h3>
            <div class="doc">
              <ul>
                <li><b>單筆投入</b>(Lump Sum Investing，LSI)：手上有一筆錢，一次全部投入。</li>
                <li><b>定期定額</b>(Dollar-Cost Averaging，DCA)：把同一筆錢分成幾份(例如 12 個月)分批投入，沒投入的錢先放現金。</li>
                <li><b>逢低買入</b>(Buy the Dip，BTD)：拿著現金等市場從高點下跌一定幅度(例如 10%、20%)再一次投入，帶有擇時的意味。</li>
              </ul>
              <p>注意：這裡比較的是「<b>已經有一筆錢</b>，要怎麼進場」；每個月薪水入帳就投入的定期定額，其實是有錢就馬上投入，等同單筆投入。</p>
            </div>
            <h4>研究怎麼說</h4>
            <div class="doc">
              <p>PWL Capital 的 Ben Felix(2020)用 6 個國家的股市，比較每個月起點的<b>滾動 10 年</b>結果：定期定額分 12 個月投入、等待中的現金賺一個月國庫券利息。</p>
            </div>
            <div class="tablewrap"><table class="stattable">
              <thead><tr><th>市場</th><th>美國</th><th>英國</th><th>加拿大</th><th>德國</th><th>澳洲</th><th>日本</th><th>六國平均</th></tr></thead>
              <tbody><tr><td>單筆贏過定期定額的比例</td><td>70.59%</td><td>68.18%</td><td>66.10%</td><td>64.95%</td><td>61.86%</td><td>57.53%</td><td><b>64.89%</b></td></tr></tbody>
            </table></div>
            <div class="doc" style="margin-top:10px;">
              <ul>
                <li><b>單筆約 2/3 的時間贏過定期定額</b>，年化報酬平均多 0.38%。Vanguard(2012)在美國、英國、澳洲的研究也得到約 2/3 的結果。</li>
                <li><b>為什麼</b>：股市長期的預期報酬(風險溢酬)為正，大部分月份是上漲的，錢越晚進場，錯過的報酬越多；定期定額等於前幾個月有一部分資金沒有參與市場。</li>
                <li><b>熊市、股市高檔時也一樣</b>：研究也檢驗了熊市與席勒本益比(CAPE)處於高檔的時期，單筆的勝率仍然較高——大跌後的反彈常常比下跌更猛，創新高之後也傾向繼續上漲，分批進場不一定能攤平成本。</li>
                <li><b>逢低買入</b>：Felix 與 Warwick(2021)以總報酬指數下跌 10%、20% 為進場訊號比較，逢低買入的平均年化報酬明顯落後單筆投入，門檻越深落後越多；它確實改善了最差的情況，但那是因為平均持有大量現金(風險較低)換來的。</li>
                <li><b>行為面</b>：很多人仍偏好定期定額，因為「行動後虧損」的後悔比「沒行動錯過」更痛苦，分批投入可以降低心理壓力。研究的建議是：如果怕一次投入的波動，代表目前的股票比重太高，與其分批進場，不如<b>選一個承受得了的資產配置(例如股債比例)後一次投入</b>——分批進場投完後，承擔的風險還是一樣。</li>
              </ul>
            </div>
            <h4>用台股自己驗證</h4>
            <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
              <div class="paramitem"><label for="rsSeries">標的</label><select id="rsSeries">${E && E.taiex_tr ? '<option value="taiex_tr">加權報酬指數(2003 起，含股息)</option>' : ''}${E && E.taiex ? '<option value="taiex">加權指數(1999 起，不含股息)</option>' : ''}${twList.map(x => `<option value="${x.code}" ${x.code === '0050' && !(E && (E.taiex || E.taiex_tr)) ? 'selected' : ''}>${x.code} ${esc(x.name)}(含股息)</option>`).join('')}</select></div>
              <div class="paramitem"><label for="rsH">持有期間</label><select id="rsH"><option value="5">5 年</option><option value="10" selected>10 年</option><option value="20">20 年</option><option value="0">至今(持有到最新)</option></select></div>
              <div class="paramitem"><label for="rsN">定期定額分幾個月</label><select id="rsN"><option value="6">6 個月</option><option value="12" selected>12 個月</option><option value="24">24 個月</option></select></div>
              <div class="paramitem"><label for="rsCash">現金年利率(%)</label><input id="rsCash" type="number" min="0" max="10" step="0.1" value="1.5"></div>
            </div>
            <div class="statgrid" id="rsStats" style="margin:14px 0;"></div>
            <div class="tablewrap"><table class="stattable" id="rsTable"></table></div>
            <h4>每個起點的年化報酬差(單筆 − 定期定額)</h4>
            <div id="rsHist"></div>
            <h4>依起點月份的年化報酬</h4>
            <div id="rsLine"></div>
            ${LTChart.legend([{ name: '單筆投入', color: 'var(--amber)' }, { name: '定期定額', color: 'var(--blue)' }, { name: '逢低買入(跌 10%)', color: 'var(--up)' }, { name: '逢低買入(跌 20%)', color: 'var(--down)' }])}
            <ul class="insight" id="rsInsight"></ul>
            <p class="note">以月底資料計算：每個月都當成一個起點，比較持有到期間結束的年化報酬(滾動期間)；選「至今」時每個起點都持有到最新一個完整月份，越晚的起點持有越短(至少 3 年)，年化報酬的波動也越大。定期定額每月投入 1/N；逢低買入在指數從歷史高點(資料起點以來)下跌達門檻的那個月一次投入，起點時已經跌超過門檻就立刻進場(和單筆相同，不計輸贏)，期間內沒跌到門檻就一直拿著現金；等待中的現金依設定的年利率計息。加權指數為價格指數(不含股息)；加權報酬指數(臺灣證券交易所編製)與 ETF 為股息再投入的總報酬，不計手續費與稅。</p>
          </div>`;
        const seriesOf = key => {
          if (key === 'taiex' || key === 'taiex_tr') {   // 加權指數 / 報酬指數：日資料 → 月底
            const tx = E[key], mo = monthly({ d: tx.d, c: tx.c, a: tx.c });
            return { m: mo.m, v: mo.a };
          }
          const mo = MO[key]; return { m: mo.m, v: mo.a };
        };
        const drawRolling = () => {
          const S = seriesOf($('#rsSeries').value), H = +$('#rsH').value, N = +$('#rsN').value, cash = Math.max(0, +$('#rsCash').value || 0) / 100;
          // 最後一個月可能還沒結束，只用完整月份
          const full = S.m[S.m.length - 1] === new Date().toISOString().slice(0, 7) ? S.m.length - 1 : S.m.length;
          const P = S.v.slice(0, full), M = S.m.slice(0, full);
          const R = rollingStudy(P, H, N, [0.10, 0.20], cash);
          if (R.length < 12) { $('#rsStats').innerHTML = `<p class="mute">資料不足：持有 ${H} 年需要比 ${H} 年多至少一年的資料，請改選較短的持有期間或歷史較長的標的。</p>`; $('#rsTable').innerHTML = ''; $('#rsHist').innerHTML = ''; $('#rsLine').innerHTML = ''; $('#rsInsight').innerHTML = ''; return; }
          const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
          const strat = [['lsi', '單筆投入', x => x.lsi], ['dca', `定期定額(${N} 個月)`, x => x.dca], ['b10', '逢低買入(跌 10%)', x => x.btd[0]], ['b20', '逢低買入(跌 20%)', x => x.btd[1]]];
          const diff = f => R.map(x => x.lsi - f(x));
          const EPS = 1e-9;   // 兩者相同(例如起點就已經跌超過門檻，逢低買入立刻進場)不算輸贏
          const tally = f => { const w = R.filter(x => x.lsi - f(x) > EPS).length, l = R.filter(x => f(x) - x.lsi > EPS).length; return { w, l, tie: R.length - w - l }; };
          const win = f => { const t = tally(f); return t.w + t.l ? t.w / (t.w + t.l) : NaN; };
          const tieTxt = f => { const t = tally(f); return t.tie ? `(另有 ${(t.tie / R.length * 100).toFixed(0)}% 結果相同)` : ''; };
          $('#rsStats').innerHTML = `<div class="stat"><div class="v" style="font-size:16px;">${ym(M[R[0].t])}～${ym(M[R[R.length - 1].t])}</div><div class="l">${R.length} 個起點 · ${H ? `每個持有 ${H} 年` : `都持有到 ${ym(M[M.length - 1])}(${(MIN_NOW / 12).toFixed(0)}～${((M.length - 1 - R[0].t) / 12).toFixed(0)} 年)`}</div></div>` +
            strat.slice(1).map(([k, n, f]) => `<div class="stat"><div class="v">${Number.isFinite(win(f)) ? (win(f) * 100).toFixed(0) + '%' : '—'}</div><div class="l">單筆贏過${n}的比例${tieTxt(f)} · 年化平均多 ${pctf(mean(diff(f)), 2)}</div></div>`).join('');
          $('#rsTable').innerHTML = `<thead><tr><th>策略</th><th>平均年化</th><th>中位數</th><th>最差 10%(10th)</th><th>最好 10%(90th)</th><th>最差</th></tr></thead><tbody>
            ${strat.map(([k, n, f]) => { const v = R.map(f); return `<tr><td>${n}</td><td class="${cls(mean(v))}">${pctf(mean(v), 2)}</td><td>${pctf(pctl(v, 0.5), 2)}</td><td>${pctf(pctl(v, 0.1), 2)}</td><td>${pctf(pctl(v, 0.9), 2)}</td><td class="down">${pctf(Math.min(...v), 2)}</td></tr>`; }).join('')}</tbody>`;
          // 年化報酬差的分布
          const d = diff(x => x.dca), lo = Math.floor(Math.min(...d) * 200) / 200, hi = Math.ceil(Math.max(...d) * 200) / 200, step = Math.max(0.0025, (hi - lo) / 30);
          const bins = []; for (let x = lo; x < hi + 1e-9; x += step) bins.push({ x, n: 0 });
          d.forEach(v => { const i = Math.min(bins.length - 1, Math.floor((v - lo) / step)); bins[i].n++; });
          LTChart.bars($('#rsHist'), { x: bins.map(b => b.x + step / 2), label: '年化報酬差分布', height: 200, xFmt: v => (v * 100).toFixed(1) + '%', yFmt: v => Math.round(v), tipFmt: (s, v, i) => `${v} 個起點`,
            series: [{ name: '起點數', y: bins.map(b => b.n), color: 'var(--amber)' }], refX: [{ x: 0, label: '0：兩者相同', color: 'var(--dim)' }] });
          LTChart.line($('#rsLine'), { x: R.map(x => M[x.t]), xType: 'date', label: '依起點的年化報酬', height: 260, xFmt: (m, tip) => tip ? `${ym(m)} 起` : m.slice(2).replace('-', '/'),
            yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => pctf(v, 2), refY: [{ y: 0 }],
            series: [{ name: '單筆投入', y: R.map(x => x.lsi), color: 'var(--amber)' }, { name: '定期定額', y: R.map(x => x.dca), color: 'var(--blue)' }, { name: '逢低買入(10%)', y: R.map(x => x.btd[0]), color: 'var(--up)', width: 1.3 }, { name: '逢低買入(20%)', y: R.map(x => x.btd[1]), color: 'var(--down)', width: 1.3 }] });
          const w = win(x => x.dca), worst = R.slice().sort((a, b) => a.lsi - b.lsi).slice(0, Math.max(1, Math.round(R.length * 0.1)));
          $('#rsInsight').innerHTML = `
            <li>單筆投入在 ${(w * 100).toFixed(0)}% 的起點贏過定期定額，年化報酬平均${mean(d) >= 0 ? '多' : '少'} ${pctf(Math.abs(mean(d)), 2).replace('+', '')}；${w > 0.5 && mean(d) >= 0 ? '勝率與平均都和 PWL 研究的方向一致' : w > 0.5 ? '單筆較常勝出，但定期定額贏的時候贏比較多(例如起點剛好在大跌之前)，平均下來差不多' : '這段期間定期定額較常勝出，與 PWL 研究的多數國家不同'}。</li>
            <li>在單筆投入表現最差的 10% 起點裡，定期定額贏的比例是 ${(worst.filter(x => x.dca > x.lsi).length / worst.length * 100).toFixed(0)}%。</li>
            <li>逢低買入：等跌 10% 才進場，單筆贏的比例 ${(win(x => x.btd[0]) * 100).toFixed(0)}%${tieTxt(x => x.btd[0])}、年化平均多 ${pctf(mean(diff(x => x.btd[0])), 2)}；等跌 20%，單筆贏的比例 ${(win(x => x.btd[1]) * 100).toFixed(0)}%${tieTxt(x => x.btd[1])}、年化平均多 ${pctf(mean(diff(x => x.btd[1])), 2)}。${mean(diff(x => x.btd[0])) < 0 ? "這段期間「跌 10% 才買」平均反而略勝：台股 10% 的回檔很常見、等待時間短，常能買到較低的價格；但「跌 20% 才買」常常要等好幾年，錯過的漲幅遠大於買低的好處。" : "門檻越深，拿著現金的時間越長，錯過的漲幅越多。"}</li>
            ${$('#rsSeries').value === 'taiex' ? '<li>加權指數 2000 年的高點直到 2017 年才站回，這段期間指數大多已比高點低 10% 以上，所以「跌 10% 才買」多半在起點就立刻進場、結果和單筆相同；加權指數也不含股息，含股息時越早進場越有利(可改選加權報酬指數比較)。</li>' : ''}
            ${$('#rsSeries').value === 'taiex_tr' ? '<li>加權報酬指數把成分股的現金股利再投入，是 0050 這類市值型 ETF 追蹤的標的(未扣 ETF 費用)，比只看價格的加權指數更接近實際投資的結果。</li>' : ''}`;
        };
        ['#rsSeries', '#rsH', '#rsN'].forEach(id => { $(id).onchange = drawRolling; });
        $('#rsCash').oninput = drawRolling;
        drawRolling();
      }
      function initResearch() {
        const all = RCATS.flatMap(c => c.studies), VIEWS = { arkk: arkkView, lsi: lsiView, etf_follow: etfFollow };
        let cat = RCATS.some(c => c.key === recall(RCAT_KEY)) ? recall(RCAT_KEY) : RCATS[0].key;
        let study = all.some(x => x.key === recall(RSTUDY_KEY)) ? recall(RSTUDY_KEY) : all[0].key;
        if (linked) { study = link; cat = RCATS.find(c => c.studies.some(x => x.key === link)).key; }
        const body = el.querySelector('#erBody'), pick = el.querySelector('.er-pick'), sel = el.querySelector('#erStudy'), desc = el.querySelector('#erDesc');
        let seq = 0;   // 每次切換研究加 1：還在載入的舊研究不會蓋掉新選的
        const showStudy = k => {
          study = k; store(RSTUDY_KEY, k);
          const S = all.find(x => x.key === k);
          sel.value = k; sel.style.color = RSERIES[S.series].color;
          desc.innerHTML = `${tagOf(S.series)} ${esc(S.desc)}`;
          const my = ++seq;
          VIEWS[k](body, () => ctx.alive() && seq === my);
        };
        const showCat = ck => {
          cat = ck; store(RCAT_KEY, ck);
          const Cx = RCATS.find(x => x.key === ck);
          el.querySelectorAll('.er-cat .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.c === ck));
          sel.innerHTML = Cx.studies.map(x => `<option value="${x.key}" style="color:${RSERIES[x.series].color}">● ${esc(x.name)}</option>`).join('');
          pick.style.display = Cx.studies.length ? '' : 'none';
          if (!Cx.studies.length) { ++seq; body.innerHTML = LT.UNDER_CONSTRUCTION; return; }
          showStudy(Cx.studies.some(x => x.key === study) ? study : Cx.studies[0].key);
        };
        el.querySelector('.er-cat').onclick = e => { const b = e.target.closest('[data-c]'); if (b && b.dataset.c !== cat) showCat(b.dataset.c); };
        sel.onchange = () => { if (sel.value !== study) showStudy(sel.value); };
        showCat(cat);
      }
      initResearch();
    },
  });
})();
