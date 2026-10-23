/* 股票 · 台股 · 股價查詢：上市櫃股票與 ETF 的日資料(2016 年起，含已下市櫃)
   資料在 Cloudflare D1(本機 pipeline/price_query/sync.py 每天同步)，經 api/prices 查詢；會員限定(functions/_lib/access.json)
   api/prices 回傳欄式資料 rows = {d 日期, o h l c 開高低收(原始價格), a 還原收盤價(含除權息), v 成交量(張)} */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const pct = (v, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const ymd = d => d.toISOString().slice(0, 10);
  const RANGES = [['1m', '1 個月', 1], ['3m', '3 個月', 3], ['1y', '1 年', 12], ['3y', '3 年', 36], ['5y', '5 年', 60], ['all', '全部', 0]];
  const ERRORS = { bad_symbol: '股票代號格式不對', not_found: '查無這檔股票', bad_range: '日期區間不對', not_configured: '股價查詢尚未開放', quota_exceeded: '今天的查詢次數已用完，明天再來' };
  let symbolsP = null;   // 股票清單只載入一次

  function loadSymbols() {
    if (!symbolsP) symbolsP = fetch('api/symbols').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .catch(e => { symbolsP = null; throw e; });
    return symbolsP;
  }
  const fromOf = key => {
    const [, , m] = RANGES.find(r => r[0] === key);
    if (!m) return '2000-01-01';
    const d = new Date(); d.setMonth(d.getMonth() - m); return ymd(d);
  };

  LT.register({
    section: 'stock', group: '台股', key: 'query', name: '股價查詢',
    async mount(el, ctx) {
      let last = '2330', range = '1y';
      try { last = localStorage.getItem('lt.query.symbol') || last; range = localStorage.getItem('lt.query.range') || range; } catch (e) {}
      el.innerHTML = `
        <header class="top"><div>
          <h1>股價查詢</h1>
          <p>上市櫃股票與 ETF 的每日開高低收、還原股價(含除權息)與成交量，2016 年起，含已下市櫃的股票</p>
        </div></header>
        <div class="panel">
          <form class="pq-form" autocomplete="off">
            <label class="pq-sym"><span>股票代號或名稱</span><input id="pqSym" list="pqList" value="${esc(last)}" placeholder="例如 2330 或 台積電" required><datalist id="pqList"></datalist></label>
            <div class="pq-range btnrow-l">${RANGES.map(([k, t]) => `<button type="button" data-r="${k}" class="${k === range ? 'active' : ''}">${t}</button>`).join('')}</div>
            <label><span>起</span><input id="pqFrom" type="date" min="2016-01-01"></label>
            <label><span>迄</span><input id="pqTo" type="date" min="2016-01-01"></label>
            <button type="submit" class="login-btn">查詢</button>
          </form>
          <p id="pqNote" class="note" style="margin:10px 0 0;"></p>
        </div>
        <div id="pqOut"></div>`;
      const $ = s => el.querySelector(s);
      const setRange = k => {
        range = k;
        el.querySelectorAll('.pq-range button').forEach(b => b.classList.toggle('active', b.dataset.r === k));
        $('#pqFrom').value = fromOf(k) < '2016-01-01' ? '2016-01-01' : fromOf(k);
        $('#pqTo').value = ymd(new Date());
      };
      setRange(range);

      let list = [];
      loadSymbols().then(s => {
        if (!ctx.alive()) return;
        list = s.symbols;
        $('#pqList').innerHTML = list.map(x => `<option value="${esc(x.symbol)}">${esc(x.name)}${x.delisted ? '(已下市櫃)' : ''}</option>`).join('');
        $('#pqNote').textContent = `共 ${list.length.toLocaleString()} 檔，資料更新到 ${s.last_date || '—'}。`;
      }).catch(() => { if (ctx.alive()) $('#pqNote').textContent = '股票清單載入失敗，仍可直接輸入代號查詢。'; });

      // 輸入名稱時換成代號
      const toSymbol = v => {
        v = v.trim();
        const m = v.match(/^([0-9A-Za-z]{4,6})\b/);
        if (m) return m[1].toUpperCase();
        const hit = list.find(x => x.name === v) || list.find(x => x.name && x.name.includes(v));
        return hit ? hit.symbol : v;
      };

      async function query() {
        const symbol = toSymbol($('#pqSym').value);
        $('#pqSym').value = symbol;
        try { localStorage.setItem('lt.query.symbol', symbol); localStorage.setItem('lt.query.range', range); } catch (e) {}
        $('#pqOut').innerHTML = '<div class="panel"><p class="mute"><span class="spinner"></span>查詢中…</p></div>';
        let r, j;
        try {
          r = await fetch(`api/prices?${new URLSearchParams({ symbol, from: $('#pqFrom').value, to: $('#pqTo').value })}`);
          j = await r.json();
        } catch (e) { j = { error: `連線失敗(${e.message})` }; }
        if (!ctx.alive()) return;
        if (!r || !r.ok) { $('#pqOut').innerHTML = `<div class="panel"><p class="mute">${esc(ERRORS[j.error] || j.error || `HTTP ${r.status}`)}</p></div>`; return; }
        render(j);
      }

      function render(j) {
        const R = j.rows, n = R.d.length;
        const title = `${esc(j.symbol)} ${esc(j.name)}${j.delisted ? ' <span class="soon-tag">已下市櫃</span>' : ''}`;
        if (!n) { $('#pqOut').innerHTML = `<div class="panel"><h3>${title}</h3><p class="mute">這段期間沒有成交資料(資料期間 ${esc(j.first_date)} ～ ${esc(j.last_date)})。</p></div>`; return; }
        const c1 = R.c[n - 1], a0 = R.a[0], a1 = R.a[n - 1];   // 報酬一律用還原股價(原始價格遇到分割會失真)
        const years = (Date.parse(R.d[n - 1]) - Date.parse(R.d[0])) / (365.25 * 86400e3);
        const hi = Math.max(...R.h.filter(Number.isFinite)), lo = Math.min(...R.l.filter(Number.isFinite));
        const vAvg = R.v.reduce((s, v) => s + (v || 0), 0) / n;
        const card = (v, l, c = '') => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${l}</div></div>`;
        const rows = R.d.map((d, i) => i).reverse();
        const rowHtml = i => `<tr><td>${R.d[i]}</td><td>${num(R.o[i])}</td><td>${num(R.h[i])}</td><td>${num(R.l[i])}</td><td>${num(R.c[i])}</td>
          <td class="${cls(R.a[i] / R.a[i - 1] - 1)}">${i ? pct(R.a[i] / R.a[i - 1] - 1) : '—'}</td><td>${num(R.a[i])}</td><td>${num(R.v[i], 0)}</td></tr>`;
        $('#pqOut').innerHTML = `
          <div class="panel">
            <h3 style="margin-top:0;">${title}</h3>
            <p class="mute" style="margin-top:-4px;">${R.d[0]} ～ ${R.d[n - 1]}，${n.toLocaleString()} 個交易日${j.truncated ? `(訪客只能查最近 1 個月)` : ''}</p>
            <div class="statgrid" style="margin:12px 0;">
              ${card(num(c1), `最新收盤(${R.d[n - 1].slice(5).replace('-', '/')})`)}
              ${card(pct(a1 / a0 - 1), '含息報酬(還原股價)', cls(a1 / a0 - 1))}
              ${years >= 1 ? card(pct((a1 / a0) ** (1 / years) - 1), '年化含息報酬', cls(a1 / a0 - 1)) : ''}
              ${card(`${num(hi)} / ${num(lo)}`, '期間最高 / 最低(原始價格)')}
              ${card(num(vAvg, 0), '平均成交量(張)')}
            </div>
            <div id="pqChart"></div>
            <p class="note">還原收盤價：把除權息與分割調整回去的價格，報酬都用它計算；最新一天和收盤價相同。開高低收是當天的原始價格，遇到分割(例如 0050 在 2025/6 一拆四)會出現斷層。</p>
          </div>
          <div class="panel">
            <div class="pq-table-head"><h3 style="margin:0;">每日資料</h3><button type="button" id="pqCsv" class="acct-link">下載 CSV</button></div>
            <div class="tablewrap"><table class="stattable pq-table">
              <thead><tr><th>日期</th><th>開盤</th><th>最高</th><th>最低</th><th>收盤</th><th>漲跌(含息)</th><th>還原收盤</th><th>成交量(張)</th></tr></thead>
              <tbody>${rows.slice(0, 30).map(rowHtml).join('')}</tbody>
            </table></div>
            ${n > 30 ? `<div class="btnrow-l" style="margin-top:10px;"><button type="button" id="pqMore">顯示全部 ${n.toLocaleString()} 天</button></div>` : ''}
            <p class="note">今天還可以查詢 ${j.remaining.toLocaleString()} 次(每天 ${j.limit.toLocaleString()} 次)。</p>
          </div>`;
        LTChart.line($('#pqChart'), {
          x: R.d, xType: 'date', height: 300, label: `${j.symbol} 股價`, yFmt: v => num(v, v >= 1000 ? 0 : 2),
          series: [{ name: '收盤價', y: R.c, color: 'var(--blue)', width: 1.8 }, { name: '還原收盤價', y: R.a, color: 'var(--amber)', width: 1.4 }],
          lower: { height: 90, label: '成交量(張)', series: [{ name: '成交量(張)', y: R.v, color: 'var(--dim)', width: 1 }], yMin: 0, fill: true,
                   yFmt: v => v >= 1e4 ? (v / 1e4).toFixed(v >= 1e5 ? 0 : 1) + '萬' : Math.round(v) + '', tipFmt: (s, v) => num(v, 0) + ' 張' },
        });
        const more = $('#pqMore');
        if (more) more.onclick = () => { el.querySelector('.pq-table tbody').innerHTML = rows.map(rowHtml).join(''); more.remove(); };
        $('#pqCsv').onclick = () => {
          const lines = ['日期,開盤,最高,最低,收盤,還原收盤,成交量(張)', ...R.d.map((d, i) => [d, R.o[i], R.h[i], R.l[i], R.c[i], R.a[i], R.v[i]].join(','))];
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
          a.download = `${j.symbol}_${R.d[0]}_${R.d[n - 1]}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };
      }

      el.querySelector('.pq-range').onclick = e => { const b = e.target.closest('button'); if (b) { setRange(b.dataset.r); query(); } };
      el.querySelector('.pq-form').onsubmit = e => { e.preventDefault(); query(); };
      ['#pqFrom', '#pqTo'].forEach(s => $(s).addEventListener('change', () => el.querySelectorAll('.pq-range button').forEach(b => b.classList.remove('active'))));
      query();
    },
  });
})();
