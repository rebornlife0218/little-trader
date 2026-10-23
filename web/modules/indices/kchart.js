/* 指數(4/7)：K 線圖(canvas)、十字線與鍵盤操作 */
/* ============================== Canvas 圖表 ============================== */
function drawChart(key){
  const rows = state.data[key]; if(!rows) return;
  const meta = state.meta[key] || {hasOHLC:true, hasVolume:true};
  const events = state.mode==='crash' ? (state.events[key]||[]) : [];
  const view = state.view[key] || {start:0,end:rows.length-1};
  const priceCanvas = document.getElementById('priceCanvas');
  if (!priceCanvas) return;
  const volCanvas = meta.hasVolume ? document.getElementById('volCanvas') : null;
  const dpr = window.devicePixelRatio||1;
  const wrapW = priceCanvas.parentElement.clientWidth;
  const priceH = 340, volH = 100;
  const C = chartColors();
  priceCanvas.width = wrapW*dpr; priceCanvas.height = priceH*dpr; priceCanvas.style.height=priceH+'px';
  const pctx = priceCanvas.getContext('2d'); pctx.scale(dpr,dpr);
  pctx.clearRect(0,0,wrapW,priceH);
  let vctx=null;
  if (volCanvas){
    volCanvas.width = wrapW*dpr; volCanvas.height = volH*dpr; volCanvas.style.height=volH+'px';
    vctx = volCanvas.getContext('2d'); vctx.scale(dpr,dpr);
    vctx.clearRect(0,0,wrapW,volH);
  }

  const s = clamp(view.start,0,rows.length-1), e = clamp(view.end,0,rows.length-1);
  const slice = rows.slice(s,e+1);
  if (slice.length<2) return;
  const padL=54, padR=14;
  const plotW = wrapW-padL-padR;
  const n = slice.length;
  const cw = plotW/n;
  const xAt = (i)=> padL + (i+0.5)*cw;

  let pmin=Infinity,pmax=-Infinity;
  slice.forEach(d=>{ pmin=Math.min(pmin,d.low); pmax=Math.max(pmax,d.high); });
  const maSet = state.ma[key];
  if (maSet){
    MA_PERIODS.forEach(p=>{
      for (let i=s;i<=e;i++){ const v=maSet[p][i]; if(!Number.isNaN(v)){ pmin=Math.min(pmin,v); pmax=Math.max(pmax,v); } }
    });
  }
  const pad=(pmax-pmin)*0.08 || pmax*0.02; pmin-=pad; pmax+=pad;
  const yAt = (v)=> 10 + (priceH-30)*(1-(v-pmin)/(pmax-pmin));

  pctx.strokeStyle=C.grid; pctx.fillStyle=C.text; pctx.font='10px IBM Plex Mono'; pctx.lineWidth=1;
  for (let g=0; g<=4; g++){
    const v = pmin + (pmax-pmin)*g/4; const y = yAt(v);
    pctx.beginPath(); pctx.moveTo(padL,y); pctx.lineTo(wrapW-padR,y); pctx.stroke();
    pctx.fillText(fmtNum(v,v>1000?0:2), 4, y+3);
  }

  events.forEach(ev=>{
    if (ev.bottomIdx < s-5 || ev.peakIdx > e+5) return;
    const declEndIdx = ev.bottomIdx;
    const reboundEndIdx = ev.recoverIdx>-1 ? ev.recoverIdx : Math.min(ev.bottomIdx + state.params[key].followUpDays, e);
    const x1 = xAt(clamp(ev.peakIdx,s,e)-s), x2 = xAt(clamp(declEndIdx,s,e)-s), x3 = xAt(clamp(reboundEndIdx,s,e)-s);
    pctx.fillStyle = hexA(C.down,0.10); pctx.fillRect(Math.min(x1,x2), 10, Math.abs(x2-x1)||1, priceH-30);
    pctx.fillStyle = hexA(C.up,0.08); pctx.fillRect(Math.min(x2,x3), 10, Math.abs(x3-x2)||1, priceH-30);
    const markAt=(idx,color,shape)=>{
      if (idx<s || idx>e) return;
      const x = xAt(idx-s), y = yAt(rows[idx].close);
      pctx.fillStyle=color;
      pctx.beginPath();
      if (shape==='down') { pctx.moveTo(x-4,y-10); pctx.lineTo(x+4,y-10); pctx.lineTo(x,y-2); }
      else if (shape==='up') { pctx.moveTo(x-4,y+10); pctx.lineTo(x+4,y+10); pctx.lineTo(x,y+2); }
      else if (shape==='diamond') { pctx.moveTo(x,y-8); pctx.lineTo(x+6,y); pctx.lineTo(x,y+8); pctx.lineTo(x-6,y); }
      else { pctx.arc(x,y-10,3.5,0,7); }
      pctx.closePath(); pctx.fill();
    };
    markAt(ev.peakIdx, C.down,'down');
    markAt(ev.bottomIdx, C.blue,'up');
    if (ev.recoverIdx>-1) markAt(ev.recoverIdx,C.up,'diamond');
    if (ev.newHighIdx>-1) markAt(ev.newHighIdx,C.amber,'star');
  });

  if (meta.hasOHLC){
    slice.forEach((d,i)=>{
      const x = xAt(i); const up = d.close>=d.open;
      pctx.strokeStyle= up? C.up:C.down; pctx.fillStyle= up? C.up:C.down; pctx.lineWidth=1;
      pctx.beginPath(); pctx.moveTo(x,yAt(d.high)); pctx.lineTo(x,yAt(d.low)); pctx.stroke();
      const yo=yAt(d.open), yc=yAt(d.close);
      const bw = Math.max(cw*0.62,1);
      pctx.fillRect(x-bw/2, Math.min(yo,yc), bw, Math.max(Math.abs(yc-yo),1));
    });
  } else {
    pctx.beginPath();
    slice.forEach((d,i)=>{ const x=xAt(i), y=yAt(d.close); if(i===0) pctx.moveTo(x,y); else pctx.lineTo(x,y); });
    pctx.strokeStyle=C.blue; pctx.lineWidth=1.6; pctx.stroke();
    pctx.lineTo(xAt(n-1), priceH-20); pctx.lineTo(xAt(0), priceH-20); pctx.closePath();
    const grad = pctx.createLinearGradient(0,10,0,priceH-20);
    grad.addColorStop(0,hexA(C.blue,0.28)); grad.addColorStop(1,hexA(C.blue,0.02));
    pctx.fillStyle=grad; pctx.fill();
  }

  pctx.fillStyle=C.text; pctx.font='10px IBM Plex Mono';
  const labelEvery = Math.max(1, Math.floor(n/6));
  for (let i=0;i<n;i+=labelEvery){ pctx.fillText(slice[i].date, xAt(i)-24, priceH-4); }

  // 移動平均線疊圖 (5/10/20/60/120/240MA)
  if (maSet){
    MA_PERIODS.forEach(p=>{
      const arr = maSet[p];
      pctx.beginPath();
      let started=false;
      for (let i=0;i<n;i++){
        const v = arr[s+i];
        if (Number.isNaN(v)){ started=false; continue; }
        const x=xAt(i), y=yAt(v);
        if (!started){ pctx.moveTo(x,y); started=true; } else { pctx.lineTo(x,y); }
      }
      pctx.strokeStyle = C.ma[p];
      pctx.lineWidth = p===240? 1.8 : p===120? 1.6 : p===60? 1.4 : 1.1;
      pctx.globalAlpha = 0.9;
      pctx.stroke();
      pctx.globalAlpha = 1;
    });
  }

  if (vctx){
    const vma = maSet && maSet.vol5;
    let vmax=0; slice.forEach((d,i)=>{ vmax=Math.max(vmax,d.volume||0); if (vma && !Number.isNaN(vma[s+i])) vmax=Math.max(vmax,vma[s+i]); });
    vctx.strokeStyle=C.grid; vctx.beginPath(); vctx.moveTo(padL,volH-14); vctx.lineTo(wrapW-padR,volH-14); vctx.stroke();
    slice.forEach((d,i)=>{
      const x=xAt(i); const h=(vmax>0)? (d.volume/vmax)*(volH-24):0;
      vctx.fillStyle = d.close>=d.open? hexA(C.up,0.55):hexA(C.down,0.55);
      const bw=Math.max(cw*0.62,1);
      vctx.fillRect(x-bw/2, volH-14-h, bw, h);
    });
    // 成交量5MA
    if (vma && vmax>0){
      vctx.beginPath(); let started=false;
      for (let i=0;i<n;i++){
        const v = vma[s+i]; if (Number.isNaN(v)){ started=false; continue; }
        const x=xAt(i), y=volH-14-(v/vmax)*(volH-24);
        if (!started){ vctx.moveTo(x,y); started=true; } else vctx.lineTo(x,y);
      }
      vctx.strokeStyle=C.ma[5]; vctx.lineWidth=1.3; vctx.stroke();
    }
  }

  // 點選的K棒：十字線(垂直虛線 + 收盤價水平線)，左側價格軸標收盤價；不框住K棒
  const cur = state.cursor[key];
  if (cur!=null && cur>=s && cur<=e){
    const x = xAt(cur-s), yc = yAt(rows[cur].close);
    pctx.save();
    pctx.strokeStyle = C.cursor; pctx.globalAlpha = 0.55; pctx.setLineDash([4,3]); pctx.lineWidth = 1;
    pctx.beginPath(); pctx.moveTo(x,10); pctx.lineTo(x,priceH-20); pctx.moveTo(padL,yc); pctx.lineTo(wrapW-padR,yc); pctx.stroke();
    pctx.setLineDash([]); pctx.globalAlpha = 1;
    const label = fmtNum(rows[cur].close, rows[cur].close>1000?0:2);
    pctx.font = '600 11px IBM Plex Mono';
    const tw = pctx.measureText(label).width + 8;
    pctx.fillStyle = C.amber; pctx.fillRect(Math.max(0, padL-tw-2), yc-8, tw, 16);
    pctx.fillStyle = LT.cssVar('--on-amber'); pctx.fillText(label, Math.max(4, padL-tw+2), yc+4);
    pctx.restore();
    if (vctx){ vctx.save(); vctx.strokeStyle=C.cursor; vctx.globalAlpha=0.5; vctx.setLineDash([4,3]); vctx.beginPath(); vctx.moveTo(x,0); vctx.lineTo(x,volH-14); vctx.stroke(); vctx.restore(); }
  }

  // 互動：滾輪縮放、拖曳平移、點選K棒(指標事件，換頁重繪時不會殘留監聽器)
  priceCanvas._geo = {s, e, padL, plotW, cw};
  if (!priceCanvas._wired){
    priceCanvas._wired = true;
    priceCanvas.tabIndex = 0;
    let drag = null;
    priceCanvas.addEventListener('wheel',(ev)=>{
      ev.preventDefault();
      const g = priceCanvas._geo, v = state.view[state.active]; if(!v) return;
      const curRows = state.data[state.active]; const range = v.end-v.start;
      const factor = ev.deltaY>0? 1.15 : 0.87;
      const newRange = clamp(Math.round(range*factor), 20, curRows.length-1);
      const rect = priceCanvas.getBoundingClientRect();
      const relX = clamp((ev.clientX-rect.left-g.padL)/g.plotW,0,1);
      const centerIdx = v.start + relX*range;
      let ns = Math.round(centerIdx - relX*newRange);
      let ne = ns+newRange;
      ns=clamp(ns,0,curRows.length-1); ne=clamp(ne,ns+10,curRows.length-1);
      state.view[state.active]={start:ns,end:ne};
      drawChart(state.active);
    }, {passive:false});
    priceCanvas.addEventListener('pointerdown',(ev)=>{
      drag = {x:ev.clientX, view:{...state.view[state.active]}, moved:false};
      priceCanvas.setPointerCapture(ev.pointerId);
    });
    priceCanvas.addEventListener('pointermove',(ev)=>{
      if (!drag) return;
      const dx = ev.clientX-drag.x;
      if (Math.abs(dx)>4) drag.moved = true;
      if (!drag.moved) return;
      const g = priceCanvas._geo, v = drag.view, curRows = state.data[state.active], range = v.end-v.start;
      const shift = Math.round(-dx/g.cw);
      const ns = clamp(v.start+shift,0,curRows.length-1-range);
      state.view[state.active] = {start:ns, end:ns+range};
      drawChart(state.active);
    });
    priceCanvas.addEventListener('pointerup',(ev)=>{
      if (drag && !drag.moved){
        const g = priceCanvas._geo, rect = priceCanvas.getBoundingClientRect();
        const i = Math.floor((ev.clientX-rect.left-g.padL)/g.cw);
        if (i>=0 && i<=g.e-g.s){ setCursor(g.s+i, false); priceCanvas.focus({preventScroll:true}); }
      }
      drag = null;
    });
    priceCanvas.addEventListener('pointercancel',()=>{ drag = null; });
  }
}

// 點選K棒後顯示開高低收量；鍵盤 ← → 移動(移出畫面時自動平移)，Esc 取消
function setCursor(idx, ensureVisible){
  const key = state.active, rows = state.data[key]; if (!rows) return;
  idx = clamp(idx, 0, rows.length-1);
  state.cursor[key] = idx;
  if (ensureVisible){
    const v = state.view[key], range = v.end-v.start;
    if (idx < v.start) state.view[key] = {start:idx, end:idx+range};
    else if (idx > v.end) state.view[key] = {start:idx-range, end:idx};
  }
  drawChart(key);
  updateOhlcInfo();
}
function fmtVol(v){
  if (!v) return '—';
  if (v>=1e8) return (v/1e8).toFixed(2)+'億';
  if (v>=1e4) return (v/1e4).toFixed(0)+'萬';
  return fmtNum(v,0);
}
// 台灣加權的成交量是證交所成交金額(元)，其他指數為 Yahoo Finance 成交量
function volLabel(key){ return key==='TAIEX' ? '成交值' : '量'; }
function updateOhlcInfo(){
  const el = document.getElementById('ohlcInfo'); if (!el) return;
  const key = state.active, rows = state.data[key], i = state.cursor[key];
  if (i==null || !rows || !rows[i]){
    el.innerHTML = '<span class="mute">點選K棒可查看當日開高低收與成交量，之後可用鍵盤 ← → 左右移動</span>';
    return;
  }
  const d = rows[i], chg = i>0 ? d.close/rows[i-1].close-1 : NaN;
  const cls = chg>=0 ? 'up' : 'down', f = v=>fmtNum(v, v>1000?0:2);
  // 各 MA 後面的箭頭：當天的 MA 比前一天高(斜率向上)↑、低 ↓
  const mas = MA_PERIODS.map(p=>{
    const arr=state.ma[key]&&state.ma[key][p], v=arr&&arr[i], pv=arr&&i>0?arr[i-1]:NaN;
    if (Number.isNaN(v)||v==null) return '';
    const arrow = Number.isNaN(pv)||pv==null ? '' : v>pv ? '<b class="up">↑</b>' : v<pv ? '<b class="down">↓</b>' : '';
    return `<span><i class="dot" style="background:var(--ma${p})"></i>${p}MA <em>${f(v)}</em>${arrow}</span>`; }).join('');
  el.innerHTML = `<b>${d.date}</b>
    <span>開 <em>${f(d.open)}</em></span><span>高 <em>${f(d.high)}</em></span><span>低 <em>${f(d.low)}</em></span>
    <span>收 <em class="${cls}">${f(d.close)}</em></span><span class="${cls}">${fmtPct(chg,2)}</span>
    <span>${volLabel(key)} <em>${fmtVol(d.volume)}</em></span>${(()=>{ const v=state.ma[key]&&state.ma[key].vol5[i]; return v>0 ? `<span>${VOL_MA}日均${volLabel(key)==='量'?'量':'值'} <em>${fmtVol(v)}</em></span>` : ''; })()}${mas}
    <span class="mute">← → 移動 · Esc 取消</span>`;
}
document.addEventListener('keydown', (ev)=>{
  if (!document.getElementById('priceCanvas')) return;
  const key = state.active; if (state.cursor[key]==null) return;
  const tag = (ev.target && ev.target.tagName || '').toLowerCase();
  if (tag==='input' || tag==='select' || tag==='textarea') return;
  if (ev.key==='ArrowLeft'){ ev.preventDefault(); setCursor(state.cursor[key]-1, true); }
  else if (ev.key==='ArrowRight'){ ev.preventDefault(); setCursor(state.cursor[key]+1, true); }
  else if (ev.key==='Escape'){ state.cursor[key] = null; drawChart(key); updateOhlcInfo(); }
});
