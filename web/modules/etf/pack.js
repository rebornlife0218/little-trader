/* ETF · ETF大禮包：兩個分頁
   · ETF介紹：ETF 是什麼、種類、成本、配息與總報酬、折溢價
   · 怎麼存ETF：0050 vs 勞退基金、常存 ETF 績效比較、ARKK 研究(追高的代價)、單筆投入(高點/低點) vs 定期定額
   資料集：data/etf_compare/(compare.json、etfs.json；pipeline/etf_compare/update.py) */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pctf = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const ym = m => m.replace('-', '/');
  const money = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '—';
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
  // 年化內部報酬率(XIRR)：flows = [{t: 日期字串, v: 金額(投入為負)}]
  function xirr(flows) {
    const t0 = Date.parse(flows[0].t), yrs = f => (Date.parse(f.t) - t0) / (365.25 * 864e5);
    const npv = r => flows.reduce((a, f) => a + f.v / (1 + r) ** yrs(f), 0);
    let lo = -0.99, hi = 5;
    if (npv(lo) * npv(hi) > 0) return NaN;
    for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }
  // 單筆投入(高點、低點、年初) vs 定期定額：每年投入相同金額，用還原股價(配息再投入)
  function timingStudy(dd, startYear, perYear) {
    const years = [...new Set(dd.d.map(d => +d.slice(0, 4)))];
    const lastYear = years[years.length - 1];
    const full = years.filter(y => y >= startYear && y < lastYear && dd.d.find(d => d.startsWith(String(y))).slice(5, 7) === '01');
    const idxOfYear = y => dd.d.map((d, i) => d.startsWith(String(y)) ? i : -1).filter(i => i >= 0);
    const S = { best: [], worst: [], jan: [], dca: [] };   // 每筆投入 {i: 日期索引, v: 金額}
    full.forEach(y => {
      const idx = idxOfYear(y);
      const minI = idx.reduce((a, i) => dd.a[i] < dd.a[a] ? i : a, idx[0]), maxI = idx.reduce((a, i) => dd.a[i] > dd.a[a] ? i : a, idx[0]);
      S.best.push({ i: minI, v: perYear }); S.worst.push({ i: maxI, v: perYear }); S.jan.push({ i: idx[0], v: perYear });
      const months = [...new Set(idx.map(i => dd.d[i].slice(0, 7)))];
      months.forEach(m => { const i = idx.find(k => dd.d[k].startsWith(m)); S.dca.push({ i, v: perYear / months.length }); });
    });
    const last = dd.d.length - 1, mo = monthly(dd);
    const res = {};
    Object.entries(S).forEach(([k, buys]) => {
      const shares = buys.reduce((a, b) => a + b.v / dd.a[b.i], 0);
      const value = shares * dd.a[last], invested = buys.reduce((a, b) => a + b.v, 0);
      const flows = buys.map(b => ({ t: dd.d[b.i], v: -b.v })).concat([{ t: dd.d[last], v: value }]);
      // 每月底的帳戶價值(圖用)
      const series = mo.i.map(mi => { const sh = buys.filter(b => b.i <= mi).reduce((a, b) => a + b.v / dd.a[b.i], 0); return sh * dd.a[mi]; });
      res[k] = { value, invested, irr: xirr(flows), series, buys };
    });
    const investedSeries = mo.i.map(mi => S.jan.filter(b => b.i <= mi).reduce((a, b) => a + b.v, 0));
    return { years: full, res, months: mo.m, invested: investedSeries, asOf: dd.d[last] };
  }

  LT.register({
    section: 'etf', key: 'pack', name: 'ETF大禮包',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入資料…</p></div></div>`;
      let C = null, E = null, loadErr = '';
      try {
        [C, E] = await Promise.all([LT.loadJSON('etf_compare', 'compare.json').then(r => r.data), LT.loadJSON('etf_compare', 'etfs.json').then(r => r.data)]);
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
          <button class="mode-tab" data-tab="save"><b>怎麼存ETF</b><small>0050 vs 勞退、常存 ETF 比較、ARKK 研究、單筆 vs 定期定額</small></button>
        </div>

        <div class="pk-pane" data-pane="intro">
          <div class="panel doc">
            <h3>什麼是 ETF</h3>
            <p><b>ETF</b>(Exchange Traded Fund，指數股票型基金)是把一籃子股票或債券包成一檔基金，在證券交易所掛牌，可以像股票一樣隨時買賣。大多數 ETF 是<b>被動追蹤指數</b>：例如 0050 追蹤「臺灣 50 指數」，買一張 0050 就等於同時持有台灣市值最大的 50 家公司。</p>
            <ul>
              <li><b>分散風險</b>：一次買進很多檔股票，單一公司出問題的影響較小。</li>
              <li><b>成本低</b>：被動追蹤指數，管理費通常比主動型基金低；交易稅也比個股低(下方說明)。</li>
              <li><b>透明</b>：持股與淨值每天公布，盤中也有預估淨值。</li>
              <li><b>門檻低</b>：可以零股或定期定額買進，小額也能開始。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>常見種類</h3>
            <div class="tablewrap"><table class="stattable pk-kind">
              <thead><tr><th>種類</th><th>例子</th><th>特色</th><th>要注意</th></tr></thead>
              <tbody>
                <tr><td>市值型</td><td>0050、006208</td><td style="text-align:left">依市值挑選大型股，跟著大盤走，最適合長期持有、定期定額</td><td style="text-align:left">台股權值集中在少數大型股(如台積電)，產業集中度高</td></tr>
                <tr><td>高股息</td><td>0056、00878、00713、00919、00929</td><td style="text-align:left">挑選殖利率高的股票，配息較多、部分月配或季配</td><td style="text-align:left">配息不等於多賺(見下方總報酬)；選股規則、換股頻率各檔差異大</td></tr>
                <tr><td>債券型</td><td>美國公債、投資等級公司債 ETF</td><td style="text-align:left">價格波動通常比股票小，與股市的相關性較低，可用來平衡資產</td><td style="text-align:left">利率上升時債券價格下跌，長天期債券波動並不小</td></tr>
                <tr><td>主題／產業型</td><td>半導體、電動車、創新科技(如美股 ARKK)</td><td style="text-align:left">集中投資某個產業或題材</td><td style="text-align:left">題材熱門時容易追高，產業集中、波動大(見「怎麼存ETF」的 ARKK 研究)</td></tr>
                <tr><td>槓桿／反向</td><td>台灣50正2、台灣50反1</td><td style="text-align:left">追蹤指數單日漲跌的 2 倍或反向，適合短線操作</td><td style="text-align:left">每日重新平衡，長期持有的報酬不等於指數的 2 倍或 −1 倍，盤整時會耗損</td></tr>
              </tbody>
            </table></div>
          </div>
          <div class="panel doc">
            <h3>持有 ETF 的成本</h3>
            <ul>
              <li><b>內扣費用</b>：經理費、保管費等直接從基金資產扣除，反映在淨值裡，不會另外收費。費用率每年差 0.3%，存 20 年後的差距就很明顯，同樣追蹤臺灣 50 指數的 0050 與 006208 就常被拿來比較費用。</li>
              <li><b>交易成本</b>：買賣時的券商手續費(上限 0.1425%，通常有折扣)；賣出時的證券交易稅，股票型 ETF 為 0.1%，比個股的 0.3% 低。</li>
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
            <div class="pickrow" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <h3 style="margin:0;">一、0050 vs 勞退基金</h3>
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

          <div class="panel">
            <h3>二、常存的 ETF 績效比較</h3>
            <div class="pk-picks" id="pkPicks">${twList.map(x => `<label><input type="checkbox" value="${x.code}" checked> <b>${x.code}</b> ${esc(x.name)}<small>${x.kind}</small></label>`).join('')}</div>
            <p class="note" id="pkCommonNote" style="margin-top:6px;"></p>
            <div id="pkEtfChart"></div>
            <div id="pkEtfLegend"></div>
            <div class="tablewrap" style="margin-top:10px;"><table class="stattable" id="pkEtfTable"></table></div>
            <p class="note">共同期間：從勾選的 ETF 中最晚上市的那一檔開始比較，期間越短越容易受單一年度行情影響，可以取消勾選上市較晚的 ETF 拉長比較期間。<b>配息貢獻</b> = 年化總報酬 − 年化價格報酬。資料為 Yahoo Finance 的收盤價與還原股價。</p>
            <div class="tablewrap" style="margin-top:6px;"><table class="stattable" id="pkSince"></table></div>
          </div>

          <div class="panel">
            <h3>三、ARKK 研究：基金賺錢，投資人卻賠錢</h3>
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
              <p class="mute" style="font-size:12px;">資料來源：${ARKK_REFS.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)}</a>`).join('；')}。上圖為 ARKK 的還原股價(美元)，研究數字引用自原文。</p>
            </div>
          </div>

          <div class="panel">
            <h3>四、單筆投入(高點、低點) vs 定期定額</h3>
            <div class="paramgrid opt-form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
              <div class="paramitem"><label for="tsEtf">ETF</label><select id="tsEtf">${twList.map(x => `<option value="${x.code}">${x.code} ${esc(x.name)}</option>`).join('')}</select></div>
              <div class="paramitem"><label for="tsStart">開始年度</label><select id="tsStart"></select></div>
              <div class="paramitem"><label for="tsAmt">每年投入(元)</label><input id="tsAmt" type="number" min="1000" step="10000" value="120000"></div>
            </div>
            <div class="statgrid" id="tsStats" style="margin:14px 0;"></div>
            <div id="tsChart"></div>
            ${LTChart.legend([{ name: '最佳時機(每年最低點)', color: 'var(--up)' }, { name: '年初單筆', color: 'var(--amber)' }, { name: '定期定額(每月)', color: 'var(--blue)' }, { name: '最差時機(每年最高點)', color: 'var(--down)' }, { name: '累計投入本金', color: 'var(--dim)' }])}
            <ul class="insight" id="tsInsight"></ul>
            <p class="note">每年投入相同金額：<b>最佳時機</b>每年都剛好在當年最低點買進(事後才知道，現實做不到)、<b>最差時機</b>每年都在最高點買進、<b>年初單筆</b>每年第一個交易日一次投入、<b>定期定額</b>每月第一個交易日投入 1/12。以還原股價計算(配息再投入)，不計手續費；帳戶價值算到最新一個交易日，年化報酬為內部報酬率(IRR)。只計入完整的年度。</p>
          </div>` : failed}
        </div>`;

      const showTab = t => {
        el.querySelectorAll('.pk-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        el.querySelectorAll('.pk-pane').forEach(p => { p.hidden = p.dataset.pane !== t; });
        try { localStorage.setItem('lt.pkTab', t); } catch (e) {}
      };
      el.querySelector('.pk-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
      let saved = 'intro'; try { saved = localStorage.getItem('lt.pkTab') || 'intro'; } catch (e) {}
      showTab(saved === 'save' ? 'save' : 'intro');
      if (!C || !E) return;
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

      /* ---------- 三、ARKK ---------- */
      const ak = MO.ARKK;
      if (ak) {
        const peakI = ak.a.reduce((b, v, i) => v > ak.a[b] ? i : b, 0), last = ak.a.length - 1;
        LTChart.line($('#pkArkkChart'), { x: ak.m, xType: 'date', label: 'ARKK 還原股價', height: 240, xFmt: (m, tip) => tip ? ym(m) : m.slice(2).replace('-', '/'),
          yFmt: v => '$' + Math.round(v), tipFmt: (s, v) => '$' + v.toFixed(2), series: [{ name: 'ARKK', y: ak.a, color: 'var(--amber)' }],
          points: [{ x: ak.m[peakI], y: ak.a[peakI], color: 'var(--up)', label: `高點 ${ym(ak.m[peakI])}` }] });
        const sAll = statsOf(ak.a.slice(1).map((v, k) => v / ak.a[k] - 1), 12);
        $('#pkArkkNote').innerHTML = `ARKK 還原股價(美元，月底)：上市以來年化 ${pctf(sAll.cagr)}；${ym(ak.m[peakI])} 的高點到 ${ym(ak.m[last])}，${pctf(ak.a[last] / ak.a[peakI] - 1, 0)}；期間最大回撤 ${pctf(sAll.mdd, 0)}。`;
      }

      /* ---------- 四、單筆 vs 定期定額 ---------- */
      const fillStart = () => {
        const dd = E.daily[$('#tsEtf').value], ys = [...new Set(dd.d.map(d => +d.slice(0, 4)))];
        const okYears = ys.filter(y => y < ys[ys.length - 1] && dd.d.find(d => d.startsWith(String(y))).slice(5, 7) === '01');
        $('#tsStart').innerHTML = okYears.map(y => `<option value="${y}">${y}</option>`).join('');
      };
      const drawTiming = () => {
        const code = $('#tsEtf').value, dd = E.daily[code], amt = Math.max(1000, +$('#tsAmt').value || 120000);
        const R = timingStudy(dd, +$('#tsStart').value, amt);
        if (!R.years.length) { $('#tsStats').innerHTML = '<p class="mute">完整年度不足</p>'; return; }
        const K = [['best', '最佳時機(每年最低點)', 'var(--up)'], ['jan', '年初單筆', 'var(--amber)'], ['dca', '定期定額(每月)', 'var(--blue)'], ['worst', '最差時機(每年最高點)', 'var(--down)']];
        const inv = R.res.jan.invested;
        $('#tsStats').innerHTML = `<div class="stat"><div class="v" style="font-size:16px;">${R.years[0]}～${R.years[R.years.length - 1]}</div><div class="l">投入 ${R.years.length} 年 · 本金 ${money(inv)} 元 · 算到 ${R.asOf}</div></div>` +
          K.map(([k, n, c]) => { const r = R.res[k]; return `<div class="stat"><div class="v" style="color:${c}">${money(r.value)}</div><div class="l">${n} · 年化 ${pctf(r.irr)} · 報酬 ${pctf(r.value / r.invested - 1, 0)}</div></div>`; }).join('');
        const mi = R.months.findIndex(m => m >= `${R.years[0]}-01`);
        const sl = a => a.slice(mi);
        LTChart.line($('#tsChart'), { x: sl(R.months), xType: 'date', label: '單筆 vs 定期定額', height: 300, xFmt: (m, tip) => tip ? ym(m) : m.slice(2).replace('-', '/'),
          yFmt: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K', tipFmt: (s, v) => money(v) + ' 元',
          series: [...K.map(([k, n, c]) => ({ name: n, y: sl(R.res[k].series), color: c })), { name: '累計投入本金', y: sl(R.invested), color: 'var(--dim)', dash: '4 4', width: 1.4 }] });
        const b = R.res.best, w = R.res.worst, j = R.res.jan, d = R.res.dca;
        $('#tsInsight').innerHTML = `
          <li>每年都在<b>最高點</b>買進(最差時機)，到 ${R.asOf} 帳戶有 ${money(w.value)} 元(本金 ${money(w.invested)} 元)，年化 ${pctf(w.irr)}；與每年都買在<b>最低點</b>的 ${money(b.value)} 元(年化 ${pctf(b.irr)})相比，差距是年化 ${((b.irr - w.irr) * 100).toFixed(1)} 個百分點。</li>
          <li><b>年初單筆</b>帳戶 ${money(j.value)} 元、<b>定期定額</b> ${money(d.value)} 元：年初單筆的錢平均比定期定額早半年進場，留在市場的時間較長，在長期上漲的市場裡金額${j.value > d.value ? '較多' : '反而較少(這段期間年初之後常有下跌)'}；換算成年化報酬(IRR)分別是 ${pctf(j.irr)} 與 ${pctf(d.irr)}，差距很小。定期定額不需要判斷時機，也避免一次在高點投入全部資金的風險。</li>
          <li>擇時能多賺的有限，而且最佳時機在現實中幾乎不可能做到；<b>持續投入、留在市場裡</b>比找進場點重要。</li>`;
      };
      $('#tsEtf').onchange = () => { fillStart(); drawTiming(); };
      $('#tsStart').onchange = drawTiming;
      $('#tsAmt').oninput = drawTiming;
      fillStart(); drawTiming();
    },
  });
})();
