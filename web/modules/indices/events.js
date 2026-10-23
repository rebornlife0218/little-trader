/* 指數(3/7)：急跌與反彈的偵測、資料載入、參數設定 */
// 反彈期間逐一檢查是否站上/遇壓每一條均線(收盤價需連續holdDays天不跌破才算站穩)
const STALL_PULLBACK_PCT = 0.02;
function findStallPoint(closes, ma, bottomIdx, fEnd){
  let peakIdx = bottomIdx, peakClose = closes[bottomIdx];
  for (let k=bottomIdx+1;k<=fEnd;k++){
    if (closes[k] > peakClose){ peakClose = closes[k]; peakIdx = k; }
    else if ((peakClose-closes[k])/peakClose >= STALL_PULLBACK_PCT){
      const b20 = !Number.isNaN(ma[20][peakIdx]) ? (peakClose-ma[20][peakIdx])/ma[20][peakIdx] : NaN;
      const b60 = !Number.isNaN(ma[60][peakIdx]) ? (peakClose-ma[60][peakIdx])/ma[60][peakIdx] : NaN;
      return { stallIdx:peakIdx, stallBias20:b20, stallBias60:b60 };
    }
  }
  return null; // 追蹤期間內反彈未曾拉回3%以上，視為未觸發無力訊號(持續強勢)
}

/* ============================== 崩跌/反彈偵測演算法 ============================== */
function computeEvents(data, p, ma, regimes){
  const n = data.length;
  const dropPct = p.dropPct/100, windowDays = p.windowDays, bottomSearchDays = p.bottomSearchDays, followUpDays = p.followUpDays;
  const closes = data.map(d=>d.close), lows = data.map(d=>d.low), vols = data.map(d=>d.volume||0);
  const runningMax = new Array(n); let rm=-Infinity;
  for (let i=0;i<n;i++){ rm=Math.max(rm,closes[i]); runningMax[i]=rm; }
  const events = [];
  let idx = windowDays, lastBottom = -1;
  while (idx < n){
    // 起跌點須落在上一事件底部之後，避免同一段下跌被重複記錄(重複的起跌日/底部日)
    const winStart = Math.max(idx-windowDays, lastBottom+1);
    if (winStart >= idx){ idx += 1; continue; }
    let peakIdx = winStart, peakVal = closes[peakIdx];
    for (let k=winStart;k<=idx;k++){ if (closes[k]>peakVal){ peakVal=closes[k]; peakIdx=k; } }
    const dd = (closes[idx]-peakVal)/peakVal;
    if (dd <= dropPct){
      const bEnd = Math.min(peakIdx+bottomSearchDays, n-1);
      let bottomIdx = peakIdx+1, bottomVal = lows[peakIdx+1];
      for (let k=peakIdx+1;k<=bEnd;k++){ if (lows[k]<bottomVal){ bottomVal=lows[k]; bottomIdx=k; } }
      const fEnd = Math.min(bottomIdx+followUpDays, n-1);
      let recoverIdx=-1;
      for (let k=bottomIdx+1;k<=fEnd;k++){ if (closes[k]>=peakVal){ recoverIdx=k; break; } }
      const priorATH = runningMax[peakIdx];
      let newHighIdx=-1;
      for (let k=bottomIdx+1;k<=fEnd;k++){ if (closes[k]>=priorATH){ newHighIdx=k; break; } }
      // 成交量比值：下跌區間(起跌隔日～底部當天，共 daysToBottom 天，含底部K棒) vs 反彈區間取「反彈隔日起同樣天數(daysToBottom)」，
      // 兩側天數一致才能比較「單位時間量能強度」
      const daysToBottomForVol = bottomIdx - peakIdx;
      let downVol=0; for(let k=peakIdx+1;k<=bottomIdx;k++) downVol+=vols[k];
      let upVol=NaN;
      const upWindowEnd = bottomIdx+daysToBottomForVol;
      if (daysToBottomForVol>0 && upWindowEnd < n){ upVol=0; for(let k=bottomIdx+1;k<=upWindowEnd;k++) upVol+=vols[k]; }
      const ratio = (upVol>0)? downVol/upVol : NaN;
      // 報酬率：一律以「底部當天收盤價」為基準，往後數N個交易日的收盤價計算
      const ret5 = (bottomIdx+5<n)? closes[bottomIdx+5]/closes[bottomIdx]-1 : NaN;
      const ret10 = (bottomIdx+10<n)? closes[bottomIdx+10]/closes[bottomIdx]-1 : NaN;
      const ret20 = (bottomIdx+20<n)? closes[bottomIdx+20]/closes[bottomIdx]-1 : NaN;
      const ret60 = (bottomIdx+60<n)? closes[bottomIdx+60]/closes[bottomIdx]-1 : NaN;
      let reDecline=null;
      if (recoverIdx>-1){
        const rEnd = Math.min(recoverIdx+followUpDays, n-1);
        reDecline=false;
        for (let k=recoverIdx+1;k<=rEnd;k++){ if (closes[k]<peakVal){ reDecline=true; break; } }
      }
      // 谷底乖離率：底部收盤價相對於20日線/60日線偏離的幅度，越負代表跌得越深、越可能超跌
      const bias20 = (ma && !Number.isNaN(ma[20][bottomIdx])) ? (closes[bottomIdx]-ma[20][bottomIdx])/ma[20][bottomIdx] : NaN;
      const bias60 = (ma && !Number.isNaN(ma[60][bottomIdx])) ? (closes[bottomIdx]-ma[60][bottomIdx])/ma[60][bottomIdx] : NaN;
      const stall = ma ? findStallPoint(closes, ma, bottomIdx, fEnd) : null;
      events.push({ peakIdx, peakVal, bottomIdx, bottomVal,
        dropActual:(bottomVal-peakVal)/peakVal, daysToBottom: bottomIdx-peakIdx,
        recoverIdx, daysToRecover: recoverIdx>-1? recoverIdx-bottomIdx: null,
        newHighIdx, daysToNewHigh: newHighIdx>-1? newHighIdx-bottomIdx: null,
        downVol, upVol, ratio, ret5, ret10, ret20, ret60, reDecline,
        bias20, bias60, stall, bottomRegime: regimes[bottomIdx] });
      lastBottom = bottomIdx;
      idx = Math.max(bottomIdx+1, idx+1); // 確保索引恆向前推進，避免異常資料造成無窮迴圈
    } else { idx += 1; }
  }
  return events;
}

function computeSummary(events){
  const stat = (field)=>{
    const withRet = events.filter(e=>!Number.isNaN(e[field]));
    const win = withRet.length? withRet.filter(e=>e[field]>0).length/withRet.length : NaN;
    const avg = withRet.length? withRet.reduce((a,e)=>a+e[field],0)/withRet.length : NaN;
    return {win, avg};
  };
  const s5=stat('ret5'), s10=stat('ret10'), s20=stat('ret20'), s60=stat('ret60');
  const newHighProb = events.length? events.filter(e=>e.newHighIdx>-1).length/events.length : NaN;
  const recovered = events.filter(e=>e.recoverIdx>-1);
  const reDeclineProb = recovered.length? recovered.filter(e=>e.reDecline).length/recovered.length : NaN;
  const withBias20 = events.filter(e=>!Number.isNaN(e.bias20));
  const withBias60 = events.filter(e=>!Number.isNaN(e.bias60));
  const avgBias20 = withBias20.length? withBias20.reduce((a,e)=>a+e.bias20,0)/withBias20.length : NaN;
  const avgBias60 = withBias60.length? withBias60.reduce((a,e)=>a+e.bias60,0)/withBias60.length : NaN;
  const withStall = events.filter(e=>e.stall && !Number.isNaN(e.stall.stallBias20));
  const withStall60 = events.filter(e=>e.stall && !Number.isNaN(e.stall.stallBias60));
  const avgStallBias20 = withStall.length? withStall.reduce((a,e)=>a+e.stall.stallBias20,0)/withStall.length : NaN;
  const avgStallBias60 = withStall60.length? withStall60.reduce((a,e)=>a+e.stall.stallBias60,0)/withStall60.length : NaN;
  const noStallCount = events.filter(e=>e.stall===null).length;
  return {count:events.length,
    win5:s5.win, avg5:s5.avg, win10:s10.win, avg10:s10.avg,
    win20:s20.win, avg20:s20.avg, win60:s60.win, avg60:s60.avg,
    newHighProb, reDeclineProb, avgBias20, avgBias60,
    avgStallBias20, avgStallBias60, stallSampleCount:withStall.length, noStallCount};
}
/* ============================== 資料載入 ==============================
   每個指數一個 JSON(data/indices/<代號>.json)，先載入正在看的指數，其餘於背景預先下載 */
async function init(){
  try{ const d=localStorage.getItem('lt.regimeDef'); if (REGIME_DEFS.find(x=>x.key===d)) state.regimeDef=d; }catch(e){}
  render();
  try{
    state.dataMeta = await LT.dataset(INDICES_DATASET);
    const avail = state.dataMeta.indices || {};
    state.indexList = INDICES.filter(c=>avail[c.key]).map(c=>({key:c.key, name:c.name}));
    if (!state.indexList.length) throw new Error('沒有可用的指數資料');
    if (!avail[state.active]) state.active = state.indexList[0].key;
    await loadIndex(state.active);
    state.dataStatus = 'ok';
  }catch(err){
    console.warn('載入資料失敗', err);
    state.dataStatus = 'error';
    state.dataError = String(err && err.message || err);
  }
  render();
}
// 使用者準備切換指數時(滑過/點開選單)才預先下載其他指數，節省流量又能快速切換
function prefetchIndices(){ state.indexList.forEach(c=>loadIndex(c.key).catch(()=>{})); }
function loadIndex(key){
  if (state.data[key]) return Promise.resolve();
  if (state.loading[key]) return state.loading[key];
  state.loading[key] = fetch(LT.dataUrl(INDICES_DATASET, key+'.json', state.dataMeta)).then(r=>{
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }).then(j=>{
    const rows = new Array(j.d.length);
    for (let i=0;i<j.d.length;i++) rows[i] = {date:j.d[i], open:j.o[i], high:j.h[i], low:j.l[i], close:j.c[i], volume:j.v[i]||0};
    state.data[key] = rows;
    state.meta[key] = {name:TICKER_NAMES[key]||key, hasOHLC:true, hasVolume:rows.some(r=>r.volume>0)};
    state.params[key] = state.params[key] || {...DEFAULT_PARAMS};
    state.candleParams[key] = state.candleParams[key] || {...DEFAULT_CANDLE_PARAMS};
    state.view[key] = {start:0, end:rows.length-1};
  }).finally(()=>{ delete state.loading[key]; });
  return state.loading[key];
}
// 依目前頁面需要才計算(均線 → 多空 → 急跌事件 / K棒型態)，結果快取
function ensureComputed(key){
  const rows = state.data[key]; if (!rows) return;
  if (!state.ma[key]){
    state.ma[key] = computeAllMA(rows.map(d=>d.close));
    state.ma[key].vol5 = computeMA(rows.map(d=>d.volume||0), VOL_MA); // 成交量均線
  }
  const regimes = getRegimes(key);
  if (state.theme==='crash' && state.mode==='crash' && !state.events[key]) state.events[key] = computeEvents(rows, state.params[key], state.ma[key], regimes);
  if (state.theme==='crash' && state.mode==='myth' && !state.myth[key]){
    state.myth[key] = computeMyth(rows, state.ma[key], state.mythParams);
    state.myth[key].may20 = computeMay20(rows, key);
  }
  if (state.theme==='crash' && state.mode==='cycle' && !state.cycle[key]) state.cycle[key] = computeCycle(rows, key, state.cycleParams);
  if (state.theme==='candle' && !state.candlePatterns[key]) state.candlePatterns[key] = detectCandlePatterns(rows, state.ma[key], state.candleParams[key], regimes);
}

function setCandleParam(key, field, value){
  state.candleParams[key][field] = value;
  state.candlePatterns[key] = null;
  render();
}
function setParam(key, field, value){
  state.params[key][field] = value;
  state.events[key] = null;
  render();
}
function focusEvent(key, evIdx){
  const rows = state.data[key];
  const ev = state.events[key][evIdx];
  const pad = Math.max(20, Math.round((ev.daysToRecover||ev.daysToBottom||30)*1.5));
  const s = clamp(ev.peakIdx-pad,0,rows.length-1);
  const e = clamp((ev.recoverIdx>-1?ev.recoverIdx:ev.bottomIdx)+pad,0,rows.length-1);
  state.view[key] = {start:s,end:e};
  render();
}
function setZoomPreset(key, tradingDays){
  const rows = state.data[key];
  const end = rows.length-1;
  const start = tradingDays==='all'? 0 : clamp(end-tradingDays,0,end);
  state.view[key] = {start,end};
  render();
}

// 圖表配色：讀取目前主題的 CSS 變數(暗色/淺色)，紅漲綠跌
function hexA(hex, a){ const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
function chartColors(){
  const v = LT.cssVar;
  return { grid:v('--grid'), text:v('--mute'), up:v('--candle-up'), down:v('--candle-down'), blue:v('--blue'), amber:v('--amber'),
    ma:{5:v('--ma5'), 10:v('--ma10'), 20:v('--ma20'), 60:v('--ma60'), 120:v('--ma120'), 240:v('--ma240')}, cursor:v('--text') };
}
