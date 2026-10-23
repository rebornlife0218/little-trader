/* 指數(5/7)：模式二 常見迷思(均線的支撐與壓力、520 行情) */
/* ============================== 常見迷思：均線的支撐與壓力、520 行情 ==============================
   跌破：前一日收盤在均線上、當日收盤在均線下；突破反之。
   初次跌破(突破)：之前已連續 settleDays 日以上站在均線上(下)；否則為後續(反覆)跌破(突破)。
   有支撐：跌破後 confirmDays 日內收盤又站回均線(假跌破)；有壓力：突破後 confirmDays 日內又跌回均線(假突破)。 */
const MYTH_LINES = [{p:20, name:'月線'}, {p:60, name:'季線'}, {p:120, name:'半年線'}, {p:240, name:'年線'}];
function computeMyth(rows, ma, prm){
  const n = rows.length, closes = rows.map(r=>r.close);
  const fwd = (i,k)=> i+k<n ? closes[i+k]/closes[i]-1 : NaN;
  const out = {down:[], up:[]};
  MYTH_LINES.forEach(L=>{
    const arr = ma[L.p];
    const down = {first:[], later:[]}, up = {first:[], later:[]};
    let runAbove = 0, runBelow = 0;
    for (let i=0;i<n;i++){
      const m = arr[i];
      if (Number.isNaN(m)){ runAbove = runBelow = 0; continue; }
      const above = closes[i] >= m;
      if (i>0 && !Number.isNaN(arr[i-1])){
        const prevAbove = closes[i-1] >= arr[i-1];
        if (prevAbove !== above){
          const end = Math.min(i+prm.confirmDays, n-1), ext20 = Math.min(i+20, n-1);
          let back = false;
          for (let k=i+1;k<=end;k++){ if ((closes[k]>=arr[k]) === prevAbove){ back = true; break; } }
          let extreme = prevAbove ? Infinity : -Infinity;
          for (let k=i+1;k<=ext20;k++) extreme = prevAbove ? Math.min(extreme, rows[k].low) : Math.max(extreme, rows[k].high);
          const ev = { idx:i, date:rows[i].date, back: i+prm.confirmDays<n ? back : null,
            candle: rows[i].close>rows[i].open ? 'red' : rows[i].close<rows[i].open ? 'black' : 'flat',
            ext: ext20>i ? extreme/closes[i]-1 : NaN,
            ret5:fwd(i,5), ret10:fwd(i,10), ret20:fwd(i,20), ret60:fwd(i,60) };
          if (prevAbove) down[runAbove>=prm.settleDays ? 'first' : 'later'].push(ev);
          else up[runBelow>=prm.settleDays ? 'first' : 'later'].push(ev);
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
  const done = list.filter(e=>e.back!==null);
  return { count:list.length, backRate: done.length? done.filter(e=>e.back).length/done.length : NaN, ext:avg('ext'),
    win5:win('ret5'), win10:win('ret10'), win20:win('ret20'), win60:win('ret60'),
    avg5:avg('ret5'), avg10:avg('ret10'), avg20:avg('ret20'), avg60:avg('ret60'),
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
  const sumRow = (label, list, cls)=>{
    const ss = F.map(f=>may20Summary(list,f)), fe = may20Summary(list,'fromElec');
    return `<tr class="${cls}"><td colspan="2">${label}平均(${list.length} 年)</td>${list===inaug?pct(fe.avg):'<td class="na">—</td>'}${ss.map(x=>pct(x.avg)).join('')}</tr>
      <tr class="${cls}"><td colspan="2">${label}上漲機率</td>${list===inaug?win(fe.win):'<td class="na">—</td>'}${ss.map(x=>win(x.win)).join('')}</tr>`;
  };
  const baseRow = `<tr><td colspan="2">任意一天(基準)平均</td><td class="na">—</td>${pct(B.d20.avg)}${pct(B.d5.avg)}${pct(B.d5.avg)}${pct(B.d20.avg)}${pct(B.d60.avg)}</tr>
    <tr><td colspan="2">任意一天(基準)上漲機率</td><td class="na">—</td>${win(B.d20.win)}${win(B.d5.win)}${win(B.d5.win)}${win(B.d20.win)}${win(B.d60.win)}</tr>`;
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
      <div class="tablewrap"><table class="stattable cycle">
        <thead>
          <tr><th rowspan="2">年度</th><th rowspan="2">基準日<br>(5/20 前收盤)</th><th rowspan="2">選後至就職<br>(選前收盤→520)</th><th colspan="2">520 前</th><th colspan="3">520 後(以基準日收盤計)</th></tr>
          <tr><th>20 日</th><th>5 日</th><th>+5 日</th><th>+20 日</th><th>+60 日</th></tr>
        </thead>
        <tbody>
          ${res.years.map(x=>`<tr class="click ${x.inaug?'inaug':''}" onclick="focusDate('${key}',${x.base})"><td>${x.y}${x.inaug?' <span class="tag elec">就職</span>':''}</td><td>${x.date}</td>${x.inaug?pct(x.fromElec):'<td class="na">—</td>'}${F.map(f=>pct(x[f])).join('')}</tr>`).join('')}
          ${sumRow('就職年', inaug, 'allrow')}
          ${sumRow('非就職年', other, '')}
          ${baseRow}
        </tbody>
      </table></div>
      <ul class="insight">${insight}</ul>
      <div class="note">520 是總統就職日(1996 年起每 4 年一次，本表資料自 ${res.years.length?res.years[0].y:'—'} 年起)。基準日＝5/20 當天或之前最後一個交易日的收盤；「520 前 20 日／5 日」＝基準日相對 20／5 個交易日前的漲跌，「520 後」皆以基準日收盤為基準；「選後至就職」＝總統大選投票日前收盤到基準日的漲跌。「任意一天(基準)」是所有交易日同天期報酬的平均與上漲機率，用來判斷 520 前後是否真的特別。點選列可在K線圖上定位。就職年只有 ${inaug.length} 次，樣本很少，僅供參考。</div>
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
  const table = (groups, isDown)=>`
    <div class="tablewrap"><table class="stattable myth">
      <thead>
        <tr><th rowspan="2">均線</th><th rowspan="2">類型</th><th rowspan="2">次數</th>
          <th rowspan="2">${prm.confirmDays}日內${isDown?'站回均線<br>(有支撐)':'跌回均線<br>(有壓力)'}</th>
          <th rowspan="2">20日內平均<br>${isDown?'最大續跌':'最大續漲'}</th>
          <th colspan="4">勝率(上漲機率)</th><th colspan="4">平均報酬率</th></tr>
        <tr><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th></tr>
      </thead>
      <tbody>${groups.map(g=>[['first', isDown?'初次跌破':'初次突破'], ['later', isDown?'後續跌破':'後續突破']].map(([t,label],j)=>{
        const s = mythSummary(g[t]);
        return `<tr class="${j===0?'allrow':''}">${j===0?`<td rowspan="2" class="line">${g.line.name}<small>${g.line.p}MA</small></td>`:''}
          <td class="kind">${label}</td><td>${s.count}</td>${rate(s.backRate)}${pct(s.ext)}
          ${win(s.win5)}${win(s.win10)}${win(s.win20)}${win(s.win60)}${pct(s.avg5)}${pct(s.avg10)}${pct(s.avg20)}${pct(s.avg60)}</tr>`;
      }).join('')).join('')}</tbody>
    </table></div>`;
  // 穿越當天收紅K還是黑K：哪一種比較容易有支撐(跌破)／有壓力(突破)
  const candleTable = (groups, isDown)=>`
    <h4 class="subhead">${isDown?'跌破當天收紅K還是黑K，比較容易有撐？':'突破當天收紅K還是黑K，比較容易遇到壓力？'}</h4>
    <div class="tablewrap"><table class="stattable myth">
      <thead>
        <tr><th rowspan="2">均線</th><th rowspan="2">${isDown?'跌破':'突破'}當天</th><th rowspan="2">次數</th>
          <th rowspan="2">${prm.confirmDays}日內${isDown?'站回均線<br>(有支撐)':'跌回均線<br>(有壓力)'}</th>
          <th colspan="3">勝率(上漲機率)</th><th colspan="3">平均報酬率</th></tr>
        <tr><th>+5日</th><th>+10日</th><th>+20日</th><th>+5日</th><th>+10日</th><th>+20日</th></tr>
      </thead>
      <tbody>${groups.map(g=>{
        const all = g.first.concat(g.later);
        return [['red','紅K','var(--candle-up)'],['black','黑K','var(--candle-down)']].map(([c,label,color],j)=>{
          const s = mythSummary(all.filter(e=>e.candle===c));
          return `<tr class="${j===0?'allrow':''}">${j===0?`<td rowspan="2" class="line">${g.line.name}<small>${g.line.p}MA</small></td>`:''}
            <td class="kind"><i class="dot" style="background:${color}"></i> ${label}</td><td>${s.count}</td>${rate(s.backRate)}
            ${win(s.win5)}${win(s.win10)}${win(s.win20)}${pct(s.avg5)}${pct(s.avg10)}${pct(s.avg20)}</tr>`;
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
    const few = Math.min(r.count, b.count) < 20 ? `<span class="mute">(${r.count<b.count?'紅K':'黑K'}僅 ${Math.min(r.count,b.count)} 次，樣本少、參考性低)</span>` : '';
    return `<li><b>${g.line.name}</b>：${isDown?'跌破':'突破'}當天收紅K ${p(r.backRate)}(${r.count}次)、收黑K ${p(b.backRate)}(${b.count}次)在${prm.confirmDays}日內${act} → ${who}${few}。</li>`;
  }).join('');
  const insight = (groups, isDown)=> groups.map(g=>{
    const f = mythSummary(g.first), l = mythSummary(g.later);
    if (!f.count && !l.count) return '';
    const p = v=> Number.isNaN(v) ? '—' : (v*100).toFixed(0)+'%';
    const verb = isDown ? '跌破' : '突破', act = isDown ? '站回均線' : '跌回均線';
    const stronger = Number.isNaN(f.backRate)||Number.isNaN(l.backRate) ? '' :
      (Math.abs(f.backRate-l.backRate) < 0.03 ? '兩者相近' : f.backRate > l.backRate ? `初次${verb}較常${act}` : `後續${verb}較常${act}`);
    return `<li><b>${g.line.name}</b>：初次${verb}後 ${p(f.backRate)} 在${prm.confirmDays}日內${act}，後續${verb} ${p(l.backRate)}${stronger?`(${stronger})`:''}；初次${verb}後20日勝率 ${p(f.win20)}、平均報酬 ${Number.isNaN(f.avg20)?'—':fmtPct(f.avg20)}。</li>`;
  }).join('');
  return `
    <div class="panel">
      <h3>判定參數</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>初次的定義(連續站在均線之上) <b>${prm.settleDays}日</b></label>
          <input type="range" min="5" max="60" step="1" value="${prm.settleDays}"
            onchange="setMythParam('settleDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'日'">
        </div>
        <div class="paramitem">
          <label>觀察天數(跌破或突破後) <b>${prm.confirmDays}日</b></label>
          <input type="range" min="1" max="5" step="1" value="${prm.confirmDays}"
            onchange="setMythParam('confirmDays',+this.value)" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'日'">
        </div>
      </div>
      <div class="note">跌破＝前一日收盤在均線之上、當日收盤落到均線之下；突破反之。跌破前已連續 ${prm.settleDays} 日以上站在均線之上(突破則為之下)才算「初次」，剛穿越不久又再穿越的算「後續」(反覆)。有支撐＝跌破後 ${prm.confirmDays} 日內收盤又站回均線(假跌破)；有壓力＝突破後 ${prm.confirmDays} 日內又跌回均線(假突破)。報酬以穿越當天收盤價為基準。</div>
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
      <div class="note">常見說法如「跌破季線就該出場」「突破年線就會大漲」，可對照上表的勝率與報酬檢驗是否成立。紅K／黑K分析合併初次與後續穿越的所有事件，以穿越當天的K棒顏色分組(收盤＞開盤為紅K)。歷史統計不代表未來，樣本數少時僅供參考。</div>
    </div>
    ${renderMay20(res.may20, state.active)}`;
}
