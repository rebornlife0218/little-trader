/* 指數：模式四 台美股關係(那斯達克當天漲跌 → 隔天台灣加權的開盤跳空與收盤)
   美股收盤時台灣已是隔天清晨，所以台股每個交易日對應「前一個台股交易日(含)到當天(不含)之間」的那一場美股。
   這段期間美股不是剛好一場(美股休市、台股連假)的日子不列；開盤價等於昨收的日子是資料缺漏(例如 2011 年 1 月)，也不列。 */
const TWUS_SPANS = [{key:0, name:'全部'}, {key:20, name:'近20年'}, {key:10, name:'近10年'}, {key:5, name:'近5年'}];
// 那斯達克漲跌分組(單位 %)：跌的組含下緣(≤)，漲的組含下緣(≥)，和大漲大跌門檻的算法一致
const TWUS_BINS = [
  {name:'≤-3', test:r=>r<=-3}, {name:'-3~-2', test:r=>r>-3 && r<=-2}, {name:'-2~-1', test:r=>r>-2 && r<=-1}, {name:'-1~0', test:r=>r>-1 && r<0},
  {name:'0~1', test:r=>r>=0 && r<1}, {name:'1~2', test:r=>r>=1 && r<2}, {name:'2~3', test:r=>r>=2 && r<3}, {name:'≥3', test:r=>r>=3},
];
function computeTwus(tw, us){
  const out = [];
  let skipped = 0, bad = 0, j = 0;
  for (let i=1;i<tw.length;i++){
    const P = tw[i-1].date, T = tw[i].date;
    while (j<us.length && us[j].date<P) j++;
    let k = j, cnt = 0;
    while (k<us.length && us[k].date<T){ cnt++; k++; }
    if (cnt!==1 || j<1){ skipped++; continue; }
    const pc = tw[i-1].close, o = tw[i].open, c = tw[i].close;
    if (o===pc){ bad++; continue; }
    out.push({ idx:i, date:T, usDate:us[j].date, r:(us[j].close/us[j-1].close-1)*100, gap:o/pc-1, intra:c/o-1, day:c/pc-1, red:c>o, black:c<o });
  }
  return { events:out, skipped, bad };
}
function twusSummary(list){
  const m = list.length;
  if (!m) return {count:0, gap:NaN, gapUp:NaN, intra:NaN, red:NaN, black:NaN, up:NaN, day:NaN};
  const avg = f=>list.reduce((a,e)=>a+e[f],0)/m, rate = f=>list.filter(f).length/m;
  return { count:m, gap:avg('gap'), gapUp:rate(e=>e.gap>0), intra:avg('intra'), red:rate(e=>e.red), black:rate(e=>e.black), up:rate(e=>e.day>0), day:avg('day') };
}
function twusCorr(list, f){
  const m = list.length; if (m<2) return {corr:NaN, slope:NaN};
  const mx = list.reduce((a,e)=>a+e.r,0)/m, my = list.reduce((a,e)=>a+e[f]*100,0)/m;
  let sxx=0, syy=0, sxy=0;
  list.forEach(e=>{ const x=e.r-mx, y=e[f]*100-my; sxx+=x*x; syy+=y*y; sxy+=x*y; });
  return { corr:sxy/Math.sqrt(sxx*syy), slope:sxy/sxx };
}
function twusSpanList(events, span){
  if (!span || !events.length) return events;
  const last = events[events.length-1].date, cut = (+last.slice(0,4)-span)+last.slice(4);
  return events.filter(e=>e.date>cut);
}
function setTwusParam(field, value){ state.twusParams[field] = value; render(); }
function focusTwus(idx){
  const rows = state.data.TAIEX;
  state.view.TAIEX = {start:clamp(idx-60,0,rows.length-1), end:clamp(idx+60,0,rows.length-1)};
  state.cursor.TAIEX = idx;
  render();
  const c = document.getElementById('priceCanvas'); if (c) c.scrollIntoView({behavior:'smooth', block:'center'});
}
function renderTwus(){
  const tw = state.data.TAIEX, us = state.data.NASDAQ;
  if (!tw || !us){
    if (!state.twusErr && !state.twusLoading){
      state.twusLoading = true;
      Promise.all([loadIndex('TAIEX'), loadIndex('NASDAQ')]).catch(()=>{ state.twusErr = true; }).finally(()=>{ state.twusLoading = false; render(); });
    }
    return `<div class="panel"><div class="empty"><p>${state.twusErr?'資料載入失敗，請稍後重新整理頁面。':'正在載入那斯達克資料…'}</p></div></div>`;
  }
  if (!state.twus) state.twus = computeTwus(tw, us);
  const prm = state.twusParams, B = prm.big;
  const list = twusSpanList(state.twus.events, prm.span);
  if (!list.length) return `<div class="panel"><div class="empty"><p>沒有可以比對的資料。</p></div></div>`;
  const isDn = e=>e.r<=-B, isUp = e=>e.r>=B;
  const all = twusSummary(list), dn = twusSummary(list.filter(isDn)), up = twusSummary(list.filter(isUp));
  const pct = (v,d=2)=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v,d)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const plain = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td>${(v*100).toFixed(0)}%</td>`;
  const cells = s=>`<td>${s.count.toLocaleString('en-US')}</td>${pct(s.gap)}${win(s.gapUp)}${pct(s.intra)}${win(s.red)}${plain(s.black)}${win(s.up)}${pct(s.day)}`;
  const head = first=>`<thead><tr><th>${first}</th><th>次數</th><th>平均跳空</th><th>開高機率</th><th>開盤到收盤</th><th>收紅K</th><th>收黑K</th><th>收盤比昨收漲</th><th>當天平均漲跌</th></tr></thead>`;
  const few = s=> s.count && s.count<MYTH_FEW ? '，樣本少' : '';
  const pc0 = v=> Number.isNaN(v) ? '—' : (v*100).toFixed(0)+'%';
  const say = (name, s)=> s.count ? `<li><b>那斯達克${name} ${B}% 以上</b>(${s.count} 次${few(s)})：隔天台股平均跳空 ${fmtPct(s.gap,2)}，${pc0(s.gapUp)} 開高；開盤後收紅K ${pc0(s.red)}、收黑K ${pc0(s.black)}，最後 ${pc0(s.up)} 比昨收漲，當天平均 ${fmtPct(s.day,2)}。</li>` : `<li><b>那斯達克${name} ${B}% 以上</b>：這段期間沒有發生過。</li>`;
  const g = twusCorr(list,'gap'), it = twusCorr(list,'intra'), d = twusCorr(list,'day');
  const bins = TWUS_BINS.map(b=>({name:b.name, s:twusSummary(list.filter(e=>b.test(e.r)))}));
  state.twusCharts = bins;
  const spanRows = TWUS_SPANS.map(s=>{
    const L = twusSpanList(state.twus.events, s.key), a = twusSummary(L.filter(isDn)), b = twusSummary(L.filter(isUp));
    return `<tr class="${s.key===prm.span?'allrow':''}"><td>${s.name}</td><td>${a.count}</td>${pct(a.gap)}${win(a.red)}${win(a.up)}<td>${b.count}</td>${pct(b.gap)}${win(b.red)}${win(b.up)}</tr>`;
  }).join('');
  const recent = list.filter(e=>isDn(e)||isUp(e)).slice(-20).reverse();
  return `
    <div class="panel">
      <h3>統計設定</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>統計期間 <b>${list[0].date} ~ ${list[list.length-1].date}</b></label>
          <div class="btnrow-l">${TWUS_SPANS.map(s=>`<button class="${prm.span===s.key?'active':''}" onclick="setTwusParam('span',${s.key})">${s.name}</button>`).join('')}</div>
        </div>
        <div class="paramitem">
          <label>大漲大跌的門檻 <b>${B}%</b></label>
          <input type="range" min="1" max="5" step="0.5" value="${B}"
            onchange="setTwusParam('big',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
      </div>
      <div class="note">台股每天對應前一晚的美股(週一對週五)。跳空＝開盤 ÷ 昨收 − 1；開盤到收盤＝收盤 ÷ 開盤 − 1；紅K＝收盤高於開盤，黑K反之。連假前後美股不是剛好一場的 ${state.twus.skipped} 天、開盤價缺漏的 ${state.twus.bad} 天不列。</div>
    </div>

    <div class="panel">
      <h3>那斯達克大漲大跌，隔天台股怎麼走</h3>
      <div class="tablewrap"><table class="stattable">${head('那斯達克前一晚')}
        <tbody>
          <tr><td>大跌 ${B}% 以上</td>${cells(dn)}</tr>
          <tr><td>大漲 ${B}% 以上</td>${cells(up)}</tr>
          <tr class="allrow"><td>所有日子(基準)</td>${cells(all)}</tr>
        </tbody>
      </table></div>
      <ul class="insight">${say('大跌',dn)}${say('大漲',up)}</ul>
    </div>

    <div class="panel">
      <h3>不同期間的比較</h3>
      <div class="tablewrap"><table class="stattable">
        <thead>
          <tr><th rowspan="2">期間</th><th colspan="4">那斯達克大跌 ${B}% 以上</th><th colspan="4">那斯達克大漲 ${B}% 以上</th></tr>
          <tr><th>次數</th><th>平均跳空</th><th>收紅K</th><th>收盤比昨收漲</th><th>次數</th><th>平均跳空</th><th>收紅K</th><th>收盤比昨收漲</th></tr>
        </thead>
        <tbody>${spanRows}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <h3>那斯達克漲跌幅分組</h3>
      <div id="twusGap"></div>
      ${LTChart.legend([{name:'平均跳空(紅漲綠跌)', color:'var(--up)'}, {name:'開盤到收盤', color:'var(--blue)'}])}
      <div id="twusRed" style="margin-top:16px"></div>
      ${LTChart.legend([{name:'收紅K機率', color:'var(--up)'}, {name:'收盤比昨收漲的機率', color:'var(--amber)'}])}
      <div class="tablewrap"><table class="stattable">${head('那斯達克(%)')}
        <tbody>${bins.map(b=>`<tr><td>${b.name}</td>${cells(b.s)}</tr>`).join('')}</tbody>
      </table></div>
      <ul class="insight">
        <li><b>和開盤跳空</b>：相關係數 ${g.corr.toFixed(2)}，那斯達克每漲跌 1%，台股開盤平均跟著動 ${g.slope.toFixed(2)}%。</li>
        <li><b>和開盤到收盤</b>：相關係數 ${it.corr.toFixed(2)}；<b>和當天全日漲跌</b>：相關係數 ${d.corr.toFixed(2)}。</li>
      </ul>
    </div>

    <div class="panel">
      <h3>最近 ${recent.length} 次大漲大跌</h3>
      <div class="tablewrap"><table class="stattable">
        <thead><tr><th>台股日期</th><th>美股日期</th><th>那斯達克</th><th>台股跳空</th><th>開盤到收盤</th><th>K棒</th><th>當天漲跌</th></tr></thead>
        <tbody>${recent.map(e=>`<tr class="click" onclick="focusTwus(${e.idx})"><td>${e.date}</td><td>${e.usDate}</td>${pct(e.r/100)}${pct(e.gap)}${pct(e.intra)}<td class="${e.red?'up':e.black?'down':''}">${e.red?'紅K':e.black?'黑K':'平'}</td>${pct(e.day)}</tr>`).join('')}</tbody>
      </table></div>
      <div class="note">點選列可在K線圖上定位。歷史統計不代表未來。</div>
    </div>`;
}
function drawTwusCharts(){
  const C = state.twusCharts, a = document.getElementById('twusGap'), b = document.getElementById('twusRed');
  if (!C || !a || !b) return;
  const x = C.map(g=>g.name), S = C.map(g=>g.s);
  LTChart.bars(a, { x, xFmt:v=>v, xAll:true, title:'橫軸：那斯達克前一晚漲跌(%)', label:'那斯達克各漲跌幅分組，隔天台股的平均跳空與開盤到收盤', height:260, yFmt:v=>(v*100).toFixed(1)+'%', refY:[{y:0}],
    tipFmt:(s,v,i)=>`${fmtPct(v,2)}(${S[i].count} 次)`,
    series:[{name:'平均跳空', y:S.map(s=>s.gap), color:'var(--up)', colors:S.map(s=>s.gap>=0?'var(--up)':'var(--down)')},
            {name:'開盤到收盤', y:S.map(s=>s.intra), color:'var(--blue)'}] });
  LTChart.bars(b, { x, xFmt:v=>v, xAll:true, title:'橫軸：那斯達克前一晚漲跌(%)', label:'那斯達克各漲跌幅分組，隔天台股收紅K與收盤比昨收漲的機率', height:220, yFmt:v=>(v*100).toFixed(0)+'%', refY:[{y:0.5}],
    tipFmt:(s,v,i)=>`${(v*100).toFixed(0)}%(${S[i].count} 次)`,
    series:[{name:'收紅K', y:S.map(s=>s.red), color:'var(--up)'},
            {name:'收盤比昨收漲', y:S.map(s=>s.up), color:'var(--amber)'}] });
}
