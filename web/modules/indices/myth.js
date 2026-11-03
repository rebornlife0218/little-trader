/* 指數(5/7)：模式二 常見迷思(均線的支撐與壓力、520 行情) */
/* ============================== 常見迷思：均線的支撐與壓力、520 行情 ==============================
   跌破：前一日收盤在均線上、當日收盤在均線下；突破反之。
   初次跌破(突破)：之前已連續「均線天數 × settlePct%」日以上站在均線上(下)(預設一半：月線 10、季線 30、半年線 60、年線 120 日)；否則為後續(反覆)跌破(突破)。
   有支撐：跌破後 confirmDays 日內收盤又站回均線(假跌破)；有壓力：突破後 confirmDays 日內又跌回均線(假突破)。表格另外固定列 1 日內(滑桿設 1 日時不重複)。 */
const MYTH_LINES = [{p:20, name:'月線'}, {p:60, name:'季線'}, {p:120, name:'半年線'}, {p:240, name:'年線'}];
const MYTH_FEW = 20;   // 次數少於此數，標示樣本少
const settleOf = (p, prm)=> Math.max(1, Math.round(p*prm.settlePct/100));
function computeMyth(rows, ma, prm){
  const n = rows.length, closes = rows.map(r=>r.close);
  const fwd = (i,k)=> i+k<n ? closes[i+k]/closes[i]-1 : NaN;
  const out = {down:[], up:[]};
  MYTH_LINES.forEach(L=>{
    const arr = ma[L.p], settle = settleOf(L.p, prm);
    const down = {first:[], later:[]}, up = {first:[], later:[]};
    let runAbove = 0, runBelow = 0;
    for (let i=0;i<n;i++){
      const m = arr[i];
      if (Number.isNaN(m)){ runAbove = runBelow = 0; continue; }
      const above = closes[i] >= m;
      if (i>0 && !Number.isNaN(arr[i-1])){
        const prevAbove = closes[i-1] >= arr[i-1];
        if (prevAbove !== above){
          const ext20 = Math.min(i+20, n-1);
          // d 日內收盤是否回到均線另一側；資料還不滿 d 日時為 null(不列入比例)
          const backIn = d=>{
            if (i+d>=n) return null;
            for (let k=i+1;k<=i+d;k++){ if ((closes[k]>=arr[k]) === prevAbove) return true; }
            return false;
          };
          let extreme = prevAbove ? Infinity : -Infinity;
          for (let k=i+1;k<=ext20;k++) extreme = prevAbove ? Math.min(extreme, rows[k].low) : Math.max(extreme, rows[k].high);
          const ev = { idx:i, date:rows[i].date, back: backIn(prm.confirmDays), back1: backIn(1),
            candle: rows[i].close>rows[i].open ? 'red' : rows[i].close<rows[i].open ? 'black' : 'flat',
            ext: ext20>i ? extreme/closes[i]-1 : NaN,
            ret5:fwd(i,5), ret20:fwd(i,20), ret60:fwd(i,60) };
          if (prevAbove) down[runAbove>=settle ? 'first' : 'later'].push(ev);
          else up[runBelow>=settle ? 'first' : 'later'].push(ev);
        }
      }
      if (above){ runAbove++; runBelow = 0; } else { runBelow++; runAbove = 0; }
    }
    out.down.push({line:L, first:down.first, later:down.later});
    out.up.push({line:L, first:up.first, later:up.later});
  });
  return out;
}
function mythSummary(list){
  const avg = f=>{ const v=list.map(e=>e[f]).filter(x=>!Number.isNaN(x)); return v.length? v.reduce((a,b)=>a+b,0)/v.length : NaN; };
  const win = f=>{ const v=list.map(e=>e[f]).filter(x=>!Number.isNaN(x)); return v.length? v.filter(x=>x>0).length/v.length : NaN; };
  const rateOf = f=>{ const done = list.filter(e=>e[f]!==null); return done.length? done.filter(e=>e[f]).length/done.length : NaN; };
  return { count:list.length, backRate:rateOf('back'), back1Rate:rateOf('back1'), ext:avg('ext'),
    win5:win('ret5'), win20:win('ret20'), win60:win('ret60'),
    avg5:avg('ret5'), avg20:avg('ret20'), avg60:avg('ret60'),
    last: list.length ? list[list.length-1].date : null };
}
/* 520 行情(台股)：5 月 20 日是總統就職日(1996 年起每 4 年一次)，市場常說「就職前有行情、就職後利多出盡」。
   每年以 5/20 當天或之前最後一個交易日的收盤為基準日，算就職前後的漲跌，並與「任意一天」的同天期報酬比較。 */
const MAY20_INAUG = ['2000','2004','2008','2012','2016','2020','2024','2028'];
function computeMay20(rows, key){
  if (key!=='TAIEX') return null;
  const n = rows.length, c = rows.map(r=>r.close);
  const ret = (a,b)=> a>=0 && b>=0 && a<n && b<n ? c[b]/c[a]-1 : NaN;
  const elec = (ELECTIONS.TW||{list:[]}).list;
  const years = [];
  const y0 = +rows[0].date.slice(0,4), y1 = +rows[n-1].date.slice(0,4);
  for (let y=y0; y<=y1; y++){
    const day = `${y}-05-20`;
    let base = -1;
    for (let i=0;i<n && rows[i].date<=day;i++) base = i;
    if (base<20 || rows[base].date.slice(0,4)!==String(y)) continue;   // 資料不足或還沒到 5/20
    const inaug = MAY20_INAUG.includes(String(y));
    let fromElec = NaN, elecDate = null;
    if (inaug){
      const e = elec.find(x=>x.d.slice(0,4)===String(y));
      if (e){ let eb=-1; for (let i=0;i<n && rows[i].date<=e.d;i++) eb=i; if (eb>=0){ fromElec = ret(eb, base); elecDate = e.d; } }
    }
    years.push({ y, inaug, base, date:rows[base].date, elecDate, fromElec,
      pre20:ret(base-20,base), pre5:ret(base-5,base), post5:ret(base,base+5), post20:ret(base,base+20), post60:ret(base,base+60) });
  }
  // 基準：任意一天往前(後) k 個交易日的報酬，用來判斷 520 前後是否特別
  const base = k=>{ const v=[]; for (let i=0;i+k<n;i++) v.push(c[i+k]/c[i]-1); return {avg:v.reduce((a,b)=>a+b,0)/v.length, win:v.filter(x=>x>0).length/v.length}; };
  return { years, baseline:{ d5:base(5), d20:base(20), d60:base(60) } };
}
function may20Summary(list, f){
  const v = list.map(x=>x[f]).filter(x=>!Number.isNaN(x));
  return { count:v.length, avg: v.length ? v.reduce((a,b)=>a+b,0)/v.length : NaN, win: v.length ? v.filter(x=>x>0).length/v.length : NaN };
}
function renderMay20(res, key){
  if (!res) return `<div class="panel"><h3>520 行情</h3><div class="note" style="margin-top:0;">520 行情是台股的說法(5 月 20 日總統就職)，請切換到<b>台灣加權</b>查看。</div></div>`;
  const pct = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const F = ['pre20','pre5','post5','post20','post60'];
  const inaug = res.years.filter(x=>x.inaug), other = res.years.filter(x=>!x.inaug), B = res.baseline;
  const NA = '<td class="na">—</td>';
  const sumRows = (label, avgCells, winCells, cls)=>`<tr class="${cls}"><td rowspan="2" class="line">${label}</td><td class="kind">平均</td>${avgCells}</tr>
      <tr class="${cls}"><td class="kind">上漲機率</td>${winCells}</tr>`;
  const groupRows = (label, list, cls)=>{
    const ss = F.map(f=>may20Summary(list,f)), fe = may20Summary(list,'fromElec');
    return sumRows(`${label}<small>${list.length} 年</small>`, (list===inaug?pct(fe.avg):NA)+ss.map(x=>pct(x.avg)).join(''), (list===inaug?win(fe.win):NA)+ss.map(x=>win(x.win)).join(''), cls);
  };
  const baseKeys = [B.d20, B.d5, B.d5, B.d20, B.d60];
  const baseRows = sumRows('任意一天', NA+baseKeys.map(x=>pct(x.avg)).join(''), NA+baseKeys.map(x=>win(x.win)).join(''), '');
  const windowHead = `<th colspan="2">520 前</th><th colspan="3">520 後</th>`;
  const windowDays = `<th>20 日</th><th>5 日</th><th>+5 日</th><th>+20 日</th><th>+60 日</th>`;
  const yearRow = (x, elec)=>`<tr class="click" onclick="focusDate('${key}',${x.base})"><td>${x.y}</td>${elec?pct(x.fromElec):''}${F.map(f=>pct(x[f])).join('')}</tr>`;
  // 自動結論：就職年 vs 基準
  const p = v=> Number.isNaN(v) ? '—' : (v*100).toFixed(0)+'%';
  const iPre = may20Summary(inaug,'pre20'), iPost = may20Summary(inaug,'post20'), iPost60 = may20Summary(inaug,'post60'), oPre = may20Summary(other,'pre20'), iElec = may20Summary(inaug,'fromElec');
  const cmp = (a, b)=> Number.isNaN(a) ? '' : Math.abs(a-b) < 0.08 ? '與平常差不多' : a > b ? '高於平常' : '低於平常';
  const insight = `
    <li><b>就職前有行情？</b>就職年 520 前 20 個交易日上漲機率 ${p(iPre.win)}、平均 ${Number.isNaN(iPre.avg)?'—':fmtPct(iPre.avg)}；任意 20 日上漲機率 ${p(B.d20.win)}、平均 ${fmtPct(B.d20.avg)}，${cmp(iPre.win, B.d20.win)}。非就職年同期上漲機率 ${p(oPre.win)}。</li>
    <li><b>選後到就職</b>：從選前收盤到 520，${inaug.filter(x=>!Number.isNaN(x.fromElec)).length} 次中上漲機率 ${p(iElec.win)}、平均 ${Number.isNaN(iElec.avg)?'—':fmtPct(iElec.avg)}。</li>
    <li><b>就職後利多出盡？</b>就職年 520 後 20 個交易日上漲機率 ${p(iPost.win)}、平均 ${Number.isNaN(iPost.avg)?'—':fmtPct(iPost.avg)}；後 60 日上漲機率 ${p(iPost60.win)}，與任意 60 日的 ${p(B.d60.win)} 相比${cmp(iPost60.win, B.d60.win)}。</li>`;
  return `
    <div class="panel">
      <h3>520 行情：總統就職前後的漲跌</h3>
      <div class="tablewrap"><table class="stattable myth">
        <thead>
          <tr><th rowspan="2">分組</th><th rowspan="2">指標</th><th rowspan="2">選後至就職</th>${windowHead}</tr>
          <tr>${windowDays}</tr>
        </thead>
        <tbody>${groupRows('就職年', inaug, 'allrow')}${groupRows('非就職年', other, '')}${baseRows}</tbody>
      </table></div>
      <ul class="insight">${insight}</ul>
      <h4 class="subhead">就職年逐年</h4>
      <div class="tablewrap"><table class="stattable cycle">
        <thead>
          <tr><th rowspan="2">年度</th><th rowspan="2">選後至就職</th>${windowHead}</tr>
          <tr>${windowDays}</tr>
        </thead>
        <tbody>${inaug.map(x=>yearRow(x,true)).join('')}</tbody>
      </table></div>
      <details class="cy-detail"><summary>其他年份逐年(${other.length} 年)</summary>
        <div class="tablewrap"><table class="stattable cycle">
          <thead>
            <tr><th rowspan="2">年度</th>${windowHead}</tr>
            <tr>${windowDays}</tr>
          </thead>
          <tbody>${other.map(x=>yearRow(x,false)).join('')}</tbody>
        </table></div>
      </details>
      <div class="note">基準日＝5/20(或之前最後一個交易日)收盤，前後漲跌都以它為準；「選後至就職」＝大選投票日前收盤到基準日。「任意一天」＝所有交易日同天期的平均。資料自 ${res.years.length?res.years[0].y:'—'} 年起，就職年只有 ${inaug.length} 次，僅供參考。點選列可在K線圖上定位。</div>
    </div>`;
}
function setMythParam(field, value){
  state.mythParams[field] = value;
  Object.keys(state.myth).forEach(k=>state.myth[k] = null);
  render();
}
function renderMyth(){
  const res = state.myth[state.active]; if (!res) return '';
  const prm = state.mythParams;
  const pct = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0?'up':'down'}">${fmtPct(v)}</td>`;
  const win = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</td>`;
  const rate = v=> Number.isNaN(v) ? '<td class="na">—</td>' : `<td><b>${(v*100).toFixed(0)}%</b></td>`;
  // 另外固定列出 1日內站回(跌回)均線；滑桿設成 1 日時兩欄相同，只留一欄
  const show1 = prm.confirmDays!==1;
  const backHead = isDown=> `${prm.confirmDays}日內${isDown?'站回<br>(有支撐)':'跌回<br>(有壓力)'}`;
  const backThs = (isDown, attr='')=> (show1 ? `<th${attr}>1日內${isDown?'站回':'跌回'}</th>` : '') + `<th${attr}>${backHead(isDown)}</th>`;
  const backCells = s=> (show1 ? rate(s.back1Rate) : '') + rate(s.backRate);
  const extHead = isDown=> `20日內最大<br>${isDown?'續跌':'續漲'}`;
  const lineCell = g=> `<td rowspan="2" class="line">${g.line.name}<small>${g.line.p}MA</small></td>`;
  const table = (groups, isDown)=>`
    <div class="tablewrap"><table class="stattable myth">
      <thead>
        <tr><th rowspan="2">均線</th><th rowspan="2">類型</th><th rowspan="2">次數</th>
          ${backThs(isDown, ' rowspan="2"')}<th rowspan="2">${extHead(isDown)}</th>
          <th colspan="3">上漲機率</th><th colspan="3">平均報酬</th></tr>
        <tr><th>+5日</th><th>+20日</th><th>+60日</th><th>+5日</th><th>+20日</th><th>+60日</th></tr>
      </thead>
      <tbody>${groups.map(g=>[['first','初次'], ['later','後續']].map(([t,label],j)=>{
        const s = mythSummary(g[t]);
        return `<tr class="${j===0?'allrow':''}">${j===0?lineCell(g):''}
          <td class="kind">${label}</td><td>${s.count}</td>${backCells(s)}${pct(s.ext)}
          ${win(s.win5)}${win(s.win20)}${win(s.win60)}${pct(s.avg5)}${pct(s.avg20)}${pct(s.avg60)}</tr>`;
      }).join('')).join('')}</tbody>
    </table></div>`;
  // 穿越當天收紅K還是黑K：哪一種比較容易有支撐(跌破)／有壓力(突破)
  const candleTable = (groups, isDown)=>`
    <h4 class="subhead">${isDown?'跌破當天收紅K還是黑K，比較容易有撐？':'突破當天收紅K還是黑K，比較容易遇到壓力？'}</h4>
    <div class="tablewrap"><table class="stattable myth">
      <thead>
        <tr><th>均線</th><th>當天K棒</th><th>次數</th>${backThs(isDown)}<th>${extHead(isDown)}</th><th>+20日<br>上漲機率</th><th>+20日<br>平均報酬</th></tr>
      </thead>
      <tbody>${groups.map(g=>{
        const all = g.first.concat(g.later);
        return [['red','紅K','var(--candle-up)'],['black','黑K','var(--candle-down)']].map(([c,label,color],j)=>{
          const s = mythSummary(all.filter(e=>e.candle===c));
          return `<tr class="${j===0?'allrow':''}">${j===0?lineCell(g):''}
            <td class="kind"><i class="dot" style="background:${color}"></i> ${label}</td><td>${s.count}</td>${backCells(s)}${pct(s.ext)}${win(s.win20)}${pct(s.avg20)}</tr>`;
        }).join('');
      }).join('')}</tbody>
    </table></div>`;
  const candleInsight = (groups, isDown)=> groups.map(g=>{
    const all = g.first.concat(g.later);
    const r = mythSummary(all.filter(e=>e.candle==='red')), b = mythSummary(all.filter(e=>e.candle==='black'));
    if (Number.isNaN(r.backRate) || Number.isNaN(b.backRate)) return '';
    const p = v=> (v*100).toFixed(0)+'%';
    const act = isDown ? '站回均線(有撐)' : '跌回均線(有壓)';
    const who = Math.abs(r.backRate-b.backRate) < 0.03 ? '紅K與黑K差不多' : (r.backRate > b.backRate ? '收<b class="up">紅K</b>較常' : '收<b class="down">黑K</b>較常') + act;
    const few = Math.min(r.count, b.count) < MYTH_FEW ? `<span class="mute">(${r.count<b.count?'紅K':'黑K'}僅 ${Math.min(r.count,b.count)} 次，樣本少、參考性低)</span>` : '';
    return `<li><b>${g.line.name}</b>：${isDown?'跌破':'突破'}當天收紅K ${p(r.backRate)}(${r.count}次)、收黑K ${p(b.backRate)}(${b.count}次)在${prm.confirmDays}日內${act} → ${who}${few}。</li>`;
  }).join('');
  const insight = (groups, isDown)=> groups.map(g=>{
    const f = mythSummary(g.first), l = mythSummary(g.later);
    if (!f.count && !l.count) return '';
    const p = v=> Number.isNaN(v) ? '—' : (v*100).toFixed(0)+'%';
    const verb = isDown ? '跌破' : '突破', act = isDown ? '站回均線' : '跌回均線';
    const stronger = Number.isNaN(f.backRate)||Number.isNaN(l.backRate) ? '' :
      (Math.abs(f.backRate-l.backRate) < 0.03 ? '兩者相近' : f.backRate > l.backRate ? `初次${verb}較常${act}` : `後續${verb}較常${act}`);
    const few = f.count < MYTH_FEW ? `<span class="mute">(初次${verb}僅 ${f.count} 次，樣本少、參考性低)</span>` : '';
    return `<li><b>${g.line.name}</b>：初次${verb}後 ${p(f.backRate)} 在${prm.confirmDays}日內${act}，後續${verb} ${p(l.backRate)}${stronger?`(${stronger})`:''}；初次${verb}後20日勝率 ${p(f.win20)}、平均報酬 ${Number.isNaN(f.avg20)?'—':fmtPct(f.avg20)}${few}。</li>`;
  }).join('');
  return `
    <div class="panel paramfold ${paramFoldCls()}">
      ${paramFoldHead('判定參數')}
      <div class="paramfold-body">
      <div class="paramgrid">
        <div class="paramitem">
          <label>初次的定義(連續站在均線之上的天數) 均線天數的 <b>${prm.settlePct}%</b></label>
          <input type="range" min="25" max="100" step="5" value="${prm.settlePct}"
            onchange="setMythParam('settlePct',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'%'">
        </div>
        <div class="paramitem">
          <label>假跌破／假突破：幾日內回到均線 <b>${prm.confirmDays}日</b></label>
          <input type="range" min="1" max="5" step="1" value="${prm.confirmDays}"
            onchange="setMythParam('confirmDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'日'">
        </div>
      </div>
      <div class="note">跌破＝收盤從均線之上跌到之下，突破反之。穿越前已連續在均線同一側 ${MYTH_LINES.map(L=>`${L.name} ${settleOf(L.p, prm)} 日`).join('、')} 以上算「初次」，否則算「後續」。穿越後 ${prm.confirmDays} 日內收盤回到均線另一側＝假跌破(有支撐)／假突破(有壓力)。表格另列 1 日內就回到均線的比例。報酬以穿越當天收盤為基準。</div>
      </div>
    </div>

    <div class="panel">
      <h3>跌破均線：有沒有支撐？</h3>
      ${table(res.down, true)}
      <ul class="insight">${insight(res.down, true)}</ul>
      ${candleTable(res.down, true)}
      <ul class="insight">${candleInsight(res.down, true)}</ul>
    </div>

    <div class="panel">
      <h3>突破均線：有沒有壓力？</h3>
      ${table(res.up, false)}
      <ul class="insight">${insight(res.up, false)}</ul>
      ${candleTable(res.up, false)}
      <ul class="insight">${candleInsight(res.up, false)}</ul>
      <div class="note">紅K／黑K＝穿越當天收盤高於／低於開盤，合併初次與後續穿越。歷史統計不代表未來。</div>
    </div>
    ${renderMay20(res.may20, state.active)}`;
}
