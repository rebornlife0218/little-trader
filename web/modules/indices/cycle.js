/* 指數(6/7)：模式三 週期性分析(月初/月中/月底、星期、月份、選舉) */
/* ============================== 週期性分析 ==============================
   每日漲跌(收盤 ÷ 前一交易日收盤 − 1)依「月初/月中/月底」「週一~週五」分組；月份效應用月報酬。
   有總統直選的地區另外標註選舉日，統計選前選後的漲跌。 */
// 投票日(多日投票取最後一輪)。基準日＝投票日當天或之前最後一個交易日(結果揭曉前的收盤)
const ELECTIONS = {
  TW: {region:'台灣', title:'總統大選', list:[
    {d:'1996-03-23'},{d:'2000-03-18'},{d:'2004-03-20'},{d:'2008-03-22'},
    {d:'2012-01-14'},{d:'2016-01-16'},{d:'2020-01-11'},{d:'2024-01-13'}]},
  US: {region:'美國', title:'總統大選', list:[
    {d:'1992-11-03'},{d:'1996-11-05'},{d:'2000-11-07'},{d:'2004-11-02'},
    {d:'2008-11-04'},{d:'2012-11-06'},{d:'2016-11-08'},{d:'2020-11-03'},{d:'2024-11-05'}]},
  KR: {region:'韓國', title:'總統大選', list:[
    {d:'1992-12-18'},{d:'1997-12-18'},{d:'2002-12-19'},{d:'2007-12-19'},
    {d:'2012-12-19'},{d:'2017-05-09'},{d:'2022-03-09'},{d:'2025-06-03'}],
    note:'2017、2025 年為總統遭彈劾去職後的提前選舉。'},
  SG: {region:'新加坡', title:'總統選舉', list:[
    {d:'1993-08-28'},{d:'2011-08-27'},{d:'2023-09-01'}],
    note:'只列有實際投票的選舉(1999、2005、2017 年為同額當選，未投票)。新加坡總統為虛位元首，實權在總理。'},
  FR: {region:'法國', title:'總統大選(第二輪)', list:[
    {d:'1995-05-07'},{d:'2002-05-05'},{d:'2007-05-06'},{d:'2012-05-06'},
    {d:'2017-05-07'},{d:'2022-04-24'}],
    note:'歐元區沒有共同的總統，以區內影響最大的法國總統大選為代表。'},
};
const INDEX_ELECTION = {TAIEX:'TW', SP500:'US', NASDAQ:'US', KOSPI50:'KR', STI:'SG', STOXX50:'FR'};
const NO_ELECTION = {NK225:'日本為內閣制，沒有總統選舉。', FTSE100:'英國為內閣制，沒有總統選舉。',
  HSI:'香港沒有總統選舉(特首由選舉委員會選出)。', SSEC:'中國國家主席由全國人大選出，沒有全民直選。'};
const WEEKDAYS = ['週日','週一','週二','週三','週四','週五','週六'];
const CYCLE_SPANS = [{key:0, name:'全部'}, {key:20, name:'近20年'}, {key:10, name:'近10年'}, {key:5, name:'近5年'}];
const MONTH_DEFS = [
  {key:'cal', name:'依日期(1~10日 / 11~20日 / 21日~月底)'},
  {key:'td', name:'依交易日(每月前5天 / 中間 / 最後5天)'},
];
function electionOf(key){ const k = INDEX_ELECTION[key]; return k ? ELECTIONS[k] : null; }
function computeCycle(rows, key, prm){
  const n = rows.length, c = rows.map(r=>r.close);
  // 統計期間：近N年(以最後一筆資料往前推)
  let from = 1;
  if (prm.span){
    const last = rows[n-1].date, cut = (+last.slice(0,4)-prm.span)+last.slice(4);
    while (from<n && rows[from].date<=cut) from++;
  }
  // 每月第幾個交易日／當月共幾個交易日
  const pos = new Array(n), cnt = {};
  for (let i=0;i<n;i++){ const m = rows[i].date.slice(0,7); cnt[m] = (cnt[m]||0)+1; pos[i] = cnt[m]; }
  const part = {'月初':[], '月中':[], '月底':[]}, wd = {}, partMonth = {};   // partMonth[1~12][月初/月中/月底]
  for (let i=from;i<n;i++){
    const r = c[i]/c[i-1]-1, d = rows[i].date;
    const w = new Date(d+'T00:00:00Z').getUTCDay();
    if (w===6) continue;   // 早年週六的半日交易不列入每日統計
    let p;
    if (prm.monthDef==='td'){ const k = pos[i], K = cnt[d.slice(0,7)]; p = k<=5 ? '月初' : k>K-5 ? '月底' : '月中'; }
    else { const day = +d.slice(8,10); p = day<=10 ? '月初' : day<=20 ? '月中' : '月底'; }
    part[p].push(r);
    const pm = partMonth[+d.slice(5,7)] = partMonth[+d.slice(5,7)] || {'月初':[], '月中':[], '月底':[]};
    pm[p].push(r);
    (wd[w] = wd[w]||[]).push(r);
  }
  // 月報酬：月底收盤 ÷ 上月底收盤；最後一個月尚未結束不計
  const monthEnd = [];
  for (let i=0;i<n;i++) if (i===n-1 || rows[i+1].date.slice(0,7)!==rows[i].date.slice(0,7)) monthEnd.push(i);
  const months = {};
  for (let j=1;j<monthEnd.length-1;j++){
    const i = monthEnd[j]; if (i<from) continue;
    const m = +rows[i].date.slice(5,7);
    (months[m] = months[m]||[]).push(c[i]/c[monthEnd[j-1]]-1);
  }
  return { from, part, wd, months, partMonth, election: computeElection(rows, key) };
}
// 選舉：選前/選後報酬(不受統計期間影響，選舉次數本來就少)
function computeElection(rows, key){
  const E = electionOf(key); if (!E) return null;
  const n = rows.length, c = rows.map(r=>r.close);
  const ret = (a,b)=> a>=0 && b<n && a<n && b>=0 ? c[b]/c[a]-1 : NaN;
  const events = [];
  E.list.forEach(e=>{
    let base = -1;
    for (let i=0;i<n && rows[i].date<=e.d;i++) base = i;
    if (base<1 || base>=n-1) return; // 資料範圍外，或選後還沒有交易日
    events.push({...e, base, react:base+1,
      pre20:ret(base-20,base), pre5:ret(base-5,base), day1:ret(base,base+1),
      post5:ret(base,base+5), post20:ret(base,base+20)});
  });
  return { E, events };
}
function cycleSummary(list){
  const v = list.filter(x=>!Number.isNaN(x)); const m = v.length;
  if (!m) return {count:0, win:NaN, avg:NaN, med:NaN, max:NaN, min:NaN};
  const s = [...v].sort((a,b)=>a-b);
  return { count:m, win:v.filter(x=>x>0).length/m, avg:v.reduce((a,b)=>a+b,0)/m,
    med: m%2 ? s[(m-1)/2] : (s[m/2-1]+s[m/2])/2, max:s[m-1], min:s[0] };
}
function setCycleParam(field, value){
  state.cycleParams[field] = value;
  Object.keys(state.cycle).forEach(k=>state.cycle[k] = null);
  render();
}
function renderCycle(){
  const key = state.active, res = state.cycle[key]; if (!res) return '';
  const rows = state.data[key], prm = state.cycleParams;
  const pct = (v,d=2)=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v,d)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  // 平均漲跌的橫條：以0為中線，紅漲綠跌
  const bar = (v, scale)=>{
    if (Number.isNaN(v) || !scale) return '<td class="na">—</td>';
    const w = Math.min(Math.abs(v)/scale, 1)*50;
    return `<td class="barcell"><span class="cbar"><i style="${v>=0?'left:50%':'right:50%'};width:${w}%;background:${v>=0?'var(--up)':'var(--down)'}"></i></span></td>`;
  };
  const table = (title, groups, d=2)=>{
    const sums = groups.map(g=>({...g, s:cycleSummary(g.list)}));
    const scale = Math.max(...sums.map(g=>Math.abs(g.s.avg)).filter(x=>!Number.isNaN(x)), 0);
    return `<div class="tablewrap"><table class="stattable cycle">
      <thead><tr><th>${title}</th><th>次數</th><th>上漲機率</th><th>平均漲跌</th><th class="barhead">平均漲跌(相對大小)</th><th>中位數</th><th>最大漲幅</th><th>最大跌幅</th></tr></thead>
      <tbody>${sums.map(g=>`<tr class="${g.cls||''}"><td>${g.name}${g.hint?`<small class="hint-s">${g.hint}</small>`:''}</td><td>${g.s.count}</td>
        ${win(g.s.win)}${pct(g.s.avg,d===2?3:2)}${bar(g.s.avg, scale)}${pct(g.s.med,d===2?3:2)}${pct(g.s.max)}${pct(g.s.min)}</tr>`).join('')}</tbody>
    </table></div>`;
  };
  // 自動解讀：平均最高/最低、上漲機率最高的組別
  const insight = (label, groups)=>{
    const s = groups.map(g=>({name:g.name, ...cycleSummary(g.list)})).filter(g=>g.count>0);
    if (s.length<2) return '';
    const best = s.reduce((a,b)=>b.avg>a.avg?b:a), worst = s.reduce((a,b)=>b.avg<a.avg?b:a), hiWin = s.reduce((a,b)=>b.win>a.win?b:a);
    return `<li><b>${label}</b>：平均表現最好的是「${best.name}」(${fmtPct(best.avg,3)})，最差的是「${worst.name}」(${fmtPct(worst.avg,3)})；上漲機率最高為「${hiWin.name}」${(hiWin.win*100).toFixed(0)}%。</li>`;
  };
  const partGroups = ['月初','月中','月底'].map(p=>({name:p, list:res.part[p],
    hint: prm.monthDef==='td' ? {月初:'每月前5個交易日', 月中:'中間的交易日', 月底:'每月最後5個交易日'}[p] : {月初:'1~10日', 月中:'11~20日', 月底:'21日~月底'}[p]}));
  const wdGroups = [1,2,3,4,5].filter(w=>res.wd[w]).map(w=>({name:WEEKDAYS[w], list:res.wd[w]}));
  const monthGroups = Array.from({length:12},(_,i)=>({name:(i+1)+'月', list:res.months[i+1]||[]}));
  const allDaily = [].concat(...Object.values(res.part));
  const partMonthRows = Array.from({length:12},(_,i)=>{
    const pm = res.partMonth[i+1] || {'月初':[], '月中':[], '月底':[]};
    return { m:i+1, cells: PART_COLORS.map(p=>cycleSummary(pm[p.name])) };
  });
  const cellsAll = partMonthRows.flatMap(r=>r.cells.map((c,j)=>({m:r.m, p:PART_COLORS[j].name, ...c}))).filter(c=>c.count>0);
  const partMonthInsight = cellsAll.length ? (()=>{
    const s = [...cellsAll].sort((a,b)=>b.avg-a.avg), top = s.slice(0,3), bot = s.slice(-3).reverse();
    const pos = PART_COLORS.map(p=>({name:p.name, n:partMonthRows.filter(r=>{ const c=r.cells[PART_COLORS.findIndex(x=>x.name===p.name)]; const mx=Math.max(...r.cells.map(x=>x.avg)); return c.avg===mx; }).length}));
    const most = pos.reduce((a,b)=>b.n>a.n?b:a);
    return `<li><b>平均最好</b>：${top.map(c=>`${c.m}月${c.p}(${fmtPct(c.avg,3)})`).join('、')}；<b>平均最差</b>：${bot.map(c=>`${c.m}月${c.p}(${fmtPct(c.avg,3)})`).join('、')}。</li>
      <li>12 個月份中，有 ${most.n} 個月份是「${most.name}」表現最好。每個月份每一段的樣本只有該月份的部分交易日(每年約 7～10 天)，差異容易受少數年份影響。</li>`;
  })() : '';
  const periodText = `${rows[Math.max(res.from-1,0)].date} ~ ${rows[rows.length-1].date}`;
  let html = `
    <div class="panel">
      <h3>統計設定</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>統計期間 <b>${periodText}</b></label>
          <div class="btnrow-l">${CYCLE_SPANS.map(s=>`<button class="${prm.span===s.key?'active':''}" onclick="setCycleParam('span',${s.key})">${s.name}</button>`).join('')}</div>
        </div>
        <div class="paramitem">
          <label for="monthDef">月初 / 月中 / 月底的定義</label>
          <select id="monthDef" class="indexpick" onchange="setCycleParam('monthDef',this.value)">
            ${MONTH_DEFS.map(m=>`<option value="${m.key}" ${m.key===prm.monthDef?'selected':''}>${m.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="note">每日漲跌＝當日收盤 ÷ 前一個交易日收盤 − 1。週一的漲跌包含週末兩天的消息。期間內所有交易日平均每日漲跌 ${fmtPct(cycleSummary(allDaily).avg,3)}、上漲機率 ${(cycleSummary(allDaily).win*100).toFixed(0)}%，可作為各組的比較基準。</div>
    </div>

    <div class="panel">
      <h3>週一 ~ 週五</h3>
      ${table('星期', [{name:'全部交易日', list:allDaily, cls:'allrow'}, ...wdGroups], 2)}
      <ul class="insight">${insight('星期效應', wdGroups)}</ul>
    </div>

    <div class="panel">
      <h3>月初 / 月中 / 月底</h3>
      ${table('時段', [{name:'全部交易日', list:allDaily, cls:'allrow'}, ...partGroups], 2)}
      <ul class="insight">${insight('月初/月中/月底', partGroups)}</ul>
    </div>

    <div class="panel">
      <h3>月份效應(1 ~ 12 月)</h3>
      <div id="cyMonthRet"></div>
      ${LTChart.legend([{name:'平均報酬(紅漲綠跌)', color:'var(--up)'}, {name:'中位數', color:'var(--blue)'}, {name:'上漲機率(右軸)', color:'var(--amber)'}])}
      <ul class="insight">${insight('月份', monthGroups)}</ul>
      <details class="cy-detail"><summary>詳細數據(次數、最大漲跌幅)</summary>${table('月份', monthGroups, 1)}</details>
      <div class="note">月報酬＝月底收盤 ÷ 上個月底收盤 − 1，尚未結束的當月不計入。長條為報酬(左軸)，折線為上漲機率(右軸)，虛線為上漲機率 50%。</div>
    </div>

    <div class="panel">
      <h3>各月份的月初 / 月中 / 月底</h3>
      <div id="cyMonthPart"></div>
      ${LTChart.legend(PART_COLORS.map(p=>({name:p.name+' 平均每日漲跌', color:p.color})).concat([{name:'上漲機率(右軸，同色折線)', color:'var(--dim)'}]))}
      <ul class="insight">${partMonthInsight}</ul>
      <div class="note">每個月份各自依「${(MONTH_DEFS.find(m=>m.key===prm.monthDef)||MONTH_DEFS[0]).name}」分成三段，計算該段交易日的平均每日漲跌(長條，左軸)與上漲機率(折線，右軸，虛線為 50%)；可在上方「統計設定」切換定義。</div>
    </div>`;
  state.cycleCharts = { monthGroups, partMonthRows };
  html += renderElection(res.election, key);
  return html;
}
// 窄螢幕(手機)只顯示數字，避免 12 個月份的標籤擠在一起
const monthLabel = (v, tip)=> tip || window.innerWidth >= 600 ? v : v.replace('月','');
const PART_COLORS = [{name:'月初', color:'var(--amber)'}, {name:'月中', color:'var(--blue)'}, {name:'月底', color:'#a78bfa'}];
// 週期性分析的圖：月份效應(平均、中位數、上漲機率)、各月份的月初/月中/月底
function drawCycleCharts(){
  const C = state.cycleCharts, a = document.getElementById('cyMonthRet');
  if (!C || !a) return;
  const S = C.monthGroups.map(g=>cycleSummary(g.list)), x = C.monthGroups.map(g=>g.name);
  const pctFmt = v=>(v*100).toFixed(1)+'%';
  LTChart.bars(a, { x, xFmt:monthLabel, xAll:true, label:'各月份平均報酬、中位數與上漲機率', height:260, yFmt:pctFmt,
    y2Min:0, y2Max:1, y2Fmt:v=>(v*100).toFixed(0)+'%', refY:[{y:0}, {y:0.5, axis:'right', color:'var(--amber)'}],
    tipFmt:(s,v,i)=> s.axis==='right' ? `${(v*100).toFixed(0)}%` : `${fmtPct(v,2)}(${S[i].count} 次)`,
    series:[{name:'平均報酬', y:S.map(s=>s.avg), color:'var(--up)', colors:S.map(s=>s.avg>=0?'var(--up)':'var(--down)')},
            {name:'中位數', y:S.map(s=>s.med), color:'var(--blue)'},
            {name:'上漲機率', y:S.map(s=>s.win), color:'var(--amber)', axis:'right'}] });
  LTChart.bars(document.getElementById('cyMonthPart'), { x:C.partMonthRows.map(r=>r.m+'月'), xFmt:monthLabel, xAll:true, label:'各月份月初月中月底的平均每日漲跌與上漲機率', height:300,
    yFmt:v=>(v*100).toFixed(2)+'%', y2Min:0, y2Max:1, y2Fmt:v=>(v*100).toFixed(0)+'%', refY:[{y:0}, {y:0.5, axis:'right', color:'var(--dim)'}],
    tipFmt:(s,v,i)=> s.axis==='right' ? `${(v*100).toFixed(0)}%` : `${fmtPct(v,3)}(${C.partMonthRows[i].cells[PART_COLORS.findIndex(p=>p.name===s.name)].count} 天)`,
    series:PART_COLORS.map((p,j)=>({name:p.name, color:p.color, y:C.partMonthRows.map(r=>r.cells[j].avg)}))
      .concat(PART_COLORS.map((p,j)=>({name:p.name+'上漲機率', color:p.color, axis:'right', y:C.partMonthRows.map(r=>r.cells[j].win)}))) });
}
function renderElection(el, key){
  if (!el){
    return `<div class="panel"><h3>總統選舉</h3><div class="note" style="margin-top:0;">${NO_ELECTION[key]||'此地區沒有總統選舉。'}</div></div>`;
  }
  const rows = state.data[key], E = el.E;
  const pct = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const F = ['pre20','pre5','day1','post5','post20'];
  const sums = F.map(f=>cycleSummary(el.events.map(e=>e[f])));
  const skipped = E.list.filter(e=>!el.events.find(x=>x.d===e.d));
  return `
    <div class="panel election">
      <h3><span class="tag elec">選</span> ${E.region}${E.title}前後的漲跌</h3>
      <div class="tablewrap"><table class="stattable cycle">
        <thead>
          <tr><th rowspan="2">投票日</th><th rowspan="2">基準日<br>(選前收盤)</th><th colspan="2">選前</th><th rowspan="2">選後<br>第1個交易日</th><th colspan="2">選後(以基準日收盤計)</th></tr>
          <tr><th>20日</th><th>5日</th><th>+5日</th><th>+20日</th></tr>
        </thead>
        <tbody>
          ${el.events.map(e=>`<tr class="click" onclick="focusDate('${key}',${e.base})"><td>${e.d}</td><td>${rows[e.base].date}</td>${F.map(f=>pct(e[f])).join('')}</tr>`).join('')}
          <tr class="allrow"><td colspan="2">平均(${el.events.length} 次)</td>${sums.map(s=>pct(s.avg)).join('')}</tr>
          <tr class="allrow"><td colspan="2">上漲機率</td>${sums.map(s=>win(s.win)).join('')}</tr>
        </tbody>
      </table></div>
      <div class="note">基準日＝投票日當天或之前最後一個交易日的收盤(開票結果出爐前)。「選前20日／5日」＝基準日相對20／5個交易日前的漲跌；「選後」皆以基準日收盤為基準。點選列可在K線圖上定位到選後第一個交易日。${E.note?' '+E.note:''}${skipped.length?` ${skipped.map(e=>e.d.slice(0,4)).join('、')} 年的選舉不在資料範圍內。`:''}樣本只有幾次，僅供參考。</div>

    </div>`;
}
// 定位到某一天(前後各約60個交易日)
function focusDate(key, idx){
  const rows = state.data[key];
  state.view[key] = {start:clamp(idx-60,0,rows.length-1), end:clamp(idx+60,0,rows.length-1)};
  state.cursor[key] = clamp(idx+1,0,rows.length-1);
  render();
  const c = document.getElementById('priceCanvas'); if (c) c.scrollIntoView({behavior:'smooth', block:'center'});
}
