/* 指數：模式四 台美股關係(那斯達克 → 下一個交易日的台灣加權：開盤跳空、收盤、相關性)
   美股收盤時台灣已是隔天清晨，所以台股每個交易日對應「前一個台股交易日(含)到當天(不含)之間」的美股。
   平常日剛好一場；台股休市(過年、連假、颱風假)時美股可能有好幾場，用這段期間的累積漲跌，另外分組，不混進平常日的統計。
   這段期間美股一場都沒有(美股休市)的日子，台股沒有新的美股消息，不列；開盤價等於昨收的日子是資料缺漏，也不列。 */
const TWUS_SPANS = [{key:0, name:'全部'}, {key:20, name:'近20年'}, {key:10, name:'近10年'}, {key:5, name:'近5年'}];
const TWUS_COMPARE_SPANS = [...TWUS_SPANS, {key:2, name:'近2年'}, {key:1, name:'近1年'}];   // 不同期間的比較多看最近兩段
// 那斯達克漲跌分組(單位 %)：跌的組含下緣(≤)，漲的組含下緣(≥)，和大漲大跌門檻的算法一致
const TWUS_BINS = [
  {name:'≤-3', test:r=>r<=-3}, {name:'-3~-2', test:r=>r>-3 && r<=-2}, {name:'-2~-1', test:r=>r>-2 && r<=-1}, {name:'-1~0', test:r=>r>-1 && r<0},
  {name:'0~1', test:r=>r>=0 && r<1}, {name:'1~2', test:r=>r>=1 && r<2}, {name:'2~3', test:r=>r>=2 && r<3}, {name:'≥3', test:r=>r>=3},
];
// 台北市停班、股市全日休市的颱風假。資料裡看不出休市原因，所以列日期；有新的颱風假要加在這裡
const TW_TYPHOON = new Set([
  '1996-07-31','1996-08-01','1997-08-18','1997-08-29','1998-10-16',
  '2000-08-23','2001-07-30','2001-09-17','2001-09-18','2002-09-06','2004-08-24','2004-08-25','2004-10-25',
  '2005-07-18','2005-08-05','2005-09-01','2007-09-18','2008-07-28','2008-09-29','2009-08-07','2012-08-02',
  '2013-08-21','2014-07-23','2015-07-10','2015-09-29','2016-07-08','2016-09-27','2016-09-28','2019-08-09',
  '2019-09-30','2023-08-03','2024-07-24','2024-07-25','2024-10-02','2024-10-03','2024-10-31','2026-07-10','2026-10-23',
]);
const TWUS_KINDS = [
  {key:'normal', name:'平常日'},
  {key:'typhoon', name:'颱風假後'},
  {key:'lny', name:'過年後'},
  {key:'qingming', name:'清明連假後'},
  {key:'holiday', name:'其他連假後'},
];
// 前一個台股交易日 P 和當天 T 之間，台股休市的平日(週一~五)
function twusClosedDays(P, T){
  const out = [], end = Date.parse(T+'T00:00:00Z');
  for (let t=Date.parse(P+'T00:00:00Z')+864e5; t<end; t+=864e5){
    const w = new Date(t).getUTCDay();
    if (w!==0 && w!==6) out.push(new Date(t).toISOString().slice(0,10));
  }
  return out;
}
function twusKind(closed, T){
  if (!closed.length) return 'normal';
  if (closed.some(d=>TW_TYPHOON.has(d))) return 'typhoon';
  const md = T.slice(5);
  if (closed.length>=3 && md>='01-15' && md<='02-28') return 'lny';
  return closed.some(d=>d.slice(5)>='04-02' && d.slice(5)<='04-07') ? 'qingming' : 'holiday';
}
function computeTwus(tw, us){
  const out = [], usIdx = {};
  us.forEach((r,i)=>{ usIdx[r.date] = i; });
  let usClosed = 0, bad = 0, j = 0;
  for (let i=1;i<tw.length;i++){
    const P = tw[i-1].date, T = tw[i].date;
    while (j<us.length && us[j].date<P) j++;
    let k = j;
    while (k<us.length && us[k].date<T) k++;
    const sessions = k-j;
    if (j<1) continue;   // 這天之前還沒有美股資料
    if (!sessions){ usClosed++; continue; }
    const pc = tw[i-1].close, o = tw[i].open, c = tw[i].close;
    if (o===pc){ bad++; continue; }
    const n = usIdx[T];   // 當晚的美股(可能休市)
    out.push({ idx:i, date:T, prev:P, usDate:us[k-1].date, sessions, kind:twusKind(twusClosedDays(P,T), T),
      r:(us[k-1].close/us[j-1].close-1)*100, gap:o/pc-1, intra:c/o-1, day:c/pc-1, red:c>o, black:c<o,
      night: n>0 ? us[n].close/us[n-1].close-1 : NaN });
  }
  return { events:out, usClosed, bad };
}
function twusSummary(list){
  const m = list.length;
  if (!m) return {count:0, gap:NaN, gapMed:NaN, gapUp:NaN, intra:NaN, red:NaN, black:NaN, up:NaN, day:NaN};
  const avg = f=>list.reduce((a,e)=>a+e[f],0)/m, rate = f=>list.filter(f).length/m;
  const g = list.map(e=>e.gap).sort((a,b)=>a-b), mid = m>>1;
  return { count:m, gap:avg('gap'), gapMed:m%2 ? g[mid] : (g[mid-1]+g[mid])/2, gapUp:rate(e=>e.gap>0), intra:avg('intra'), red:rate(e=>e.red), black:rate(e=>e.black), up:rate(e=>e.day>0), day:avg('day') };
}
// x、y 的相關係數與斜率(y 每變動 1 單位 x)；至少要 3 筆
function twusCorr(pairs){
  const v = pairs.filter(p=>Number.isFinite(p[0]) && Number.isFinite(p[1])), m = v.length;
  if (m<3) return {corr:NaN, slope:NaN, n:m};
  const mx = v.reduce((a,p)=>a+p[0],0)/m, my = v.reduce((a,p)=>a+p[1],0)/m;
  let sxx=0, syy=0, sxy=0;
  v.forEach(p=>{ const x=p[0]-mx, y=p[1]-my; sxx+=x*x; syy+=y*y; sxy+=x*y; });
  return { corr:sxx&&syy ? sxy/Math.sqrt(sxx*syy) : NaN, slope:sxx ? sxy/sxx : NaN, n:m };
}
const twusCorrs = list=>({
  gap: twusCorr(list.map(e=>[e.r, e.gap*100])), intra: twusCorr(list.map(e=>[e.r, e.intra*100])), day: twusCorr(list.map(e=>[e.r, e.day*100])),
  night: twusCorr(list.map(e=>[e.day*100, e.night*100])),
});
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
  const spanAll = twusSpanList(state.twus.events, prm.span);
  const list = spanAll.filter(e=>e.kind==='normal');   // 平常日：前一晚剛好一場美股
  if (!list.length) return `<div class="panel"><div class="empty"><p>沒有可以比對的資料。</p></div></div>`;
  const isDn = e=>e.r<=-B, isUp = e=>e.r>=B;
  const all = twusSummary(list), dn = twusSummary(list.filter(isDn)), up = twusSummary(list.filter(isUp));
  const pct = (v,d=2)=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v,d)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const plain = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td>${(v*100).toFixed(0)}%</td>`;
  const num = (v,d=2)=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td>${v.toFixed(d)}</td>`;
  const cnt = n=> `<td>${n.toLocaleString('en-US')}${n && n<MYTH_FEW ? '<small> 樣本少</small>' : ''}</td>`;
  const cells = s=>`<td>${s.count.toLocaleString('en-US')}</td>${pct(s.gap)}${pct(s.gapMed)}${win(s.gapUp)}${pct(s.intra)}${win(s.red)}${plain(s.black)}${win(s.up)}${pct(s.day)}`;
  const head = first=>`<thead><tr><th>${first}</th><th>次數</th><th>平均跳空</th><th>中位數跳空</th><th>開高機率</th><th>開盤到收盤</th><th>收紅K</th><th>收黑K</th><th>收盤比昨收漲</th><th>當天平均漲跌</th></tr></thead>`;
  const few = s=> s.count && s.count<MYTH_FEW ? '，樣本少' : '';
  const pc0 = v=> Number.isNaN(v) ? '—' : (v*100).toFixed(0)+'%';
  const say = (name, s)=> s.count ? `<li><b>那斯達克${name} ${B}% 以上</b>(${s.count} 次${few(s)})：隔天台股平均跳空 ${fmtPct(s.gap,2)}、中位數 ${fmtPct(s.gapMed,2)}，${pc0(s.gapUp)} 開高；開盤後收紅K ${pc0(s.red)}、收黑K ${pc0(s.black)}，最後 ${pc0(s.up)} 比昨收漲，當天平均 ${fmtPct(s.day,2)}。</li>` : `<li><b>那斯達克${name} ${B}% 以上</b>：這段期間沒有發生過。</li>`;
  const c = twusCorrs(list);
  const f2 = v=> Number.isNaN(v) ? '—' : v.toFixed(2);
  const bins = TWUS_BINS.map(b=>({name:b.name, s:twusSummary(list.filter(e=>b.test(e.r)))}));
  const normalAll = state.twus.events.filter(e=>e.kind==='normal');
  // 每年的相關係數：一眼看出關係有沒有變
  const years = [...new Set(normalAll.map(e=>e.date.slice(0,4)))];
  const yearly = years.map(y=>{ const L = normalAll.filter(e=>e.date.startsWith(y)), k = twusCorrs(L); return {y, n:L.length, gap:k.gap.corr, day:k.day.corr}; });
  state.twusCharts = { bins, yearly };
  const corrRows = TWUS_SPANS.map(s=>{
    const L = twusSpanList(normalAll, s.key), k = twusCorrs(L);
    return `<tr class="${s.key===prm.span?'allrow':''}"><td>${s.name}</td>${cnt(L.length)}${num(k.gap.corr)}${num(k.gap.slope)}${num(k.intra.corr)}${num(k.day.corr)}${num(k.day.slope)}${num(k.night.corr)}</tr>`;
  }).join('');
  const spanRows = TWUS_COMPARE_SPANS.map(s=>{
    const L = twusSpanList(normalAll, s.key), a = twusSummary(L.filter(isDn)), b = twusSummary(L.filter(isUp));
    return `<tr class="${s.key===prm.span?'allrow':''}"><td>${s.name}</td>${cnt(a.count)}${pct(a.gap)}${pct(a.gapMed)}${win(a.red)}${win(a.up)}${cnt(b.count)}${pct(b.gap)}${pct(b.gapMed)}${win(b.red)}${win(b.up)}</tr>`;
  }).join('');
  const kindRows = TWUS_KINDS.map(K=>{
    const L = spanAll.filter(e=>e.kind===K.key), k = twusCorrs(L), s = twusSummary(L);
    const a = twusSummary(L.filter(isDn)), b = twusSummary(L.filter(isUp));
    const sessions = L.length ? L.reduce((x,e)=>x+e.sessions,0)/L.length : NaN;
    return `<tr class="${K.key==='normal'?'allrow':''}"><td>${K.name}</td>${cnt(s.count)}${num(sessions,1)}${num(k.gap.corr)}${num(k.gap.slope)}${pct(s.gap)}${pct(s.gapMed)}${win(s.red)}${win(s.up)}<td>${a.count}</td>${pct(a.gap)}<td>${b.count}</td>${pct(b.gap)}</tr>`;
  }).join('');
  const kindName = k=> (TWUS_KINDS.find(x=>x.key===k)||{}).name.replace('後','');
  const closures = state.twus.events.filter(e=>e.kind!=='normal').slice(-10).reverse();
  const recent = list.filter(e=>isDn(e)||isUp(e)).slice(-20).reverse();
  const kCell = e=> `<td class="${e.red?'up':e.black?'down':''}">${e.red?'紅K':e.black?'黑K':'平'}</td>`;
  return `
    <div class="panel paramfold ${paramFoldCls()}">
      ${paramFoldHead('統計設定')}
      <div class="paramfold-body">
      <div class="paramgrid">
        <div class="paramitem">
          <label>統計期間 <b>${spanAll[0].date} ~ ${spanAll[spanAll.length-1].date}</b></label>
          <div class="btnrow-l">${TWUS_SPANS.map(s=>`<button class="${prm.span===s.key?'active':''}" onclick="setTwusParam('span',${s.key})">${s.name}</button>`).join('')}</div>
        </div>
        <div class="paramitem">
          <label>大漲大跌的門檻 <b>${B}%</b></label>
          <input type="range" min="1" max="5" step="0.5" value="${B}"
            onchange="setTwusParam('big',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
      </div>
      <div class="note">台股每天對應前一晚的美股(週一對週五)。跳空＝開盤 ÷ 昨收 − 1；開盤到收盤＝收盤 ÷ 開盤 − 1；紅K＝收盤高於開盤，黑K反之。休市後第一天另外分組，除了「過年、清明、連假與颱風假」都只算平常日。前一晚美股休市的 ${state.twus.usClosed} 天、開盤價缺漏的 ${state.twus.bad} 天不列。</div>
      </div>
    </div>

    <div class="panel">
      <h3>那斯達克大漲大跌，隔天台股怎麼走</h3>
      <div class="tablewrap"><table class="stattable">${head('那斯達克前一晚')}
        <tbody>
          <tr><td>大跌 ${B}% 以上</td>${cells(dn)}</tr>
          <tr><td>大漲 ${B}% 以上</td>${cells(up)}</tr>
          <tr class="allrow"><td>所有平常日(基準)</td>${cells(all)}</tr>
        </tbody>
      </table></div>
      <ul class="insight">${say('大跌',dn)}${say('大漲',up)}</ul>
    </div>

    <div class="panel">
      <h3>相關性</h3>
      <div class="tablewrap"><table class="stattable">
        <thead>
          <tr><th rowspan="2">期間</th><th rowspan="2">天數</th><th colspan="2">那斯達克 → 台股跳空</th><th rowspan="2">那斯達克 → 開盤到收盤<br>相關係數</th><th colspan="2">那斯達克 → 台股全日</th><th rowspan="2">台股當天 → 當晚那斯達克<br>相關係數</th></tr>
          <tr><th>相關係數</th><th>斜率</th><th>相關係數</th><th>斜率</th></tr>
        </thead>
        <tbody>${corrRows}</tbody>
      </table></div>
      <ul class="insight">
        <li><b>那斯達克 → 台股跳空</b>：相關係數 ${f2(c.gap.corr)}，那斯達克每漲跌 1%，台股開盤平均動 ${f2(c.gap.slope)}%。</li>
        <li><b>那斯達克 → 開盤後</b>：和開盤到收盤的相關係數 ${f2(c.intra.corr)}，和全日漲跌 ${f2(c.day.corr)}(斜率 ${f2(c.day.slope)})。</li>
      </ul>
      <div id="twusYear" style="margin-top:12px"></div>
      ${LTChart.legend([{name:'和台股跳空的相關係數', color:'var(--amber)'}, {name:'和台股全日漲跌的相關係數', color:'var(--blue)'}])}
      <div class="note">相關係數 1＝完全同向，0＝沒有關係。斜率的單位是「那斯達克每 1% 對應台股幾 %」。相關不代表因果，兩邊可能同時反應全球消息。</div>
    </div>

    <div class="panel">
      <h3>過年、清明、連假與颱風假</h3>
      <div class="tablewrap"><table class="stattable">
        <thead>
          <tr><th rowspan="2">休市後第一天</th><th rowspan="2">次數</th><th rowspan="2">美股平均場數</th><th colspan="2">累積漲跌 → 跳空</th><th rowspan="2">平均跳空</th><th rowspan="2">中位數跳空</th><th rowspan="2">收紅K</th><th rowspan="2">收盤比昨收漲</th><th colspan="2">累積大跌 ${B}% 以上</th><th colspan="2">累積大漲 ${B}% 以上</th></tr>
          <tr><th>相關係數</th><th>斜率</th><th>次數</th><th>平均跳空</th><th>次數</th><th>平均跳空</th></tr>
        </thead>
        <tbody>${kindRows}</tbody>
      </table></div>
      <h4 class="subhead">最近 ${closures.length} 次休市</h4>
      <div class="tablewrap"><table class="stattable">
        <thead><tr><th>開盤日</th><th>前一交易日</th><th>類型</th><th>美股場數</th><th>那斯達克累積</th><th>台股跳空</th><th>開盤到收盤</th><th>K棒</th><th>當天漲跌</th></tr></thead>
        <tbody>${closures.map(e=>`<tr class="click" onclick="focusTwus(${e.idx})"><td>${e.date}</td><td>${e.prev}</td><td>${kindName(e.kind)}</td><td>${e.sessions}</td>${pct(e.r/100)}${pct(e.gap)}${pct(e.intra)}${kCell(e)}${pct(e.day)}</tr>`).join('')}</tbody>
      </table></div>
      <div class="note">台股休市期間，那斯達克的漲跌用累積計算(例如休 2 天就累積 2～3 場)。颱風假依台北市停班造成的全日休市日認定；颱風假和連假連在一起的算颱風假後。其他連假包含 1999 年 921 地震；1996 年以前的颱風假也算在其他連假。</div>
    </div>

    <div class="panel">
      <h3>不同期間的比較</h3>
      <div class="tablewrap"><table class="stattable">
        <thead>
          <tr><th rowspan="2">期間</th><th colspan="5">那斯達克大跌 ${B}% 以上</th><th colspan="5">那斯達克大漲 ${B}% 以上</th></tr>
          <tr><th>次數</th><th>平均跳空</th><th>中位數跳空</th><th>收紅K</th><th>收盤比昨收漲</th><th>次數</th><th>平均跳空</th><th>中位數跳空</th><th>收紅K</th><th>收盤比昨收漲</th></tr>
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
    </div>

    <div class="panel">
      <h3>最近 ${recent.length} 次大漲大跌</h3>
      <div class="tablewrap"><table class="stattable">
        <thead><tr><th>台股日期</th><th>美股日期</th><th>那斯達克</th><th>台股跳空</th><th>開盤到收盤</th><th>K棒</th><th>當天漲跌</th></tr></thead>
        <tbody>${recent.map(e=>`<tr class="click" onclick="focusTwus(${e.idx})"><td>${e.date}</td><td>${e.usDate}</td>${pct(e.r/100)}${pct(e.gap)}${pct(e.intra)}${kCell(e)}${pct(e.day)}</tr>`).join('')}</tbody>
      </table></div>
      <div class="note">點選列可在K線圖上定位。歷史統計不代表未來。</div>
    </div>`;
}
function drawTwusCharts(){
  const C = state.twusCharts, a = document.getElementById('twusGap'), b = document.getElementById('twusRed'), y = document.getElementById('twusYear');
  if (!C || !a || !b || !y) return;
  const x = C.bins.map(g=>g.name), S = C.bins.map(g=>g.s);
  LTChart.bars(a, { x, xFmt:v=>v, xAll:true, title:'橫軸：那斯達克前一晚漲跌(%)', label:'那斯達克各漲跌幅分組，隔天台股的平均跳空與開盤到收盤', height:260, yFmt:v=>(v*100).toFixed(1)+'%', refY:[{y:0}],
    tipFmt:(s,v,i)=>`${fmtPct(v,2)}(${S[i].count} 次)`,
    series:[{name:'平均跳空', y:S.map(s=>s.gap), color:'var(--up)', colors:S.map(s=>s.gap>=0?'var(--up)':'var(--down)')},
            {name:'開盤到收盤', y:S.map(s=>s.intra), color:'var(--blue)'}] });
  LTChart.bars(b, { x, xFmt:v=>v, xAll:true, title:'橫軸：那斯達克前一晚漲跌(%)', label:'那斯達克各漲跌幅分組，隔天台股收紅K與收盤比昨收漲的機率', height:220, yFmt:v=>(v*100).toFixed(0)+'%', refY:[{y:0.5}],
    tipFmt:(s,v,i)=>`${(v*100).toFixed(0)}%(${S[i].count} 次)`,
    series:[{name:'收紅K', y:S.map(s=>s.red), color:'var(--up)'},
            {name:'收盤比昨收漲', y:S.map(s=>s.up), color:'var(--amber)'}] });
  LTChart.bars(y, { x:C.yearly.map(r=>r.y), xFmt:v=>window.innerWidth<600 ? String(v).slice(2) : String(v), xAll:true, title:'每年的相關係數', label:'每年那斯達克和台股跳空、全日漲跌的相關係數', height:240, yFmt:v=>v.toFixed(1), refY:[{y:0}],
    tipFmt:(s,v,i)=>`${v.toFixed(2)}(${C.yearly[i].n} 天)`,
    series:[{name:'和台股跳空', y:C.yearly.map(r=>r.gap), color:'var(--amber)'},
            {name:'和台股全日漲跌', y:C.yearly.map(r=>r.day), color:'var(--blue)'}] });
}
