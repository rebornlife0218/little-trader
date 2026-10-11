/* 股票 · 美股 · 策略：S&P500 成分股的四種季度換股策略與 SPY 買進持有的回測比較
   回測結果與圖檔來自操盤人講堂第一組 2025.05 的專題(原 Other_Financial/S&P500，以 Streamlit 展示)
   圖檔：web/content/stock/sp500/Strategy1~4.jpg；新增策略只要在 STRATS 加一筆並放上圖檔 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // ret 年化報酬、vol 年化波動、sharpe 夏普值、mdd 最大回撤
  const SPY = { name: 'SPY 買進持有', ret: 0.0725, vol: 0.1405, sharpe: 0.37, mdd: -0.4596 };
  const STRATS = [
    { key: 1, name: '策略一：上季贏家', short: '上一季報酬最好的 10 檔，等權重持有', ret: 0.0938, vol: 0.3479, sharpe: 0.21, mdd: -0.7427,
      idea: '動能(momentum)：漲多的股票繼續漲。' },
    { key: 2, name: '策略二：上季輸家', short: '上一季報酬最差的 10 檔，等權重持有', ret: -0.0875, vol: 0.4901, sharpe: -0.22, mdd: -0.9708,
      idea: '反轉(reversal)：跌深的股票會反彈。' },
    { key: 3, name: '策略三：上季高夏普＋最佳化', short: '上一季夏普值最好的 20 檔，再以極大化夏普值為目標分配權重', ret: 0.1049, vol: 0.2811, sharpe: 0.30, mdd: -0.6747,
      idea: '風險調整後的動能，再用平均數–變異數最佳化決定權重。' },
    { key: 4, name: '策略四：上季贏家中低波動', short: '上一季報酬最好的 20 檔，從中再篩選波動率較小的 10 檔', ret: 0.0270, vol: 0.3209, sharpe: 0.02, mdd: -0.9390,
      idea: '動能＋低波動：想保留漲勢又降低風險。' },
  ];
  const pct = (v, d = 2) => (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const better = (v, spy, higherIsBetter = true) => (higherIsBetter ? v > spy : v < spy) ? 'beat' : '';

  LT.register({
    section: 'stock', group: '美股', key: 'us-strategy', name: '策略',
    mount(el) {
      el.innerHTML = `
        <header class="top"><div>
          <h1>美股策略：S&amp;P500 季度換股</h1>
          <p>每季依上一季的表現挑選 S&amp;P500 成分股，與買進持有 SPY 比較報酬與風險</p>
        </div></header>
        <div class="panel">
          <h3>四種策略與 SPY 的回測比較</h3>
          <div class="tablewrap"><table class="stattable us-strat">
            <thead><tr><th>策略</th><th>選股規則</th><th>年化報酬</th><th>年化波動</th><th>夏普值</th><th>最大回撤</th></tr></thead>
            <tbody>
              ${STRATS.map(s => `<tr data-k="${s.key}" class="click"><td>${esc(s.name)}</td><td style="text-align:left">${esc(s.short)}</td>
                <td class="${cls(s.ret)} ${better(s.ret, SPY.ret)}">${pct(s.ret)}</td><td class="${better(s.vol, SPY.vol, false)}">${(s.vol * 100).toFixed(2)}%</td>
                <td class="${better(s.sharpe, SPY.sharpe)}">${s.sharpe.toFixed(2)}</td><td class="down ${better(s.mdd, SPY.mdd)}">${pct(s.mdd)}</td></tr>`).join('')}
              <tr class="allrow"><td>${SPY.name}</td><td style="text-align:left">買進 S&amp;P500 ETF 一直持有(比較基準)</td>
                <td class="up">${pct(SPY.ret)}</td><td>${(SPY.vol * 100).toFixed(2)}%</td><td>${SPY.sharpe.toFixed(2)}</td><td class="down">${pct(SPY.mdd)}</td></tr>
            </tbody>
          </table></div>
          <p class="note">粗體底線表示該項優於 SPY。點選任一列可看該策略的累積報酬圖。夏普值 = (年化報酬 − 無風險利率) ÷ 年化波動，衡量每承擔一單位風險得到多少報酬。</p>
          <ul class="insight">
            <li><b>年化報酬</b>：策略一、三高於 SPY(9.38%、10.49% vs 7.25%)，但波動是 SPY 的 2～2.5 倍。</li>
            <li><b>風險調整後</b>：四種策略的夏普值都<b>低於</b> SPY 的 0.37，最大回撤也都比 SPY 的 −46% 深得多；多賺的報酬不足以補償多承擔的風險。</li>
            <li><b>反轉策略(策略二)</b>：買上一季最差的股票，年化 −8.75%、最大回撤 −97%，季度尺度上「跌深反彈」並不成立。</li>
            <li><b>低波動篩選(策略四)</b>沒有降低風險：只從 20 檔贏家裡挑，分散不足，波動與回撤仍然很大。</li>
          </ul>
        </div>
        <div class="panel">
          <div class="mode-tabs us-tabs">${STRATS.map((s, i) => `<button class="mode-tab ${i === 0 ? 'active' : ''}" data-k="${s.key}"><b>${esc(s.name)}</b><small>${esc(s.idea)}</small></button>`).join('')}</div>
          <div id="usDetail"></div>
        </div>
        <div class="panel doc">
          <h3>說明</h3>
          <ul>
            <li><b>回測方式</b>：每季初依上一季的報酬、夏普值或波動率挑選 S&amp;P500 成分股，持有一季後再重新挑選；比較基準為同期間買進持有 SPY。回測期間約 2000～2025 年(見圖)。</li>
            <li><b>解讀時要注意</b>：歷史回測不代表未來；若選股時用的是目前的成分股名單，會有倖存者偏差(早期被剔除、下市的公司沒被選進來)，讓回測結果偏好；未計入的交易成本、稅與滑價，在每季大量換股時影響更明顯。</li>
            <li>資料來源：操盤人講堂第一組 2025.05 專題成果，原以 Streamlit 網頁展示，本頁改以網站內建頁面呈現。</li>
          </ul>
        </div>`;
      const detail = k => {
        const s = STRATS.find(x => x.key === k);
        el.querySelectorAll('.us-tabs .mode-tab').forEach(b => b.classList.toggle('active', +b.dataset.k === k));
        el.querySelector('#usDetail').innerHTML = `
          <div class="statgrid" style="margin:12px 0;">
            <div class="stat"><div class="v ${cls(s.ret)}">${pct(s.ret)}</div><div class="l">年化報酬 · SPY ${pct(SPY.ret)}</div></div>
            <div class="stat"><div class="v">${(s.vol * 100).toFixed(1)}%</div><div class="l">年化波動 · SPY ${(SPY.vol * 100).toFixed(1)}%</div></div>
            <div class="stat"><div class="v">${s.sharpe.toFixed(2)}</div><div class="l">夏普值 · SPY ${SPY.sharpe.toFixed(2)}</div></div>
            <div class="stat"><div class="v down">${pct(s.mdd, 1)}</div><div class="l">最大回撤 · SPY ${pct(SPY.mdd, 1)}</div></div>
          </div>
          <p><b>選股規則</b>：${esc(s.short)}。${esc(s.idea)}</p>
          <figure class="md-fig"><img src="content/stock/sp500/Strategy${s.key}.jpg" alt="${esc(s.name)} 與 SPY 買進持有的累積報酬" loading="lazy" style="width:100%;max-width:900px;"><figcaption>${esc(s.name)} 與 SPY 買進持有的累積報酬(%)</figcaption></figure>`;
      };
      el.querySelector('.us-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) detail(+b.dataset.k); };
      el.querySelectorAll('.us-strat tr[data-k]').forEach(tr => tr.onclick = () => { detail(+tr.dataset.k); el.querySelector('.us-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      detail(1);
    },
  });
})();
