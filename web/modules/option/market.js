/* 選擇權 · 市場概況：三個分頁
   · 市場指標：30 天隱含波動率 vs 歷史波動率、P/C ratio、結算日曆(週選、月選)
   · T 字報價與未平倉：各到期契約(含週選)的報價、未平倉量分布、波動率微笑
   · Black-Scholes 計算器(calculator.js 的 LTOpt.calculator)
   資料集：data/options/(pipeline/options/update.py，排程見 .github/workflows/data-options.yml) */
(() => {
  const { fmt, pct, esc, codeName, MULT } = LTOpt;
  const int = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '—';

  // 歷史波動率：近 n 日對數報酬的年化標準差
  function histVol(closes, n = 20) {
    const out = new Array(closes.length).fill(null);
    for (let i = n; i < closes.length; i++) {
      const r = []; for (let j = i - n + 1; j <= i; j++) r.push(Math.log(closes[j] / closes[j - 1]));
      const m = r.reduce((a, b) => a + b, 0) / n;
      out[i] = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) * 252);
    }
    return out;
  }
  // 最大痛點：到期時讓所有買方價值總和最小的履約價
  function maxPain(strikes) {
    let best = null;
    strikes.forEach(({ k: s }) => {
      const pain = strikes.reduce((a, x) => a + x.c[2] * Math.max(s - x.k, 0) + x.p[2] * Math.max(x.k - s, 0), 0);
      if (!best || pain < best.pain) best = { k: s, pain };
    });
    return best && best.k;
  }

  LT.register({
    topics: ['市場指標', 'T 字報價與未平倉', 'Black-Scholes 計算器'],   // 後台熱門主題列出的子項目(同下方三個分頁的名稱)
    section: 'option', key: 'market', name: '選擇權市場概況',
    async mount(el, ctx) {
      el.innerHTML = `<div class="panel"><div class="empty"><p>正在載入選擇權資料…</p></div></div>`;
      let D;
      try { D = await LTOpt.load(); } catch (err) { if (ctx.alive()) el.innerHTML = LTOpt.errorPanel(err.message); return; }
      if (!ctx.alive()) return;
      if (!D.chain.expiries || !D.chain.expiries.length) {   // 期交所資料不完整(例如只有盤後時段)：不要讓頁面壞掉
        el.innerHTML = `<div class="panel"><div class="empty"><p>最新交易日(${D.chain.date})的選擇權報價尚未完整公布，請稍後再試。</p></div></div>`;
        return;
      }
      const { chain, hist, spot, futures } = D;
      const n = hist.d.length - 1;
      // 歷史波動率對齊選擇權資料的日期
      let hv = hist.d.map(() => null);
      if (spot) {
        const hvAll = histVol(spot.data.c), at = new Map(spot.data.d.map((d, i) => [d, hvAll[i]]));
        hv = hist.d.map(d => at.get(d) ?? null);
      }
      const near = chain.expiries.find(e => !e.code[6]) || chain.expiries[0];
      const fut = LTOpt.futuresFor(futures, near.code);
      el.innerHTML = `
        <header class="top"><div>
          <h1>選擇權市場概況</h1>
          <p>臺指選擇權(TXO)：隱含波動率、P/C ratio、結算日曆、各履約價的報價與未平倉量，以及 Black-Scholes 計算器</p>
        </div></header>
        <div class="mode-tabs mk-tabs">
          <button class="mode-tab active" data-tab="metrics"><b>市場指標</b><small>IV、P/C ratio、結算日曆</small></button>
          <button class="mode-tab" data-tab="chain"><b>T 字報價與未平倉</b><small>各到期契約(含週選)</small></button>
          <button class="mode-tab" data-tab="calc"><b>Black-Scholes 計算器</b><small>理論價格與 Greeks</small></button>
        </div>
        <div class="mk-pane" data-pane="metrics">
        <div class="panel"><div class="statgrid">
          <div class="stat"><div class="v" style="font-size:18px;">${esc(chain.date)}</div><div class="l">最新交易日</div></div>
          <div class="stat"><div class="v">${spot ? fmt(spot.close, 0) : '—'}</div><div class="l">加權指數收盤${spot ? `(${esc(spot.date)})` : ''}</div></div>
          <div class="stat"><div class="v">${fut ? fmt(fut.price, 0) : '—'}</div><div class="l"><a href="#/index/futures">台指期 ${fut ? fut.code.slice(4, 6) + ' 月' : ''}</a> · 選擇權反推遠期 ${fmt(near.fwd, 0)}</div></div>
          <div class="stat"><div class="v">${pct(hist.iv30[n])}</div><div class="l">30 天隱含波動率</div></div>
          <div class="stat"><div class="v">${pct(hv[n])}</div><div class="l">20 日歷史波動率</div></div>
          <div class="stat"><div class="v">${fmt(hist.pcoi[n], 1)}%</div><div class="l">P/C ratio(未平倉)</div></div>
          <div class="stat"><div class="v">${fmt(hist.pcv[n], 1)}%</div><div class="l">P/C ratio(成交量)</div></div>
        </div></div>
        <div class="panel">
          <h3>隱含波動率 vs 歷史波動率</h3>
          <div id="ivChart"></div>
          <p class="note">隱含波動率(IV)是選擇權價格反推的「市場預期未來波動」，歷史波動率(HV)是指數過去 20 個交易日實際的波動。IV 明顯高於 HV 代表市場願意花較多錢買保護(恐慌或預期有大事)，選擇權偏貴；IV 低於 HV 則偏便宜。</p>
        </div>
        <div class="panel">
          <h3>P/C ratio</h3>
          <div id="pcChart"></div>
          <p class="note">P/C ratio(Put/Call ratio) = 賣權 ÷ 買權。未平倉比常被當成籌碼指標：比值高代表賣權(看跌或避險)部位多，但台灣散戶與法人常「賣出」賣權收權利金，因此也可能代表市場認為下檔有支撐，解讀時要搭配三大法人的買賣方向。<b>注意週結算</b>：每週三、週五都有週選擇權結算，到期的部位從未平倉中消失，所以未平倉的 P/C ratio 在結算日前後常會跳動，看趨勢比看單日數字可靠。</p>
        </div>
        <div class="panel">
          <h3>結算日曆</h3>
          ${LTOpt.settlementTable(LTOpt.settlements(D, 10))}
          <p class="note">臺指選擇權有<b>月選擇權</b>(每月第 3 個週三結算，與台指期同一天)與<b>週選擇權</b>(每週三、週五結算)。週選擇權到期時間短、時間價值流失快(Theta 大)，結算前最後幾天價格對指數變動非常敏感。月結算時期貨部位需要轉倉，見<a href="#/index/futures">台指期貨</a>。</p>
        </div>
        </div>
        <div class="mk-pane" data-pane="chain" hidden>
        <div class="panel">
          <div class="pickrow" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <h3 style="margin:0;">T 字報價與未平倉量</h3>
            <div class="pickrow"><label for="expPick">到期契約</label>
              <select id="expPick" class="indexpick">${chain.expiries.map((e, i) => `<option value="${i}" ${e === near ? 'selected' : ''}>${esc(codeName(e.code))}　${esc(e.expiry)}(剩 ${e.days} 天)</option>`).join('')}</select>
            </div>
          </div>
          <div id="expInfo" class="statgrid" style="margin:14px 0;"></div>
          <h3>未平倉量分布</h3>
          <div id="oiChart"></div>
          ${LTChart.legend([{ name: '買權未平倉', color: 'var(--up)' }, { name: '賣權未平倉', color: 'var(--down)' }])}
          <h3>波動率微笑</h3>
          <div id="smileChart"></div>
          <p class="note">各履約價的隱含波動率(低於遠期價格用賣權、高於用買權，都取價外那一邊)。台股通常左高右低(「波動率偏斜」)：市場願意為下跌保護付比較高的價格。</p>
          <h3>T 字報價 <small class="mute" style="font-weight:400;">結算價(點)，每點 ${MULT} 元；底色為價內</small></h3>
          <div class="btnrow-l" style="margin-bottom:8px;"><button id="tqToggle">顯示全部履約價</button></div>
          <div class="tablewrap"><table class="stattable tquote" id="tquote"></table></div>
        </div>
        </div>
        <div class="mk-pane" data-pane="calc" hidden></div>
        <div class="panel doc">
          <h3>指標說明</h3>
          <ul>
            <li><b>遠期價格</b>：用買賣權平價關係 $F = K + e^{rT}(C - P)$ 從選擇權價格反推的到期時指數，接近同到期的台指期貨價格。</li>
            <li><b>30 天隱含波動率</b>：把各到期契約的價平 IV 換成總變異數 $\\sigma^2 T$，在 30 天前後兩個到期日之間內插，概念與台指 VIX 相同(年化)。年化 20% 約等於「一個月內指數有 68% 機率在 ±5.8% 以內」。</li>
            <li><b>最大未平倉履約價</b>：買權最大未平倉常被視為壓力、賣權最大未平倉被視為支撐。</li>
            <li><b>最大痛點(Max Pain)</b>：到期時讓所有選擇權買方損失最大的結算價，有人認為結算價會向它靠攏，但並無可靠的統計證據。</li>
          </ul>
        </div>`;
      // 說明中的公式
      el.querySelectorAll('.doc li').forEach(li => { li.innerHTML = li.innerHTML.replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t, { throwOnError: false })); });

      const dfmt = d => String(d).slice(2).replace(/-/g, '/');
      LTChart.line(document.getElementById('ivChart'), {
        x: hist.d, xType: 'date', label: '隱含波動率與歷史波動率', yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => pct(v), xFmt: (d, tip) => tip ? d : dfmt(d).slice(0, 5),
        series: [{ name: '30 天隱含波動率', y: hist.iv30, color: 'var(--amber)' }, { name: '20 日歷史波動率', y: hv, color: 'var(--blue)' }],
      });
      document.getElementById('ivChart').insertAdjacentHTML('afterend', LTChart.legend([{ name: '30 天隱含波動率', color: 'var(--amber)' }, { name: '20 日歷史波動率', color: 'var(--blue)' }]));
      LTChart.line(document.getElementById('pcChart'), {
        x: hist.d, xType: 'date', label: 'P/C ratio', yFmt: v => v.toFixed(0) + '%', tipFmt: (s, v) => fmt(v, 1) + '%', xFmt: (d, tip) => tip ? d : dfmt(d).slice(0, 5),
        refY: [{ y: 100, label: '100%' }],
        series: [{ name: 'P/C ratio(未平倉)', y: hist.pcoi, color: 'var(--amber)' }, { name: 'P/C ratio(成交量)', y: hist.pcv, color: 'var(--dim)', width: 1.2 }],
      });
      document.getElementById('pcChart').insertAdjacentHTML('afterend', LTChart.legend([{ name: 'P/C ratio(未平倉)', color: 'var(--amber)' }, { name: 'P/C ratio(成交量)', color: 'var(--dim)' }]));

      let showAll = false;
      const pick = document.getElementById('expPick');
      function drawExpiry() {
        const e = chain.expiries[+pick.value], F = e.fwd, S = e.strikes;
        const callMax = S.reduce((a, x) => x.c[2] > a.c[2] ? x : a, S[0]), putMax = S.reduce((a, x) => x.p[2] > a.p[2] ? x : a, S[0]);
        const mp = maxPain(S);
        const sum = (side, i) => S.reduce((a, x) => a + x[side][i], 0);
        document.getElementById('expInfo').innerHTML = `
          <div class="stat"><div class="v">${fmt(F, 0)}</div><div class="l">遠期價格</div></div>
          <div class="stat"><div class="v">${pct(e.atm_iv)}</div><div class="l">價平隱含波動率</div></div>
          <div class="stat"><div class="v">${int(callMax.k)}</div><div class="l">買權最大未平倉(壓力)</div></div>
          <div class="stat"><div class="v">${int(putMax.k)}</div><div class="l">賣權最大未平倉(支撐)</div></div>
          <div class="stat"><div class="v">${int(mp)}</div><div class="l">最大痛點</div></div>
          <div class="stat"><div class="v">${fmt(sum('p', 2) / sum('c', 2) * 100, 1)}%</div><div class="l">本契約 P/C ratio(未平倉)</div></div>`;
        // 未平倉量：只畫有部位的履約價範圍
        const live = S.filter(x => x.c[2] + x.p[2] > 0);
        const lo = live.length ? live[0].k : S[0].k, hi = live.length ? live[live.length - 1].k : S[S.length - 1].k;
        const oiS = S.filter(x => x.k >= lo && x.k <= hi);
        LTChart.bars(document.getElementById('oiChart'), {
          x: oiS.map(x => x.k), label: '未平倉量分布', height: 240, xFmt: v => int(v), yFmt: v => int(v), tipFmt: (s, v) => int(v) + ' 口',
          series: [{ name: '買權', y: oiS.map(x => x.c[2]), color: 'var(--up)' }, { name: '賣權', y: oiS.map(x => x.p[2]), color: 'var(--down)' }],
          refX: [{ x: F, label: '遠期 ' + fmt(F, 0), color: 'var(--amber)' }],
        });
        const smile = S.map(x => x.k < F ? x.p[3] : x.c[3]);
        const ok = S.filter((x, i) => Number.isFinite(smile[i]));
        LTChart.line(document.getElementById('smileChart'), {
          x: ok.map(x => x.k), label: '波動率微笑', height: 220, xFmt: v => int(v), yFmt: v => (v * 100).toFixed(0) + '%', tipFmt: (s, v) => pct(v),
          series: [{ name: '隱含波動率', y: ok.map(x => x.k < F ? x.p[3] : x.c[3]), color: 'var(--amber)' }],
          refX: [{ x: F, label: '遠期', color: 'var(--dim)' }],
        });
        // T 字報價：預設只顯示價平上下各 15 檔
        const atm = S.reduce((a, x) => Math.abs(x.k - F) < Math.abs(a.k - F) ? x : a, S[0]).k;
        const ai = S.findIndex(x => x.k === atm);
        const rows = showAll ? S : S.slice(Math.max(0, ai - 15), ai + 16);
        const cell = (v, d = 0) => Number.isFinite(v) ? (d ? fmt(v, d) : int(v)) : '<span class="na">—</span>';
        document.getElementById('tquote').innerHTML = `
          <thead><tr><th colspan="4" class="tq-call">買權 Call</th><th rowspan="2">履約價</th><th colspan="4" class="tq-put">賣權 Put</th></tr>
            <tr><th>IV</th><th>未平倉</th><th>成交量</th><th>結算價</th><th>結算價</th><th>成交量</th><th>未平倉</th><th>IV</th></tr></thead>
          <tbody>${rows.map(x => `<tr class="${x.k === atm ? 'atm' : ''}">
            <td class="${x.k < F ? 'itm' : ''}">${x.c[3] ? pct(x.c[3]) : '—'}</td><td class="${x.k < F ? 'itm' : ''}">${cell(x.c[2])}</td><td class="${x.k < F ? 'itm' : ''}">${cell(x.c[1])}</td><td class="${x.k < F ? 'itm' : ''}"><b>${cell(x.c[0], x.c[0] < 10 ? 1 : 0)}</b></td>
            <td class="tq-k">${int(x.k)}</td>
            <td class="${x.k > F ? 'itm' : ''}"><b>${cell(x.p[0], x.p[0] < 10 ? 1 : 0)}</b></td><td class="${x.k > F ? 'itm' : ''}">${cell(x.p[1])}</td><td class="${x.k > F ? 'itm' : ''}">${cell(x.p[2])}</td><td class="${x.k > F ? 'itm' : ''}">${x.p[3] ? pct(x.p[3]) : '—'}</td>
          </tr>`).join('')}</tbody>`;
        document.getElementById('tqToggle').textContent = showAll ? '只顯示價平上下 15 檔' : '顯示全部履約價';
      }
      // 分頁切換(記住上次的分頁)
      let calcReady = false;
      const showTab = t => {
        LT.view(el.querySelector(`.mk-tabs [data-tab="${t}"] b`).textContent);   // 後台的熱門主題
        el.querySelectorAll('.mk-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
        el.querySelectorAll('.mk-pane').forEach(p => { p.hidden = p.dataset.pane !== t; });
        if (t === 'calc' && !calcReady) { calcReady = true; LTOpt.calculator(el.querySelector('[data-pane=calc]'), D); }
        try { localStorage.setItem('lt.optTab', t); } catch (e) {}
      };
      el.querySelector('.mk-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
      let saved = 'metrics'; try { saved = localStorage.getItem('lt.optTab') || 'metrics'; } catch (e) {}
      showTab(['metrics', 'chain', 'calc'].includes(saved) ? saved : 'metrics');
      pick.onchange = drawExpiry;
      document.getElementById('tqToggle').onclick = () => { showAll = !showAll; drawExpiry(); };
      drawExpiry();
    },
  });
})();
