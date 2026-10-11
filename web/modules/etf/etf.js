/* ETF 區塊
   · ETF大禮包：0050 vs 勞退基金(資料集 data/etf_compare/，pipeline/etf_compare/update.py)、ETF 折溢價(說明＋參考連結)
   · 即將發行ETF：資料集 data/etf_upcoming/(pipeline/etf_upcoming/update.py，排程見 .github/workflows/data-etf_upcoming.yml) */
(() => {
  const DATASET = 'etf_upcoming';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dash = s => s ? esc(s) : '<span class="na">—</span>';

  const PREMIUM_REFS = [
    { name: '臺灣證券交易所 · ETF 盤中預估淨值與折溢價', desc: '各檔國內 ETF 的市價、預估淨值與折溢價率，盤中即時揭露',
      url: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant' },
  ];
  /* ETF大禮包：0050 vs 勞退基金(資料集 etf_compare)、ETF 折溢價 */
  const pctf = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const growth = rets => { let v = 1; return rets.map(r => (v *= 1 + r)); };
  function statsOf(rets) {
    const n = rets.length; if (!n) return {};
    const cum = rets.reduce((v, r) => v * (1 + r), 1) - 1, m = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / Math.max(1, n - 1));
    let peak = 1, v = 1, mdd = 0;
    rets.forEach(r => { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    return { cum, cagr: (1 + cum) ** (12 / n) - 1, vol: sd * Math.sqrt(12), mdd };
  }
  const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sab / Math.sqrt(sa * sb); };

  LT.register({
    section: 'etf', key: 'pack', name: 'ETF大禮包',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入資料…</p></div></div>`;
      let D = null, loadErr = '';
      try { D = (await LT.loadJSON('etf_compare', 'compare.json')).data; } catch (err) { loadErr = err.message; }
      if (!ctx.alive()) return;
      el.innerHTML = `
        <header class="top"><div>
          <h1>ETF大禮包</h1>
          <p>ETF 相關的研究與工具：0050 與勞退基金的績效比較、ETF 折溢價</p>
        </div></header>
        <div class="mode-tabs pk-tabs">
          <button class="mode-tab active" data-tab="lpf"><b>0050 vs 勞退基金</b><small>自己買 0050 和勞退基金誰的績效好</small></button>
          <button class="mode-tab" data-tab="premium"><b>ETF 折溢價</b><small>ETF 市價與淨值的差距</small></button>
        </div>
        <div class="pk-pane" data-pane="lpf">${D ? `
          <div class="panel">
            <div class="pickrow" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <h3 style="margin:0;">累積報酬比較</h3>
              <div class="btnrow-l pk-range">${[['all', '全期間'], [120, '近 10 年'], [60, '近 5 年'], [36, '近 3 年']].map(([k, n], i) => `<button data-r="${k}" class="${i === 0 ? 'active' : ''}">${n}</button>`).join('')}</div>
            </div>
            <div class="statgrid" id="pkStats" style="margin:14px 0;"></div>
            <div id="pkChart"></div>
            ${LTChart.legend([{ name: '勞退基金(新制)', color: 'var(--blue)' }, { name: '0050 總報酬(股利再投入)', color: 'var(--amber)' }, { name: '0050 價格報酬(不含股利)', color: 'var(--dim)' }])}
            <p class="note">起點都以 100 計算。勞退基金是勞動基金運用局公告的新制勞退基金整體收益率；0050 總報酬假設配息全部再買回 0050，價格報酬只看股價漲跌。</p>
          </div>
          <div class="panel">
            <h3>每年報酬</h3>
            <div class="tablewrap"><table class="stattable" id="pkYears"></table></div>
          </div>
          <div class="panel doc">
            <h3>說明</h3>
            <ul>
              <li><b>勞退基金的收益率怎麼算</b>：勞動基金運用局每月公告的「最近月份收益率」是<b>當年度截至該月的累計收益率</b>，每年 1 月重新起算。本頁換成每月報酬再連乘：1 月就是公告數字，其他月份為 (1 + 本月累計) ÷ (1 + 上月累計) − 1，連乘後每年 12 月的結果與公告的全年收益率相同。</li>
              <li><b>保證收益</b>：勞退新制個人專戶在請領時，累積收益不得低於以當地銀行二年定期存款利率計算的收益(勞工退休金條例第 23 條)，所以勞退基金某年虧損，不代表領到的退休金一定縮水。</li>
              <li><b>為什麼差這麼多</b>：勞退基金分散投資國內外股票、債券等資產，波動小、回撤淺；0050 是 100% 台股大型股，長期報酬較高但波動與回撤也大得多。比較時要同時看報酬與風險(年化波動、最大回撤)。</li>
              <li>月報酬以月底收盤計算；勞退基金約在兩個月後公告，所以比較期間的最後一個月會比 0050 晚。</li>
            </ul>
          </div>` : `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(loadErr)}</p></div></div>`}
        </div>
        <div class="pk-pane" data-pane="premium" hidden>
          <div class="panel">
          <h3>參考連結</h3>
          ${PREMIUM_REFS.map(r => `<a class="linkcard" href="${r.url}" target="_blank" rel="noopener">
            <div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${esc(r.url)}</small></div>
            <span class="go">前往 ↗</span></a>`).join('')}
        </div>
        <div class="panel doc">
          <h3>什麼是折溢價</h3>
          <p>ETF 在交易所買賣的價格(市價)由買賣雙方決定，不一定等於它實際持有資產的價值(淨值)。兩者的差距就是折溢價：</p>
          <div class="formula">折溢價率 ＝ (市價 − 淨值) ÷ 淨值</div>
          <ul>
            <li><b>溢價(正值)</b>：市價高於淨值，買進等於用比實際價值更貴的價格買。熱門 ETF 搶購時容易出現。</li>
            <li><b>折價(負值)</b>：市價低於淨值，賣出等於用比實際價值更便宜的價格賣。市場恐慌或流動性差時容易出現。</li>
          </ul>
          <p>盤中看的是「預估淨值」，由投信依成分股即時報價推算。折溢價過大時，日後價格可能向淨值靠攏，追高溢價的 ETF 要特別留意這個風險。</p>
        </div>
        </div>`;
      const showTab = t => {
        el.querySelectorAll('.pk-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        el.querySelectorAll('.pk-pane').forEach(p => { p.hidden = p.dataset.pane !== t; });
      };
      el.querySelector('.pk-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
      if (!D) return;
      const ym = m => m.replace('-', '/');
      const drawRange = r => {
        el.querySelectorAll('.pk-range button').forEach(b => b.classList.toggle('active', b.dataset.r === String(r)));
        const from = r === 'all' ? 0 : Math.max(0, D.months.length - r);
        const M = D.months.slice(from), L = D.lpf.slice(from), T = D.etf_total.slice(from), P = D.etf_price.slice(from);
        const sL = statsOf(L), sT = statsOf(T), sP = statsOf(P);
        const card = (v, l, style = '') => `<div class="stat"><div class="v" style="${style}">${v}</div><div class="l">${l}</div></div>`;
        el.querySelector('#pkStats').innerHTML =
          card(`${ym(M[0])}～${ym(M[M.length - 1])}`, `比較期間(${M.length} 個月)`, 'font-size:16px;') +
          card(pctf(sL.cum, 0), `勞退基金累積 · 年化 ${pctf(sL.cagr)}`) +
          card(pctf(sT.cum, 0), `0050 總報酬累積 · 年化 ${pctf(sT.cagr)}`) +
          card(pctf(sP.cum, 0), `0050 價格累積 · 年化 ${pctf(sP.cagr)}`) +
          card(`${(sL.vol * 100).toFixed(1)}% / ${(sT.vol * 100).toFixed(1)}%`, '年化波動(勞退 / 0050)') +
          card(`${pctf(sL.mdd, 0)} / ${pctf(sT.mdd, 0)}`, '最大回撤(勞退 / 0050)') +
          card(corr(L, T).toFixed(2), '月報酬相關係數');
        const g = a => [100, ...growth(a).map(v => v * 100)];
        // x 軸用序號(0 = 起點，之後每個月)，標籤再換成年月
        const labels = ['起點', ...M];
        LTChart.line(el.querySelector('#pkChart'), {
          x: labels.map((_, i) => i), label: '累積報酬比較', height: 300,
          xFmt: (i, tip) => i === 0 ? (tip ? `起點(${ym(M[0])} 初)` : '') : (tip ? ym(labels[i]) : labels[i].slice(2).replace('-', '/')),
          yFmt: v => Math.round(v), tipFmt: (s, v) => `${v.toFixed(1)}(${pctf(v / 100 - 1, 1)})`, refY: [{ y: 100 }],
          series: [{ name: '勞退基金', y: g(L), color: 'var(--blue)' }, { name: '0050 總報酬', y: g(T), color: 'var(--amber)' }, { name: '0050 價格', y: g(P), color: 'var(--dim)', width: 1.4 }],
        });
      };
      el.querySelector('.pk-range').onclick = e => { const b = e.target.closest('[data-r]'); if (b) drawRange(b.dataset.r === 'all' ? 'all' : +b.dataset.r); };
      drawRange('all');
      // 每年報酬：同一年的月報酬連乘(今年為截至最新月份)
      const years = [...new Set(D.months.map(m => m.slice(0, 4)))];
      const yr = (arr, y) => { const idx = D.months.map((m, i) => m.startsWith(y) ? i : -1).filter(i => i >= 0); return { r: idx.reduce((v, i) => v * (1 + arr[i]), 1) - 1, n: idx.length, first: D.months[idx[0]], last: D.months[idx[idx.length - 1]] }; };
      const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
      el.querySelector('#pkYears').innerHTML = `<thead><tr><th>年度</th><th>勞退基金</th><th>0050 總報酬</th><th>0050 價格報酬</th><th>誰比較好(總報酬)</th></tr></thead><tbody>
        ${years.slice().reverse().map(y => { const l = yr(D.lpf, y), t = yr(D.etf_total, y), p = yr(D.etf_price, y), partial = l.n < 12;
          return `<tr><td>${y}${partial ? ` <small class="mute">(${+l.first.slice(5)}～${+l.last.slice(5)} 月)</small>` : ''}</td><td class="${cls(l.r)}">${pctf(l.r)}</td><td class="${cls(t.r)}">${pctf(t.r)}</td><td class="${cls(p.r)}">${pctf(p.r)}</td>
            <td style="font-family:Inter,sans-serif;font-weight:700;color:${t.r > l.r ? 'var(--up)' : 'var(--blue)'}">${t.r > l.r ? '0050' : '勞退基金'}</td></tr>`; }).join('')}</tbody>`;
    },
  });

  LT.register({
    section: 'etf', key: 'upcoming', name: '即將發行ETF',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入即將發行ETF…</p></div></div>`;
      let meta, data;
      try {
        ({ meta, data } = await LT.loadJSON(DATASET, 'upcoming.json'));
      } catch (err) {
        if (!ctx.alive()) return;
        el.innerHTML = `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>${esc(err.message)}</p></div></div>`;
        return;
      }
      if (!ctx.alive()) return; // 使用者已切到別頁
      const items = data.items || [];
      const recruiting = items.filter(x => x.period).length;
      el.innerHTML = `
        <header class="top">
          <div>
            <h1>即將發行ETF</h1>
            <p>${esc(data.title || '新基金一覽表')} · 僅列基金名稱含「ETF」者</p>
            ${LT.sourceLine(meta)}
          </div>
        </header>
        <div class="statgrid" style="margin-bottom:16px;">
          <div class="stat"><div class="v">${items.length}</div><div class="l">ETF 檔數</div></div>
          <div class="stat"><div class="v">${recruiting}</div><div class="l">已公布募集期間</div></div>
          <div class="stat"><div class="v">${items.length - recruiting}</div><div class="l">送件申請中／待公布</div></div>
        </div>
        <div class="panel">
          <div class="tablewrap">
            <table class="etftable">
              <thead><tr><th>基金名稱</th><th>經理人</th><th>募集期間</th><th>申請金額</th></tr></thead>
              <tbody>
                ${items.map(x => `<tr>
                  <td class="fund">${esc(x.name)}</td>
                  <td>${dash(x.manager)}</td>
                  <td>${dash(x.period)}</td>
                  <td>${dash(x.amount)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="na">目前沒有即將發行的ETF</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="note">日期為民國年。募集期間空白代表尚在送件申請或尚未公布；申請金額「E」為億元。資料以來源網站為準。</div>
        </div>`;
    },
  });
})();
