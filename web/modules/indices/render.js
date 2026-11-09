/* 指數(7/7)：畫面(各模式、K棒型態總覽)與註冊到側欄 */
/* ============================== 主渲染 ============================== */
/* K棒示意圖(SVG)：紅漲綠跌，淡色為前段走勢 */
function candleSVG(shape, vol, scale=1){
  const cw=12, gap=7, padX=6, priceH=60, volH=vol?16:0, H=priceH+(vol?volH+4:0)+4;
  const W = padX*2 + shape.length*cw + (shape.length-1)*gap;
  const y = v=>4 + (100-v)/100*priceH;
  let g='';
  shape.forEach((k,i)=>{
    const x = padX + i*(cw+gap), cx = x+cw/2;
    const col = k.c>k.o ? 'var(--candle-up)' : k.c<k.o ? 'var(--candle-down)' : 'var(--dim)';
    const op = k.ctx ? 0.35 : 1;
    const top = y(Math.max(k.o,k.c)), bot = y(Math.min(k.o,k.c));
    g += `<g opacity="${op}"><line x1="${cx}" x2="${cx}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${col}" stroke-width="1.6"/>`
       + `<rect x="${x}" y="${top}" width="${cw}" height="${Math.max(bot-top,1.6)}" rx="1.5" fill="${col}"/></g>`;
    if (vol){
      const vh = vol[i]/100*volH;
      g += `<rect x="${x+1}" y="${H-2-vh}" width="${cw-2}" height="${vh}" rx="1" fill="${col}" opacity="${k.ctx?0.3:0.75}"/>`;
    }
  });
  return `<svg class="kshape" width="${W*scale}" height="${H*scale}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
}
function biasTag(bias){
  const cls = bias==='偏多'?'yes':bias==='偏空'?'no':'na';
  return `<span class="tag ${cls}">${bias}</span>`;
}
function togglePattern(k){ state.openPattern = state.openPattern===k ? null : k; render(); }
function renderCandleTheme(){
  const key = state.active;
  const patterns = state.candlePatterns[key];
  if (!patterns) return `<div class="panel"><div class="note">尚未計算型態資料。</div></div>`;
  const cp = state.candleParams[key] || DEFAULT_CANDLE_PARAMS;
  const hasVol = (state.meta[key]||{}).hasVolume;

  let html = `
    <div class="panel">
      <h3>型態判定參數</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>長紅／長黑門檻(實體／開盤價) <b>${cp.longBodyPct}%</b></label>
          <input type="range" min="0.3" max="5" step="0.1" value="${cp.longBodyPct}"
            onchange="setCandleParam('${key}','longBodyPct',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
        <div class="paramitem">
          <label>長影線門檻(佔當天振幅) <b>${cp.longShadowPct}%</b></label>
          <input type="range" min="10" max="80" step="1" value="${cp.longShadowPct}"
            onchange="setCandleParam('${key}','longShadowPct',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
        <div class="paramitem">
          <label>爆量倍數(相對前${VOL_SPIKE_LOOKBACK}日均量) <b>${cp.volumeSpikeFactor}x</b></label>
          <input type="range" min="1.1" max="4" step="0.1" value="${cp.volumeSpikeFactor}"
            onchange="setCandleParam('${key}','volumeSpikeFactor',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'x'">
        </div>
      </div>
      <div class="note">長紅/長黑：實體(｜收盤－開盤｜)占開盤價的比例達門檻。小實體：未達門檻的4成。長影線：影線占當天振幅(最高－最低)的比例達門檻。爆量：成交量達前${VOL_SPIKE_LOOKBACK}日均量的設定倍數。「前段下跌/上漲」：收盤比5天前低(高)，且在20日線之下(上)。</div>
    </div>

    <div class="panel">
      <h3>型態總覽(點選型態查看詳細統計)</h3>
      <div class="tablewrap">
        <table class="pattable">
          <thead><tr><th>圖示</th><th>型態</th><th>類型</th><th>出現次數</th><th>10日上漲機率</th><th>平均10日報酬</th><th></th></tr></thead>
          <tbody>
          ${CANDLE_GROUPS.filter(g=>hasVol || g.key!=='volume').map(g=>`
            <tr class="grouprow"><td colspan="7">${g.name}</td></tr>
            ${CANDLE_PATTERNS.filter(p=>p.group===g.key).map(p=>{
              const occ = patterns[p.key];
              const s = summarizePatternGroup(occ);
              const open = state.openPattern===p.key;
              return `<tr class="patrow ${open?'open':''}" onclick="togglePattern('${p.key}')">
                <td class="kcell">${candleSVG(p.shape, p.vol, 0.75)}</td>
                <td style="font-family:var(--font-body);font-weight:600;">${p.name}</td>
                <td>${biasTag(p.bias)}</td>
                <td>${s.count}</td>
                <td class="${s.win10>=0.5?'up':'down'}">${Number.isNaN(s.win10)?'—':(s.win10*100).toFixed(0)+'%'}</td>
                <td class="${s.avg10>=0?'up':'down'}">${fmtPct(s.avg10)}</td>
                <td class="chev">${open?'▴':'▾'}</td>
              </tr>
              ${open ? `<tr class="patdetail"><td colspan="7">${renderPatternDetail(p, occ)}</td></tr>` : ''}`;
            }).join('')}`).join('')}
          </tbody>
        </table>
      </div>
      <div class="note">10日上漲機率＝型態出現後第10個交易日收盤高於當天收盤的比例。</div>
    </div>
  `;
  return html;
}
// 展開的型態：說明 + 依市場環境分組的 +5/+10 日統計表
function renderPatternDetail(p, occ){
  const groups = [
    {name:'全部', list:occ, color:'var(--amber)'},
    {name:'多頭', list:occ.filter(e=>e.regime==='多頭'), color:'var(--up)'},
    {name:'盤整', list:occ.filter(e=>e.regime==='盤整'), color:'var(--mute)'},
    {name:'空頭', list:occ.filter(e=>e.regime==='空頭'), color:'var(--down)'},
  ];
  const pctCell = (v, signed=true)=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${signed?fmtPct(v):(v*100).toFixed(0)+'%'}</td>`;
  const winCell = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const last = occ.length ? occ[occ.length-1].date : null;
  return `<div class="patdetail-inner">
    <div class="pat-explain">
      ${candleSVG(p.shape, p.vol, 1.4)}
      <div>
        <p class="pat-meaning"><b>${p.name}</b> ${biasTag(p.bias)}　${p.meaning}</p>
        <p class="note" style="margin:6px 0 0;">判定條件：${p.rule}${last?`　·　最近一次出現：${last}`:''}</p>
      </div>
    </div>
    <div class="tablewrap">
      <table class="stattable">
        <thead>
          <tr><th rowspan="2">市場環境</th><th rowspan="2">次數</th><th colspan="2">勝率(上漲機率)</th><th colspan="2">平均報酬率</th><th colspan="2">乖離率(20MA)</th><th colspan="2">乖離率(60MA)</th></tr>
          <tr><th>+5日</th><th>+10日</th><th>+5日</th><th>+10日</th><th>+5日</th><th>+10日</th><th>+5日</th><th>+10日</th></tr>
        </thead>
        <tbody>
          ${groups.map(g=>{ const s=summarizePatternGroup(g.list); return `<tr class="${g.name==='全部'?'allrow':''}">
            <td><i class="dot" style="background:${g.color}"></i> ${g.name}</td>
            <td>${s.count}</td>
            ${winCell(s.win5)}${winCell(s.win10)}
            ${pctCell(s.avg5)}${pctCell(s.avg10)}
            ${pctCell(s.avgB20_5)}${pctCell(s.avgB20_10)}
            ${pctCell(s.avgB60_5)}${pctCell(s.avgB60_10)}
          </tr>`; }).join('')}
        </tbody>
      </table>
    </div>
    <div class="note">市場環境依上方「多空定義」判定型態出現當天的狀態。乖離率＝型態出現後第5/10個交易日收盤價相對當時均線的偏離幅度，正值代表在均線之上。</div>
  </div>`;
}

const THEMES = [
  {key:'crash', name:'大盤漲跌分析'},
  {key:'candle', name:'K棒型態分析'},
];
const MODES = [
  {key:'crash', name:'跌深反彈', desc:'急跌事件的底部、反彈報酬與量能結構'},
  {key:'myth', name:'常見迷思', desc:'均線的支撐與壓力、520 行情'},
  {key:'cycle', name:'週期性分析', desc:'月初/月中/月底、週一~週五漲跌與總統選舉'},
  {key:'twus', name:'台美股關係', desc:'那斯達克大漲大跌，隔天台股怎麼開、怎麼收'},
];
// 換子主題或換頁都回到台灣加權；同一個子主題裡選的指數，調參數時不會變
const resetIndex = ()=>{ if (state.data.TAIEX) state.active = 'TAIEX'; };
const isTwus = ()=> state.theme==='crash' && state.mode==='twus';   // 這個模式固定比較台灣加權與那斯達克，不能切換指數
function render(){
  const app = document.getElementById('app');
  if (!app) return; // 目前不在指數頁面
  const themeName = (THEMES.find(t=>t.key===state.theme)||THEMES[0]).name;

  if (state.dataStatus==='loading'){
    app.innerHTML = `<div class="panel"><div class="empty"><p>正在載入最新指數資料…</p></div></div>`;
    return;
  }
  if (isTwus() && state.data.TAIEX) state.active = 'TAIEX';
  if (state.active && state.data[state.active]) ensureComputed(state.active);
  const rows = state.active ? state.data[state.active] : null;
  const meta = state.active ? (state.meta[state.active]||{hasOHLC:true,hasVolume:true,name:state.active}) : null;
  const params = state.active ? state.params[state.active] : null;
  const events = state.active ? (state.events[state.active]||[]) : [];
  const dm = state.dataMeta;
  const updatedLine = dm ? LT.sourceLine(dm)
    : (state.dataStatus==='error' ? `<div class="updated">無法載入資料(${state.dataError||''})</div>` : '');
  const rd = regimeDef();

  // 大盤漲跌分析是目錄頁(頁首由 LT.catalog 畫)，這裡只放指數與多空定義的選單；K棒型態分析自己畫頁首
  const inCatalog = state.theme==='crash';
  let html = `
    ${inCatalog ? `<div class="idx-tools">${updatedLine}` : `<header class="top">
      <div>
        <h1>${themeName}</h1>
        <p>全球主要指數 · 1990 年起 · K棒型態統計研究</p>
        ${updatedLine}
      </div>`}
      <div class="pickers">
        <div class="pickrow">
          <label for="indexPick">指數</label>
          <select id="indexPick" class="indexpick" onchange="switchTab(this.value)" onfocus="prefetchIndices()" onpointerenter="prefetchIndices()" ${isTwus()?'disabled':''}>
            ${state.indexList.map(c=>`<option value="${c.key}" ${c.key===state.active?'selected':''}>${c.name}${state.data[c.key]?' · '+state.data[c.key].length+'筆':''}</option>`).join('')}
          </select>
        </div>
        <div class="pickrow">
          <label for="regimePick">多空定義</label>
          <select id="regimePick" class="indexpick" onchange="setRegimeDef(this.value)">
            ${REGIME_DEFS.map(d=>`<option value="${d.key}" ${d.key===rd.key?'selected':''}>${d.name}</option>`).join('')}
          </select>
        </div>
      </div>
    ${inCatalog ? '</div>' : '</header>'}
    <div class="regime-note"><b>多頭 / 盤整 / 空頭：</b>${rd.desc}</div>
  `;

  if (!state.active || !rows){
    html += state.loading[state.active]
      ? `<div class="panel"><div class="empty"><p>正在載入「${TICKER_NAMES[state.active]||state.active}」資料…</p></div></div>`
      : `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>目前無法取得指數資料，請稍後重新整理頁面。${state.dataError?'('+state.dataError+')':''}</p></div></div>`;
    app.innerHTML = html;
    return;
  }

  const idxName = (state.indexList.find(c=>c.key===state.active)||{}).name || state.active;
  if (state.theme==='candle'){
    LT.view(idxName);   // 後台的熱門主題
    html += renderCandleTheme();
    app.innerHTML = html;
    return;
  }

  const mode = MODES.find(m=>m.key===state.mode) || MODES[0];
  if (state.catView) state.catView(idxName);   // 後台的熱門主題(目錄頁已記到「子主題」，這裡再記一層指數)
  html += `
    ${(!meta.hasVolume && mode.key==='crash') ? `<div class="banner info">此資料集沒有成交量欄位，量能比值分析已停用。</div>` : ''}

    <div class="panel">
      <div class="chartbar">
        <h3 style="margin:0;">${meta.name} · K線圖${mode.key==='crash'?'(標記急跌事件)':''}</h3>
        <div class="zoomrow">
          <button onclick="setZoomPreset('${state.active}','all')">全部</button>
          <button onclick="setZoomPreset('${state.active}',1250)">5年</button>
          <button onclick="setZoomPreset('${state.active}',500)">2年</button>
          <button onclick="setZoomPreset('${state.active}',250)">1年</button>
          <button onclick="setZoomPreset('${state.active}',60)">3個月</button>
        </div>
      </div>
      <div id="ohlcInfo" class="ohlc-info"></div>
      <div class="chartwrap">
        <canvas id="priceCanvas"></canvas>
        ${meta.hasVolume ? `<canvas id="volCanvas"></canvas>` : ''}
      </div>
      <div class="legend">
        ${mode.key==='crash' ? `
        <span><i class="dot" style="background:var(--candle-down)"></i>起跌點(峰)</span>
        <span><i class="dot" style="background:var(--blue)"></i>底部</span>
        <span><i class="dot" style="background:var(--candle-up)"></i>回到起跌點</span>
        <span><i class="dot" style="background:var(--amber)"></i>創歷史新高</span>
        <span><i class="dot" style="background:var(--candle-down);opacity:.45"></i>下跌區間</span>
        <span><i class="dot" style="background:var(--candle-up);opacity:.45"></i>反彈區間</span>` : ''}
        ${MA_PERIODS.map(p=>`<span><i class="dot" style="background:var(--ma${p})"></i>${p}MA</span>`).join('')}
        ${meta.hasVolume ? `<span><i class="dot" style="background:var(--ma5)"></i>成交量${VOL_MA}MA</span>` : ''}
        <span style="color:var(--mute)">滾輪縮放 · 拖曳平移 · 點K棒看開高低收量</span>
      </div>
    </div>
  `;

  if (mode.key==='crash'){
    html += `
    <div class="panel paramfold ${paramFoldCls()}">
      ${paramFoldHead('偵測參數')}
      <div class="paramfold-body">
      <div class="paramgrid">
        <div class="paramitem">
          <label>急跌幅度門檻 <b>${params.dropPct}%</b></label>
          <input type="range" min="-30" max="-5" step="1" value="${params.dropPct}"
            onchange="setParam('${state.active}','dropPct',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
        <div class="paramitem">
          <label>天數窗口(交易日) <b>${params.windowDays}</b></label>
          <input type="range" min="2" max="20" step="1" value="${params.windowDays}"
            onchange="setParam('${state.active}','windowDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value">
        </div>
        <div class="paramitem">
          <label>底部搜尋範圍(交易日) <b>${params.bottomSearchDays}</b></label>
          <input type="range" min="10" max="250" step="5" value="${params.bottomSearchDays}"
            onchange="setParam('${state.active}','bottomSearchDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value">
        </div>
        <div class="paramitem">
          <label>後續追蹤天數(交易日) <b>${params.followUpDays}</b></label>
          <input type="range" min="60" max="750" step="10" value="${params.followUpDays}"
            onchange="setParam('${state.active}','followUpDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value">
        </div>
      </div>
      <div class="note">急跌＝「天數窗口」內從高點跌超過「急跌幅度門檻」；起跌點＝窗口內最高收盤，底部＝之後「底部搜尋範圍」內的最低價。反彈成功分「回到起跌點」與「創歷史新高」兩種。量比＝下跌期間總量 ÷ 反彈期間(相同天數)總量。</div>
      </div>
    </div>

    ${renderCrashStats(events, meta)}

    <div class="panel">
      <h3>急跌事件明細</h3>
      <div class="note" style="margin-top:0;margin-bottom:10px;">谷底乖離率＝底部收盤相對均線的偏離，越負跌得越深。+N日報酬以底部當天收盤為基準。</div>
      <div class="tablewrap">
        <table>
          <thead><tr>
            <th>起跌日</th><th>起跌前高</th><th>底部日</th><th>底部價</th><th>跌幅</th><th>到底天數</th>
            <th>谷底乖離率(20MA)</th><th>谷底乖離率(60MA)</th>
            ${meta.hasVolume?'<th>量比(跌/漲)</th>':''}
            <th>+5日報酬</th><th>+10日報酬</th><th>+20日報酬</th><th>+60日報酬</th><th>回起跌點天數</th><th>創新高天數</th>
          </tr></thead>
          <tbody>
            ${events.map((ev,ei)=>`
              <tr onclick="focusEvent('${state.active}', ${ei})">
                <td>${rows[ev.peakIdx].date}</td>
                <td>${fmtNum(ev.peakVal, ev.peakVal>1000?0:2)}</td>
                <td>${rows[ev.bottomIdx].date}</td>
                <td>${fmtNum(ev.bottomVal, ev.bottomVal>1000?0:2)}</td>
                <td class="down">${fmtPct(ev.dropActual)}</td>
                <td>${ev.daysToBottom}</td>
                <td class="${ev.bias20<=0?'down':'up'}">${fmtPct(ev.bias20)}</td>
                <td class="${ev.bias60<=0?'down':'up'}">${fmtPct(ev.bias60)}</td>
                ${meta.hasVolume?`<td>${ratioCell(ev.ratio)}</td>`:''}
                <td class="${ev.ret5>=0?'up':'down'}">${fmtPct(ev.ret5)}</td>
                <td class="${ev.ret10>=0?'up':'down'}">${fmtPct(ev.ret10)}</td>
                <td class="${ev.ret20>=0?'up':'down'}">${fmtPct(ev.ret20)}</td>
                <td class="${ev.ret60>=0?'up':'down'}">${fmtPct(ev.ret60)}</td>
                <td>${ev.daysToRecover ?? '<span class="tag na">未回</span>'}</td>
                <td>${ev.newHighIdx>-1 ? ev.daysToNewHigh : '<span class="tag na">未創</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  } else if (mode.key==='myth'){
    html += renderMyth();
  } else if (mode.key==='cycle'){
    html += renderCycle();
  } else if (mode.key==='twus'){
    html += renderTwus();
  } else {
    html += LT.UNDER_CONSTRUCTION;
  }

  app.innerHTML = html;
  updateOhlcInfo();
  requestAnimationFrame(()=>drawChart(state.active));
  if (mode.key==='cycle') drawCycleCharts();
  if (mode.key==='twus') drawTwusCharts();
}

// 跌深反彈統計表：與K棒型態分析相同的表格呈現
function renderCrashStats(events, meta){
  const withRatio = events.filter(e=>!Number.isNaN(e.ratio));
  const groups = [{name:'全部事件', list:events, color:'var(--amber)', cls:'allrow'}];
  if (meta.hasVolume && withRatio.length>=2){
    groups.push({head:'依反彈量能'});
    groups.push({name:'量增反彈', hint:'反彈量 ≥ 下跌量', list:withRatio.filter(e=>e.ratio<1), color:'var(--up)'});
    groups.push({name:'量縮反彈', hint:'反彈量 < 下跌量', list:withRatio.filter(e=>e.ratio>=1), color:'var(--down)'});
  }
  groups.push({head:'依底部當天市場環境'});
  [['多頭','var(--up)'],['盤整','var(--mute)'],['空頭','var(--down)']].forEach(([r,c])=>
    groups.push({name:r, list:events.filter(e=>e.bottomRegime===r), color:c}));
  const rows = groups.map(g=>g.head ? null : {...g, s:computeSummary(g.list)});
  const pct = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const prob = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td>${(v*100).toFixed(0)}%</td>`;
  const label = g=>`<td><i class="dot" style="background:${g.color}"></i> ${g.name}${g.hint?`<small class="hint-s">${g.hint}</small>`:''}</td><td>${g.s.count}</td>`;
  const body = (cols, render)=> groups.map((g,i)=> g.head
    ? `<tr class="grouphead"><td colspan="${cols}">${g.head}</td></tr>`
    : `<tr class="${g.cls||''}">${label(rows[i])}${render(rows[i].s)}</tr>`).join('');
  return `
    <div class="panel">
      <h3>統計結果(共 ${events.length} 筆急跌事件)</h3>
      <div class="tablewrap">
        <table class="stattable">
          <thead>
            <tr><th rowspan="2">分組</th><th rowspan="2">次數</th><th colspan="4">勝率(上漲機率)</th><th colspan="4">平均報酬率</th>
              <th colspan="2">谷底乖離率</th><th colspan="2">反彈無力乖離率</th><th rowspan="2">後續創<br>歷史新高</th><th rowspan="2">回到起跌點後<br>又跌回去</th></tr>
            <tr><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th>
              <th>20MA</th><th>60MA</th><th>20MA</th><th>60MA</th></tr>
          </thead>
          <tbody>${body(16, s=>win(s.win5)+win(s.win10)+win(s.win20)+win(s.win60)+pct(s.avg5)+pct(s.avg10)+pct(s.avg20)+pct(s.avg60)
            +pct(s.avgBias20)+pct(s.avgBias60)+pct(s.avgStallBias20)+pct(s.avgStallBias60)+prob(s.newHighProb)+prob(s.reDeclineProb))}</tbody>
        </table>
      </div>
      <div class="note">勝率與報酬以底部當天收盤為基準。反彈無力乖離率＝反彈中第一次從高點拉回 ${(STALL_PULLBACK_PCT*100).toFixed(0)}% 時，該高點相對均線的偏離(一路沒拉回的不計)。量能分組依下跌期間 ÷ 反彈期間的總量比。樣本少時僅供參考。</div>
    </div>`;
}
function ratioCell(ratio){
  if (Number.isNaN(ratio)) return '<span class="tag na">N/A</span>';
  const downShare = clamp(ratio/(ratio+1),0.05,0.95)*100;
  return `<span class="mono">${fmtNum(ratio,2)}</span> <span class="mini-split"><div style="width:${downShare}%;background:var(--down)"></div><div style="width:${100-downShare}%;background:var(--up)"></div></span>`;
}

async function switchTab(key){
  state.active = key;
  if (!state.data[key]){
    render(); // 顯示載入中
    try{ await loadIndex(key); }catch(e){ state.dataError = String(e.message||e); }
  }
  render();
}

window.addEventListener('resize', ()=>{ if(document.getElementById('app') && state.active && state.data[state.active]) drawChart(state.active); });

/* ============================== 註冊到 Little Trader ==============================
   大盤漲跌分析：目錄頁(LT.catalog，同 ETF大禮包的卡片)，每個子主題一張卡片，網址 index/crash/<子主題>；K棒型態分析：一般頁面 */
let _indicesBooted = false;
function mountIndices(container, theme, mode, view){
  container.innerHTML = '<div id="app"></div>';
  const switched = state.theme !== theme;
  state.theme = theme;
  if (switched) Object.keys(state.data).forEach(k=>{ state.view[k] = defaultView(k); });   // 換頁面就回到該頁的預設範圍(大盤漲跌分析近一年、K棒型態分析全部)
  if (mode) state.mode = mode;
  state.catView = view || null;
  resetIndex();
  if (!_indicesBooted){ _indicesBooted = true; init(); } else { render(); }
}
LT.catalog({ section:'index', key:'crash', name:'大盤漲跌分析',
  desc:'全球主要指數 · 1990 年起 · 跌深反彈、均線支撐壓力、週期性、台美股關係、國安基金進場與限空令、大跌反彈和融資',
  groups:[{ name:'', items: [...MODES.map(m=>({ key:m.key, name:m.name, desc:m.desc,
    topics: INDICES.map(c=>c.name),   // 後台熱門主題列出的子項目(名稱要和 render() 裡記錄的指數一樣)
    run:(el, ctx)=>mountIndices(el, 'crash', m.key, ctx.view) })),
    // 研究報告(nsf.js、margin.js)：上半部公開、完整報告要登入
    { key:'nsf', name:'國安基金進場與限空令', desc:'歷次進場時跌破哪些長期均線、離高點多遠，以及進場後、限空令生效後的走勢', report:true,
      run:(el, ctx)=>LTNSF.run(el, ctx) },
    { key:'margin', name:'大跌反彈和融資的關係', desc:'指數跌深、融資被大量砍掉之後，加權指數是不是比較容易反彈', report:true,
      run:(el, ctx)=>LTMargin.run(el, ctx) }] }] });
LT.register({ section:'index', key:'candle', name:'K棒型態分析', mount: el=>mountIndices(el,'candle'), topics: INDICES.map(c=>c.name) });
