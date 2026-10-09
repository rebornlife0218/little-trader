/* 指數 · 跌深反彈量能分析 / K棒型態分析
   資料：data/global_indices_ohlcv.csv(由 GitHub Actions 每個工作日更新) */
/* ============================== 常數與設定 ============================== */
// 指數代碼與中文名稱(下拉選單依此順序排列)
const INDICES = [
  {key:'TAIEX',   name:'台灣加權'},
  {key:'SP500',   name:'標普500'},
  {key:'NASDAQ',  name:'那斯達克'},
  {key:'NK225',   name:'日經225'},
  {key:'KOSPI50', name:'韓國綜合(KOSPI)'},
  {key:'HSI',     name:'恒生指數'},
  {key:'SSEC',    name:'上證指數'},
  {key:'STI',     name:'新加坡海峽時報'},
  {key:'STOXX50', name:'歐洲STOXX50'},
  {key:'FTSE100', name:'英國富時100'},
];
const TICKER_NAMES = {}; INDICES.forEach(c=>TICKER_NAMES[c.key]=c.name);

const DEFAULT_PARAMS = { dropPct:-10, windowDays:5, bottomSearchDays:10, followUpDays:60 };

let state = {
  dataStatus: 'loading', // 'loading' | 'ok' | 'error'
  dataMeta: null,  // data/meta.json
  active: null,
  theme: 'crash',  // 'crash' | 'candle'
  indexList: [],  // [{key,name}] 目前顯示的分頁，動態依資料而定
  data: {},       // key -> array of {t(ms), date(str), open,high,low,close,volume}
  meta: {},       // key -> {name, hasOHLC, hasVolume}
  events: {},     // key -> computed events
  ma: {},         // key -> {5:[],20:[],60:[],240:[]}
  candlePatterns: {}, // key -> {p1:[],p2:[],p3:[],p4:[],p5_red:[],p5_black:[],p5_up:[],p5_down:[]}
  candleParams: {},   // key -> {longBodyPct, longShadowPct, volumeSpikeFactor}
  params: {},     // key -> params per index
  view: {},       // key -> {start,end} index window for chart
};

/* ============================== 小工具 ============================== */
function fmtDate(ms){ const d=new Date(ms); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtPct(x,digits=1){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return (x*100>=0?'+':'')+(x*100).toFixed(digits)+'%'; }
function fmtNum(x,digits=2){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return Number(x).toLocaleString('en-US',{maximumFractionDigits:digits}); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

/* ============================== CSV 解析 ============================== */
const COL_ALIASES = {
  date:['date','日期'],
  open:['open','開盤','開盤價'],
  high:['high','最高','最高價'],
  low:['low','最低','最低價'],
  close:['close','price','收盤','收盤價','adj close','adjclose'],
  volume:['volume','vol.','vol','成交量','成交金額'],
};
function findCol(headers, key){
  const aliases = COL_ALIASES[key];
  const lower = headers.map(h=>h.trim().toLowerCase());
  for(const a of aliases){ const idx=lower.indexOf(a); if(idx>-1) return idx; }
  return -1;
}
function parseNumberLoose(s){
  if (s===undefined||s===null) return NaN;
  s = String(s).trim().replace(/["]/g,'');
  if (s==='' || s==='-' || s.toLowerCase()==='nan') return NaN;
  s = s.replace(/,/g,'');
  let mult=1;
  if (/[kK]$/.test(s)){ mult=1e3; s=s.slice(0,-1); }
  else if (/[mM]$/.test(s)){ mult=1e6; s=s.slice(0,-1); }
  else if (/[bB]$/.test(s)){ mult=1e9; s=s.slice(0,-1); }
  const v = parseFloat(s);
  return Number.isNaN(v) ? NaN : v*mult;
}
function parseDateLoose(s){
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[1]-1, +m[2]);
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (m){ const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    let y=+m[3]; if(y<100) y+=2000; return Date.UTC(y, months[m[2]], +m[1]); }
  const d = Date.parse(s);
  return Number.isNaN(d) ? null : d;
}
// 單一指數 OHLCV 格式(如 Yahoo Finance / investing.com 匯出)
function parseSingleCSV(lines, headers){
  const ci = {
    date: findCol(headers,'date'), open: findCol(headers,'open'), high: findCol(headers,'high'),
    low: findCol(headers,'low'), close: findCol(headers,'close'), volume: findCol(headers,'volume'),
  };
  if (ci.date===-1 || ci.close===-1) throw new Error('找不到「日期」或「收盤價」欄位，請確認CSV表頭');
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    const t = parseDateLoose(cols[ci.date]);
    const close = parseNumberLoose(cols[ci.close]);
    if (t===null || Number.isNaN(close) || close<=0) continue; // 無交易日(開高低收皆0)直接跳過
    const open = ci.open>-1 ? parseNumberLoose(cols[ci.open]) : close;
    const high = ci.high>-1 ? parseNumberLoose(cols[ci.high]) : Math.max(open,close);
    const low = ci.low>-1 ? parseNumberLoose(cols[ci.low]) : Math.min(open,close);
    const volume = ci.volume>-1 ? parseNumberLoose(cols[ci.volume]) : 0;
    if (ci.open>-1 && !(open>0)) continue;
    if (ci.high>-1 && !(high>0)) continue;
    if (ci.low>-1 && !(low>0)) continue;
    rows.push({ t, date: fmtDate(t), open: Number.isNaN(open)?close:open, high: Number.isNaN(high)?close:high,
                low: Number.isNaN(low)?close:low, close, volume: Number.isNaN(volume)?0:volume });
  }
  rows.sort((a,b)=>a.t-b.t);
  const dedup=[]; let lastT=null;
  for(const r of rows){ if(r.t!==lastT){ dedup.push(r); lastT=r.t; } else { dedup[dedup.length-1]=r; } }
  if (dedup.length<30) throw new Error('有效資料筆數過少，請確認CSV內容');
  return dedup;
}
// 寬表格式：一欄日期 + 多組「{代號}_Open/High/Low/Close/Volume」欄位(每個指數各一組OHLCV)
const FIELD_SUFFIX = {open:'open', high:'high', low:'low', close:'close', volume:'volume', 'adj close':'close', adjclose:'close'};
function parseWideOHLCV(lines, headers){
  let dateIdx = findCol(headers,'date');
  if (dateIdx===-1) dateIdx = 0;
  const suffixRe = /^(.+?)[ _\.\-]+(open|high|low|close|volume|adj\s*close|adjclose)$/i;
  const groups = {}; // prefix -> {openIdx,highIdx,lowIdx,closeIdx,volumeIdx}
  headers.forEach((h,i)=>{
    if (i===dateIdx) return;
    const name = h.trim();
    const m = name.match(suffixRe);
    if (!m) return;
    const prefix = m[1].trim();
    const field = FIELD_SUFFIX[m[2].toLowerCase().replace(/\s+/g,' ')];
    if (!field) return;
    if (!groups[prefix]) groups[prefix] = {};
    groups[prefix][field+'Idx'] = i;
  });
  const prefixes = Object.keys(groups).filter(p=>groups[p].closeIdx!==undefined);
  if (prefixes.length===0) return null;
  const seriesMap = {};
  prefixes.forEach(p=>seriesMap[p]=[]);
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(',');
    const t = parseDateLoose(parts[dateIdx]);
    if (t===null) continue;
    const dateStr = fmtDate(t);
    prefixes.forEach(p=>{
      const g = groups[p];
      const close = parseNumberLoose(parts[g.closeIdx]);
      if (Number.isNaN(close) || close<=0) return; // 該指數當日無交易(開高低收皆0/缺值)則整列跳過，不畫圖也不納入計算
      const open = g.openIdx!==undefined? parseNumberLoose(parts[g.openIdx]) : NaN;
      const high = g.highIdx!==undefined? parseNumberLoose(parts[g.highIdx]) : NaN;
      const low = g.lowIdx!==undefined? parseNumberLoose(parts[g.lowIdx]) : NaN;
      const volume = g.volumeIdx!==undefined? parseNumberLoose(parts[g.volumeIdx]) : NaN;
      // 若有提供開/高/低欄位，任一為0或無效同樣視為無交易日，整列跳過
      if (g.openIdx!==undefined && !(open>0)) return;
      if (g.highIdx!==undefined && !(high>0)) return;
      if (g.lowIdx!==undefined && !(low>0)) return;
      seriesMap[p].push({
        t, date:dateStr,
        open: Number.isNaN(open)?close:open,
        high: Number.isNaN(high)?Math.max(Number.isNaN(open)?close:open, close):high,
        low: Number.isNaN(low)?Math.min(Number.isNaN(open)?close:open, close):low,
        close,
        volume: (Number.isNaN(volume)||volume<0)?0:volume,
        _hasOpen: g.openIdx!==undefined, _hasHigh: g.highIdx!==undefined, _hasLow: g.lowIdx!==undefined, _hasVol: g.volumeIdx!==undefined,
      });
    });
  }
  Object.keys(seriesMap).forEach(k=>{
    seriesMap[k].sort((a,b)=>a.t-b.t);
    const dedup=[]; let lastT=null;
    for(const r of seriesMap[k]){ if(r.t!==lastT){ dedup.push(r); lastT=r.t; } else { dedup[dedup.length-1]=r; } }
    seriesMap[k]=dedup;
  });
  return { cols: prefixes, seriesMap, groups };
}
// 寬表格式：一欄日期 + 多欄各指數收盤價(無OHLC，僅收盤價)
function parseWideCSV(lines, headers){
  let dateIdx = findCol(headers,'date');
  if (dateIdx===-1) dateIdx = 0;
  const cols = [];
  headers.forEach((h,i)=>{
    const name = h.trim();
    if (i===dateIdx || name==='' || /^unnamed/i.test(name)) return;
    cols.push({name, idx:i});
  });
  if (cols.length===0) throw new Error('找不到可用的指數欄位');
  const seriesMap = {}; cols.forEach(c=>seriesMap[c.name]=[]);
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(',');
    const t = parseDateLoose(parts[dateIdx]);
    if (t===null) continue;
    const dateStr = fmtDate(t);
    cols.forEach(c=>{
      const v = parseNumberLoose(parts[c.idx]);
      if (!Number.isNaN(v) && v>0){
        seriesMap[c.name].push({t, date:dateStr, open:v, high:v, low:v, close:v, volume:0});
      }
    });
  }
  Object.keys(seriesMap).forEach(k=>{
    seriesMap[k].sort((a,b)=>a.t-b.t);
    const dedup=[]; let lastT=null;
    for(const r of seriesMap[k]){ if(r.t!==lastT){ dedup.push(r); lastT=r.t; } else { dedup[dedup.length-1]=r; } }
    seriesMap[k]=dedup;
  });
  return { cols: cols.map(c=>c.name), seriesMap };
}
// 自動判斷檔案格式：① 多指數「{代號}_Open/High/Low/Close/Volume」寬表(優先) ② 單一指數OHLCV ③ 多指數寬表(僅收盤價)
function detectAndParseCSV(text){
  const lines = text.split(/\r\n|\n|\r/).filter(l=>l.trim().length>0);
  if (lines.length<2) throw new Error('檔案內容過少');
  const headers = lines[0].split(',');
  const ohlcv = parseWideOHLCV(lines, headers);
  if (ohlcv){
    return { mode:'wide_ohlcv', cols: ohlcv.cols, seriesMap: ohlcv.seriesMap, groups: ohlcv.groups };
  }
  const hasOpen = findCol(headers,'open')>-1;
  const hasHigh = findCol(headers,'high')>-1;
  if (hasOpen || hasHigh){
    return { mode:'single', rows: parseSingleCSV(lines, headers) };
  }
  const { cols, seriesMap } = parseWideCSV(lines, headers);
  return { mode:'wide', cols, seriesMap };
}

/* ============================== 移動平均線 ============================== */
const MA_PERIODS = [5,20,60,240];
function computeMA(closes, period){
  const n = closes.length;
  const ma = new Array(n).fill(NaN);
  let sum=0;
  for (let i=0;i<n;i++){
    sum += closes[i];
    if (i>=period) sum -= closes[i-period];
    if (i>=period-1) ma[i] = sum/period;
  }
  return ma;
}
function computeAllMA(closes){
  const out = {};
  MA_PERIODS.forEach(p=>{ out[p]=computeMA(closes,p); });
  return out;
}

/* ============================== K棒型態分析 ============================== */
const DEFAULT_CANDLE_PARAMS = { longBodyPct:1.5, longShadowPct:50, volumeSpikeFactor:1.5 };
const VOL_SPIKE_LOOKBACK = 5; // 爆量比較基準：前N日均量(不含當天)
function computeVolAvgTrailing(vols, period){
  const n = vols.length;
  const arr = new Array(n).fill(NaN);
  let sum=0;
  for (let i=0;i<n;i++){
    if (i>=period) arr[i] = sum/period;
    sum += vols[i];
    if (i>=period) sum -= vols[i-period];
  }
  return arr;
}
// 型態發生當天的多空氛圍：收盤價相對60日線/240日線的位置(與反彈結構統計的最終方向判定同一套邏輯)
function regimeAt(i, ma, closes){
  const ma60v = ma[60][i], ma240v = ma[240][i];
  if (Number.isNaN(ma60v) || Number.isNaN(ma240v)) return 'N/A';
  const c = closes[i];
  if (c > ma240v*1.01 && c > ma60v) return '多頭';
  if (c < ma240v*0.99 && c < ma60v) return '空頭';
  return '盤整';
}
/* K棒型態定義：新增型態只要在這裡加一筆
   group: single 單根 / double 兩根 / triple 三根 / volume 爆量
   bias : 偏多(預期上漲) / 偏空(預期下跌) / 中性(多空猶豫)
   shape: 示意圖用K棒 {o,h,l,c}(0~100，越大越高)，ctx:true 為前段走勢的淡色K棒；vol 為成交量示意
   meaning: 給新手的白話說明；rule: 本站的判定條件 */
const CANDLE_GROUPS = [
  {key:'single', name:'單根K棒'},
  {key:'double', name:'兩根K棒組合'},
  {key:'triple', name:'三根K棒組合'},
  {key:'volume', name:'爆量K棒'},
];
const DOWN2 = [{o:86,h:88,l:72,c:74,ctx:true},{o:74,h:76,l:60,c:62,ctx:true}];
const UP2 = [{o:14,h:28,l:12,c:26,ctx:true},{o:26,h:40,l:24,c:38,ctx:true}];
const CANDLE_PATTERNS = [
  // ---------- 單根 ----------
  {key:'hammer', group:'single', name:'錘子線', bias:'偏多',
    shape:[...DOWN2,{o:44,h:49,l:10,c:49}],
    meaning:'跌了一段後出現。盤中一度大跌，收盤前卻被買回來，留下一根長長的下影線，像一把槌子。代表低檔有人進場承接，跌勢可能止住。',
    rule:'前5日下跌且收盤在20日線下；下影線 ≥ 實體2倍，上影線很短。'},
  {key:'hanging', group:'single', name:'吊人線', bias:'偏空',
    shape:[...UP2,{o:60,h:61,l:22,c:55}],
    meaning:'漲了一段後出現，長得跟錘子線一樣。高檔時盤中曾被大量賣出，雖然收盤拉回，但代表賣壓開始出現，要小心漲勢轉弱。',
    rule:'前5日上漲且收盤在20日線上；下影線 ≥ 實體2倍，上影線很短。'},
  {key:'invHammer', group:'single', name:'倒狀錘子', bias:'偏多',
    shape:[...DOWN2,{o:46,h:84,l:44,c:51}],
    meaning:'跌了一段後出現，上影線很長。買方曾試著往上攻，雖然被壓回，但代表開始有人敢買，是可能止跌的早期訊號，需隔天確認。',
    rule:'前5日下跌且收盤在20日線下；上影線 ≥ 實體2倍，下影線很短。'},
  {key:'shootingStar', group:'single', name:'流星線', bias:'偏空',
    shape:[...UP2,{o:54,h:90,l:52,c:49}],
    meaning:'漲多後衝高又被打下來，留下長上影線，像劃過天空的流星。代表上方賣壓很重，追高的人被套，漲勢可能到頂。',
    rule:'前5日上漲且收盤在20日線上；上影線 ≥ 實體2倍，下影線很短。'},
  {key:'doji', group:'single', name:'十字線', bias:'中性',
    shape:[{o:30,h:46,l:26,c:44,ctx:true},{o:50,h:76,l:24,c:50}],
    meaning:'開盤價和收盤價幾乎一樣，多空打成平手，市場在猶豫。單獨出現意義不大，但在大漲或大跌之後出現，常是行情要轉折的警訊。',
    rule:'實體 ≤ 當天振幅的10%。'},
  // ---------- 兩根 ----------
  {key:'p1', group:'double', name:'多頭吞噬(長紅吞長黑)', bias:'偏多',
    shape:[{o:72,h:74,l:38,c:40},{o:36,h:80,l:34,c:78}],
    meaning:'昨天一根長黑K，今天一根更長的紅K把它整根「吃掉」。代表買方一口氣扭轉局面，是常見的看漲反轉訊號。',
    rule:'昨日長黑、今日長紅，且今日實體完全包住昨日實體。'},
  {key:'p2', group:'double', name:'空頭吞噬(長黑吞長紅)', bias:'偏空',
    shape:[{o:30,h:64,l:28,c:62},{o:66,h:68,l:22,c:24}],
    meaning:'昨天一根長紅K，今天一根更長的黑K把它整根吃掉。代表賣方強勢反攻，是常見的看跌反轉訊號。',
    rule:'昨日長紅、今日長黑，且今日實體完全包住昨日實體。'},
  {key:'p3', group:'double', name:'長紅吞噬長上影黑K', bias:'偏多',
    shape:[{o:55,h:86,l:46,c:48},{o:44,h:66,l:42,c:64}],
    meaning:'昨天衝高被壓回(長上影黑K)，看似賣壓很重；今天卻用一根長紅K把昨天吃掉，代表賣壓已被消化，買方更有力。',
    rule:'昨日黑K且上影線占振幅達門檻；今日長紅吞噬昨日實體。'},
  {key:'p4', group:'double', name:'長黑吞噬長下影紅K', bias:'偏空',
    shape:[{o:48,h:57,l:16,c:55},{o:58,h:60,l:36,c:38}],
    meaning:'昨天雖然低檔有撐(長下影紅K)，今天卻一根長黑K把它吃掉，代表支撐失效，賣方占上風。',
    rule:'昨日紅K且下影線占振幅達門檻；今日長黑吞噬昨日實體。'},
  {key:'piercing', group:'double', name:'貫穿線', bias:'偏多',
    shape:[{o:84,h:86,l:70,c:72,ctx:true},{o:72,h:74,l:42,c:44},{o:36,h:64,l:34,c:62}],
    meaning:'下跌中先出現長黑K，隔天開低後一路往上拉，收盤收復昨天黑K的一半以上，像一把刀刺穿下跌趨勢。代表買方開始反擊。',
    rule:'前段下跌；昨日長黑；今日紅K開盤低於昨收，收盤超過昨日實體中點但未超過昨開。'},
  {key:'darkCloud', group:'double', name:'烏雲罩頂', bias:'偏空',
    shape:[{o:16,h:30,l:14,c:28,ctx:true},{o:28,h:58,l:26,c:56},{o:64,h:66,l:36,c:38}],
    meaning:'上漲中先出現長紅K，隔天開高後一路下殺，收盤跌掉昨天紅K的一半以上，像烏雲蓋住晴天。代表賣方開始反擊。',
    rule:'前段上漲；昨日長紅；今日黑K開盤高於昨收，收盤跌破昨日實體中點但未跌破昨開。'},
  {key:'bullHarami', group:'double', name:'多頭母子', bias:'偏多',
    shape:[{o:90,h:92,l:78,c:80,ctx:true},{o:80,h:82,l:28,c:30},{o:46,h:58,l:44,c:56}],
    meaning:'下跌中一根大黑K(媽媽)之後，出現一根被包在裡面的小K棒(孩子)。代表賣壓突然縮小，跌勢可能暫停，但力道不如吞噬型態。',
    rule:'前段下跌；昨日長黑；今日小實體完全落在昨日實體範圍內。'},
  {key:'bearHarami', group:'double', name:'空頭母子', bias:'偏空',
    shape:[{o:10,h:22,l:8,c:20,ctx:true},{o:20,h:72,l:18,c:70},{o:54,h:56,l:42,c:44}],
    meaning:'上漲中一根大紅K之後，出現一根被包在裡面的小K棒。代表買氣突然降溫，漲勢可能暫停。',
    rule:'前段上漲；昨日長紅；今日小實體完全落在昨日實體範圍內。'},
  // ---------- 三根 ----------
  {key:'morningStar', group:'triple', name:'晨星', bias:'偏多',
    shape:[{o:84,h:86,l:46,c:48},{o:38,h:42,l:30,c:35},{o:40,h:76,l:38,c:74}],
    meaning:'長黑K → 小K棒(猶豫) → 長紅K。像黑夜後升起的晨星，代表空方力竭、多方接手，是經典的底部反轉型態。',
    rule:'前段下跌；第1根長黑；第2根小實體且位於第1根實體下半部以下；第3根紅K收盤超過第1根實體中點。'},
  {key:'eveningStar', group:'triple', name:'夜星', bias:'偏空',
    shape:[{o:16,h:56,l:14,c:54},{o:62,h:70,l:60,c:65},{o:60,h:62,l:24,c:26}],
    meaning:'長紅K → 小K棒(猶豫) → 長黑K。像天黑前出現的夜星，代表多方力竭、空方接手，是經典的頭部反轉型態。',
    rule:'前段上漲；第1根長紅；第2根小實體且位於第1根實體上半部以上；第3根黑K收盤跌破第1根實體中點。'},
  {key:'threeSoldiers', group:'triple', name:'紅三兵', bias:'偏多',
    shape:[{o:14,h:36,l:12,c:34},{o:30,h:56,l:28,c:54},{o:50,h:78,l:48,c:76}],
    meaning:'連續三根紅K，一天比一天收得高，像三個士兵穩步前進。代表買方持續進場，常出現在上漲初期。',
    rule:'連3根紅K，收盤一根比一根高，每根開盤在前一根實體內，實體達長紅門檻一半以上，上影線短。'},
  {key:'threeCrows', group:'triple', name:'黑三鴉', bias:'偏空',
    shape:[{o:86,h:88,l:64,c:66},{o:70,h:72,l:44,c:46},{o:50,h:52,l:22,c:24}],
    meaning:'連續三根黑K，一天比一天收得低，像三隻烏鴉停在樹上。代表賣方持續出貨，常出現在下跌初期。',
    rule:'連3根黑K，收盤一根比一根低，每根開盤在前一根實體內，實體達長黑門檻一半以上，下影線短。'},
  // ---------- 爆量 ----------
  {key:'p5_red', group:'volume', name:'長紅爆量', bias:'偏多',
    shape:[{o:40,h:46,l:36,c:44,ctx:true},{o:44,h:48,l:40,c:42,ctx:true},{o:42,h:82,l:40,c:80}], vol:[30,26,95],
    meaning:'大漲的紅K配上暴增的成交量，代表大量資金積極買進，上漲比較有說服力。但若在漲多的高檔出現，也可能是主力趁機出貨。',
    rule:'長紅K，且成交量 ≥ 前5日均量 × 爆量倍數。'},
  {key:'p5_black', group:'volume', name:'長黑爆量', bias:'偏空',
    shape:[{o:56,h:60,l:52,c:58,ctx:true},{o:58,h:62,l:54,c:56,ctx:true},{o:58,h:60,l:18,c:20}], vol:[30,26,95],
    meaning:'大跌的黑K配上暴增的成交量，代表很多人搶著賣出、恐慌性賣壓湧現。有時是趨勢轉空，有時則是恐慌殺到底的訊號。',
    rule:'長黑K，且成交量 ≥ 前5日均量 × 爆量倍數。'},
  {key:'p5_up', group:'volume', name:'長上影黑K爆量', bias:'偏空',
    shape:[{o:30,h:40,l:28,c:38,ctx:true},{o:38,h:48,l:36,c:46,ctx:true},{o:50,h:90,l:44,c:46}], vol:[30,26,95],
    meaning:'大量成交但衝高被打回，收成黑K。代表上方有大量賣單等著，買方追價失敗，是高檔常見的出貨訊號。',
    rule:'黑K且上影線占振幅達門檻，且爆量。'},
  {key:'p5_down', group:'volume', name:'長下影紅K爆量', bias:'偏多',
    shape:[{o:70,h:72,l:60,c:62,ctx:true},{o:62,h:64,l:52,c:54,ctx:true},{o:50,h:56,l:12,c:54}], vol:[30,26,95],
    meaning:'大量成交且盤中殺低後被強力買回，收成紅K。代表低檔有大量買盤承接，常是止跌的訊號。',
    rule:'紅K且下影線占振幅達門檻，且爆量。'},
];

function detectCandlePatterns(data, ma, params){
  const n = data.length;
  const closes = data.map(d=>d.close);
  const vols = data.map(d=>d.volume||0);
  const longBodyPct = (params.longBodyPct||DEFAULT_CANDLE_PARAMS.longBodyPct)/100;
  const longShadowPct = (params.longShadowPct||DEFAULT_CANDLE_PARAMS.longShadowPct)/100;
  const volSpikeFactor = params.volumeSpikeFactor||DEFAULT_CANDLE_PARAMS.volumeSpikeFactor;
  const volAvg = computeVolAvgTrailing(vols, VOL_SPIKE_LOOKBACK);
  const ma20 = ma[20];
  // 基本量測
  const body = d=>Math.abs(d.close-d.open);
  const range = d=>d.high-d.low;
  const upper = d=>d.high-Math.max(d.open,d.close);
  const lower = d=>Math.min(d.open,d.close)-d.low;
  const red = d=>d.close>d.open, black = d=>d.close<d.open;
  const bodyPct = d=>d.open>0? body(d)/d.open : 0;
  const isLong = d=>bodyPct(d)>=longBodyPct;
  const isSmall = d=>bodyPct(d)<=longBodyPct*0.4;
  const mid = d=>(d.open+d.close)/2;
  const bodyTop = d=>Math.max(d.open,d.close), bodyBot = d=>Math.min(d.open,d.close);
  const isLongUpperShadow = d=>{ const r=range(d); return r>0 && upper(d)/r>=longShadowPct; };
  const isLongLowerShadow = d=>{ const r=range(d); return r>0 && lower(d)/r>=longShadowPct; };
  const isVolSpike = i=>{ const a=volAvg[i]; return a>0 && vols[i]>=a*volSpikeFactor; };
  // 前段趨勢：第 j 天收盤較5日前低(高)，且位於20日線之下(上)
  const downBefore = j=> j>=5 && closes[j]<closes[j-5] && !Number.isNaN(ma20[j]) && closes[j]<ma20[j];
  const upBefore   = j=> j>=5 && closes[j]>closes[j-5] && !Number.isNaN(ma20[j]) && closes[j]>ma20[j];
  // 錘子類：一側影線 ≥ 實體2倍、另一側影線 ≤ 實體(或振幅10%)
  const hammerShape = d=>{ const r=range(d), b=body(d); return r>0 && b>0 && lower(d)>=2*b && upper(d)<=Math.max(b, r*0.1) && b/r<=0.35; };
  const invHammerShape = d=>{ const r=range(d), b=body(d); return r>0 && b>0 && upper(d)>=2*b && lower(d)<=Math.max(b, r*0.1) && b/r<=0.35; };

  const lists = {}; CANDLE_PATTERNS.forEach(p=>lists[p.key]=[]);
  const add = (k,i)=>lists[k].push(i);
  for (let i=1;i<n;i++){
    const t=data[i], y=data[i-1];
    // 單根
    if (hammerShape(t)){ if (downBefore(i-1)) add('hammer',i); else if (upBefore(i-1)) add('hanging',i); }
    if (invHammerShape(t)){ if (downBefore(i-1)) add('invHammer',i); else if (upBefore(i-1)) add('shootingStar',i); }
    if (range(t)>0 && body(t)/range(t)<=0.1) add('doji',i);
    // 兩根
    const bullEngulf = t.open<=y.close && t.close>=y.open;
    const bearEngulf = t.open>=y.close && t.close<=y.open;
    if (black(y)&&isLong(y)&&red(t)&&isLong(t)&&bullEngulf) add('p1',i);
    if (red(y)&&isLong(y)&&black(t)&&isLong(t)&&bearEngulf) add('p2',i);
    if (black(y)&&isLongUpperShadow(y)&&red(t)&&isLong(t)&&bullEngulf) add('p3',i);
    if (red(y)&&isLongLowerShadow(y)&&black(t)&&isLong(t)&&bearEngulf) add('p4',i);
    if (downBefore(i-1)&&black(y)&&isLong(y)&&red(t)&&t.open<y.close&&t.close>mid(y)&&t.close<y.open) add('piercing',i);
    if (upBefore(i-1)&&red(y)&&isLong(y)&&black(t)&&t.open>y.close&&t.close<mid(y)&&t.close>y.open) add('darkCloud',i);
    if (downBefore(i-1)&&black(y)&&isLong(y)&&isSmall(t)&&bodyTop(t)<y.open&&bodyBot(t)>y.close) add('bullHarami',i);
    if (upBefore(i-1)&&red(y)&&isLong(y)&&isSmall(t)&&bodyTop(t)<y.close&&bodyBot(t)>y.open) add('bearHarami',i);
    // 三根
    if (i>=2){
      const a=data[i-2], b=y, c=t;
      if (downBefore(i-2)&&black(a)&&isLong(a)&&isSmall(b)&&bodyTop(b)<mid(a)&&red(c)&&c.close>mid(a)) add('morningStar',i);
      if (upBefore(i-2)&&red(a)&&isLong(a)&&isSmall(b)&&bodyBot(b)>mid(a)&&black(c)&&c.close<mid(a)) add('eveningStar',i);
      const half = d=>bodyPct(d)>=longBodyPct*0.5;
      if ([a,b,c].every(d=>red(d)&&half(d)&&upper(d)<=body(d)*0.5) && b.close>a.close && c.close>b.close
          && b.open>=a.open && b.open<=a.close && c.open>=b.open && c.open<=b.close) add('threeSoldiers',i);
      if ([a,b,c].every(d=>black(d)&&half(d)&&lower(d)<=body(d)*0.5) && b.close<a.close && c.close<b.close
          && b.open<=a.open && b.open>=a.close && c.open<=b.open && c.open>=b.close) add('threeCrows',i);
    }
    // 爆量
    if (isVolSpike(i)){
      if (red(t)&&isLong(t)) add('p5_red',i);
      if (black(t)&&isLong(t)) add('p5_black',i);
      if (black(t)&&isLongUpperShadow(t)) add('p5_up',i);
      if (red(t)&&isLongLowerShadow(t)) add('p5_down',i);
    }
  }
  function enrich(idxList){
    return idxList.map(i=>{
      const ret5 = (i+5<n)? closes[i+5]/closes[i]-1: NaN;
      const ret10 = (i+10<n)? closes[i+10]/closes[i]-1: NaN;
      const b20_5 = (i+5<n && !Number.isNaN(ma[20][i+5]))? (closes[i+5]-ma[20][i+5])/ma[20][i+5] : NaN;
      const b20_10 = (i+10<n && !Number.isNaN(ma[20][i+10]))? (closes[i+10]-ma[20][i+10])/ma[20][i+10] : NaN;
      const b60_5 = (i+5<n && !Number.isNaN(ma[60][i+5]))? (closes[i+5]-ma[60][i+5])/ma[60][i+5] : NaN;
      const b60_10 = (i+10<n && !Number.isNaN(ma[60][i+10]))? (closes[i+10]-ma[60][i+10])/ma[60][i+10] : NaN;
      return { idx:i, date:data[i].date, ret5, ret10, b20_5, b20_10, b60_5, b60_10, regime: regimeAt(i, ma, closes) };
    });
  }
  const out = {}; Object.keys(lists).forEach(k=>out[k]=enrich(lists[k]));
  return out;
}
function summarizePatternGroup(occurrences){
  const avgField = (field)=>{
    const withVal = occurrences.filter(e=>!Number.isNaN(e[field]));
    return withVal.length? withVal.reduce((a,e)=>a+e[field],0)/withVal.length : NaN;
  };
  const winField = (field)=>{
    const withVal = occurrences.filter(e=>!Number.isNaN(e[field]));
    return withVal.length? withVal.filter(e=>e[field]>0).length/withVal.length : NaN;
  };
  return {
    count: occurrences.length,
    win5: winField('ret5'), win10: winField('ret10'),
    avg5: avgField('ret5'), avg10: avgField('ret10'),
    avgB20_5: avgField('b20_5'), avgB20_10: avgField('b20_10'),
    avgB60_5: avgField('b60_5'), avgB60_10: avgField('b60_10'),
  };
}

// 反彈期間逐一檢查是否站上/遇壓每一條均線(收盤價需連續holdDays天不跌破才算站穩)
function analyzeReboundStructure(closes, ma, bottomIdx, fEnd, holdDays){
  const levels = MA_PERIODS.map(period=>{
    const arr = ma[period];
    let crossIdx=-1, held=null, rejectIdx=null;
    for (let k=bottomIdx+1;k<=fEnd;k++){
      if (!Number.isNaN(arr[k]) && closes[k]>=arr[k]){ crossIdx=k; break; }
    }
    if (crossIdx>-1){
      let ok=true;
      const holdEnd = Math.min(crossIdx+holdDays, fEnd);
      for (let k=crossIdx+1;k<=holdEnd;k++){
        if (!Number.isNaN(arr[k]) && closes[k]<arr[k]){ ok=false; rejectIdx=k; break; }
      }
      held = ok;
    }
    return {period, crossIdx, held, rejectIdx};
  });
  let finalDir = 'N/A';
  const ma60v = ma[60][fEnd], ma240v = ma[240][fEnd], closeV = closes[fEnd];
  if (!Number.isNaN(ma60v) && !Number.isNaN(ma240v)){
    if (closeV > ma240v*1.01 && closeV > ma60v) finalDir='多方';
    else if (closeV < ma240v*0.99 && closeV < ma60v) finalDir='空方';
    else finalDir='盤整';
  }
  return { levels, finalDir };
}
// 反彈無力點：從底部起，追蹤收盤價創的區間新高，第一次從某個高點回落達PULLBACK_PCT(預設3%)時，
// 視為該波反彈第一次出現「無力」訊號，回傳當時高點那一天的乖離率(20MA/60MA)
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
function computeEvents(data, p, ma){
  const HOLD_DAYS = 5;
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
      const structure = ma ? analyzeReboundStructure(closes, ma, bottomIdx, fEnd, HOLD_DAYS) : null;
      const stall = ma ? findStallPoint(closes, ma, bottomIdx, fEnd) : null;
      events.push({ peakIdx, peakVal, bottomIdx, bottomVal,
        dropActual:(bottomVal-peakVal)/peakVal, daysToBottom: bottomIdx-peakIdx,
        recoverIdx, daysToRecover: recoverIdx>-1? recoverIdx-bottomIdx: null,
        newHighIdx, daysToNewHigh: newHighIdx>-1? newHighIdx-bottomIdx: null,
        downVol, upVol, ratio, ret5, ret10, ret20, ret60, reDecline,
        bias20, bias60, structure, stall });
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
  const dirCounts = {'多方':0,'空方':0,'盤整':0,'N/A':0};
  events.forEach(e=>{ const d=(e.structure&&e.structure.finalDir)||'N/A'; dirCounts[d]=(dirCounts[d]||0)+1; });
  const withStall = events.filter(e=>e.stall && !Number.isNaN(e.stall.stallBias20));
  const withStall60 = events.filter(e=>e.stall && !Number.isNaN(e.stall.stallBias60));
  const avgStallBias20 = withStall.length? withStall.reduce((a,e)=>a+e.stall.stallBias20,0)/withStall.length : NaN;
  const avgStallBias60 = withStall60.length? withStall60.reduce((a,e)=>a+e.stall.stallBias60,0)/withStall60.length : NaN;
  const noStallCount = events.filter(e=>e.stall===null).length;
  return {count:events.length,
    win5:s5.win, avg5:s5.avg, win10:s10.win, avg10:s10.avg,
    win20:s20.win, avg20:s20.avg, win60:s60.win, avg60:s60.avg,
    newHighProb, reDeclineProb, avgBias20, avgBias60, dirCounts,
    avgStallBias20, avgStallBias60, stallSampleCount:withStall.length, noStallCount};
}
function bucketByRatio(events){
  const withRatio = events.filter(e=>!Number.isNaN(e.ratio));
  if (withRatio.length<2) return null;
  const THRESHOLD = 1; // 下跌量/反彈量 = 1為分界：>=1代表反彈量縮，<1代表反彈量增(反彈量比下跌量還大)
  const low = withRatio.filter(e=>e.ratio<THRESHOLD);
  const high = withRatio.filter(e=>e.ratio>=THRESHOLD);
  return { threshold:THRESHOLD, lowSummary:computeSummary(low), highSummary:computeSummary(high) };
}

/* ============================== 儲存 ============================== */
// 過濾無交易日(開高低收皆0或無效值)的資料列，避免污染圖表與統計
function sanitizeRows(rows, hasOHLC){
  return rows.filter(r=>{
    if (!(r.close>0)) return false;
    if (hasOHLC){
      if (!(r.open>0) || !(r.high>0) || !(r.low>0)) return false;
    }
    if (r.volume<0) r.volume = 0;
    return true;
  });
}
/* ============================== 初始化 ============================== */
async function init(){
  render();
  await loadSiteData();
  render();
}

/* ============================== 事件處理 ============================== */
/* 匯入寬表(多指數)解析結果 */
async function ingestWide(result){
        const isOHLCV = result.mode==='wide_ohlcv';
        const newIndexList=[];
        for (const colName of result.cols){
          let rows = result.seriesMap[colName];
          if (rows.length<30) continue;
          const hasVolume = rows.some(r=>r.volume>0);
          const hasOHLC = isOHLCV && rows.some(r=>r._hasOpen||r._hasHigh||r._hasLow);
          // 清掉內部標記欄位
          rows.forEach(r=>{ delete r._hasOpen; delete r._hasHigh; delete r._hasLow; delete r._hasVol; });
          rows = sanitizeRows(rows, hasOHLC);
          if (rows.length<30) continue;
          const displayName = TICKER_NAMES[colName] || colName;
          const meta = {name:displayName, hasOHLC, hasVolume};
          state.data[colName]=rows; state.meta[colName]=meta;
          state.params[colName] = state.params[colName] || {...DEFAULT_PARAMS};
          state.candleParams[colName] = state.candleParams[colName] || {...DEFAULT_CANDLE_PARAMS};
          recompute(colName);
          newIndexList.push({key:colName, name:displayName});
        }
        if (newIndexList.length===0) throw new Error('檔案中沒有找到足夠長度(≥30筆)的指數欄位');
        const order = k=>{ const i=INDICES.findIndex(c=>c.key===k); return i<0?999:i; };
        newIndexList.sort((a,b)=>order(a.key)-order(b.key));
        state.indexList = newIndexList;
        if (!newIndexList.find(x=>x.key===state.active)) state.active = (newIndexList.find(x=>x.key==='TAIEX')||newIndexList[0]).key;
}
/* 自動載入網站上的最新資料(由 GitHub Actions 每個工作日排程更新) */
const DATA_URL = 'data/global_indices_ohlcv.csv';
const META_URL = 'data/meta.json';
async function loadSiteData(){
  try{
    const bust = '?v='+Math.floor(Date.now()/600000); // 每10分鐘換一次，避免瀏覽器快取舊資料
    const [csvRes, metaRes] = await Promise.all([fetch(DATA_URL+bust), fetch(META_URL+bust).catch(()=>null)]);
    if (!csvRes.ok) throw new Error('HTTP '+csvRes.status);
    const result = detectAndParseCSV(await csvRes.text());
    if (result.mode!=='wide_ohlcv' && result.mode!=='wide') throw new Error('資料格式不符');
    await ingestWide(result);
    if (metaRes && metaRes.ok){ try{ state.dataMeta = await metaRes.json(); }catch(e){} }
    state.dataStatus = 'ok';
    return true;
  }catch(err){
    console.warn('自動載入資料失敗', err);
    state.dataStatus = 'error';
    state.dataError = String(err && err.message || err);
    return false;
  }
}

function recompute(key){
  const rows = state.data[key];
  if (!rows) return;
  const ma = computeAllMA(rows.map(d=>d.close));
  state.ma[key] = ma;
  const events = computeEvents(rows, state.params[key], ma);
  state.events[key] = events;
  state.view[key] = {start:0, end: rows.length-1};
  const meta = state.meta[key];
  state.candlePatterns[key] = (meta && meta.hasOHLC) ? detectCandlePatterns(rows, ma, state.candleParams[key]||DEFAULT_CANDLE_PARAMS) : null;
}
function recomputeCandlePatterns(key){
  const rows = state.data[key], meta = state.meta[key];
  if (!rows || !meta || !meta.hasOHLC){ state.candlePatterns[key] = null; return; }
  state.candlePatterns[key] = detectCandlePatterns(rows, state.ma[key], state.candleParams[key]||DEFAULT_CANDLE_PARAMS);
}
function setCandleParam(key, field, value){
  state.candleParams[key][field] = value;
  recomputeCandlePatterns(key);
  render();
}
function setParam(key, field, value){
  state.params[key][field] = value;
  recompute(key);
  render();
}
function focusEvent(key, ev){
  const rows = state.data[key];
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

const MA_COLORS = {5:'#F0B94D', 20:'#5B8DEF', 60:'#C08CF0', 240:'#C9CED8'};
/* ============================== Canvas 圖表 ============================== */
function drawChart(key){
  const rows = state.data[key]; if(!rows) return;
  const meta = state.meta[key] || {hasOHLC:true, hasVolume:true};
  const events = state.events[key]||[];
  const view = state.view[key] || {start:0,end:rows.length-1};
  const priceCanvas = document.getElementById('priceCanvas');
  if (!priceCanvas) return;
  const volCanvas = meta.hasVolume ? document.getElementById('volCanvas') : null;
  const dpr = window.devicePixelRatio||1;
  const wrapW = priceCanvas.parentElement.clientWidth;
  const priceH = 340, volH = 100;
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

  pctx.strokeStyle='#1a1f2a'; pctx.fillStyle='#5B6472'; pctx.font='10px IBM Plex Mono'; pctx.lineWidth=1;
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
    pctx.fillStyle = 'rgba(229,72,77,0.10)'; pctx.fillRect(Math.min(x1,x2), 10, Math.abs(x2-x1)||1, priceH-30);
    pctx.fillStyle = 'rgba(42,200,160,0.08)'; pctx.fillRect(Math.min(x2,x3), 10, Math.abs(x3-x2)||1, priceH-30);
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
    markAt(ev.peakIdx, '#E5484D','down');
    markAt(ev.bottomIdx, '#5B8DEF','up');
    if (ev.recoverIdx>-1) markAt(ev.recoverIdx,'#2AC8A0','diamond');
    if (ev.newHighIdx>-1) markAt(ev.newHighIdx,'#F0B94D','star');
  });

  if (meta.hasOHLC){
    slice.forEach((d,i)=>{
      const x = xAt(i); const up = d.close>=d.open;
      pctx.strokeStyle= up? '#E5484D':'#2ECC71'; pctx.fillStyle= up? '#E5484D':'#2ECC71'; pctx.lineWidth=1;
      pctx.beginPath(); pctx.moveTo(x,yAt(d.high)); pctx.lineTo(x,yAt(d.low)); pctx.stroke();
      const yo=yAt(d.open), yc=yAt(d.close);
      const bw = Math.max(cw*0.62,1);
      pctx.fillRect(x-bw/2, Math.min(yo,yc), bw, Math.max(Math.abs(yc-yo),1));
    });
  } else {
    pctx.beginPath();
    slice.forEach((d,i)=>{ const x=xAt(i), y=yAt(d.close); if(i===0) pctx.moveTo(x,y); else pctx.lineTo(x,y); });
    pctx.strokeStyle='#5B8DEF'; pctx.lineWidth=1.6; pctx.stroke();
    pctx.lineTo(xAt(n-1), priceH-20); pctx.lineTo(xAt(0), priceH-20); pctx.closePath();
    const grad = pctx.createLinearGradient(0,10,0,priceH-20);
    grad.addColorStop(0,'rgba(91,141,239,0.28)'); grad.addColorStop(1,'rgba(91,141,239,0.02)');
    pctx.fillStyle=grad; pctx.fill();
  }

  pctx.fillStyle='#5B6472'; pctx.font='10px IBM Plex Mono';
  const labelEvery = Math.max(1, Math.floor(n/6));
  for (let i=0;i<n;i+=labelEvery){ pctx.fillText(slice[i].date, xAt(i)-24, priceH-4); }

  // 移動平均線疊圖 (MA5/MA20/MA60/MA240)
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
      pctx.strokeStyle = MA_COLORS[p];
      pctx.lineWidth = p===240? 1.8 : (p===60? 1.4 : 1.1);
      pctx.globalAlpha = 0.9;
      pctx.stroke();
      pctx.globalAlpha = 1;
    });
  }

  if (vctx){
    let vmax=0; slice.forEach(d=>vmax=Math.max(vmax,d.volume||0));
    vctx.strokeStyle='#1a1f2a'; vctx.beginPath(); vctx.moveTo(padL,volH-14); vctx.lineTo(wrapW-padR,volH-14); vctx.stroke();
    slice.forEach((d,i)=>{
      const x=xAt(i); const h=(vmax>0)? (d.volume/vmax)*(volH-24):0;
      vctx.fillStyle = d.close>=d.open? 'rgba(229,72,77,0.55)':'rgba(46,204,113,0.55)';
      const bw=Math.max(cw*0.62,1);
      vctx.fillRect(x-bw/2, volH-14-h, bw, h);
    });
  }

  if (!priceCanvas._wired){
    priceCanvas._wired = true;
    let dragging=false, dragStartX=0, dragStartView=null;
    priceCanvas.addEventListener('wheel',(ev)=>{
      ev.preventDefault();
      const v = state.view[state.active]; if(!v) return;
      const curRows = state.data[state.active]; const range = v.end-v.start;
      const factor = ev.deltaY>0? 1.15 : 0.87;
      const newRange = clamp(Math.round(range*factor), 20, curRows.length-1);
      const rect = priceCanvas.getBoundingClientRect();
      const relX = clamp((ev.clientX-rect.left-padL)/plotW,0,1);
      const centerIdx = v.start + relX*range;
      let ns = Math.round(centerIdx - relX*newRange);
      let ne = ns+newRange;
      ns=clamp(ns,0,curRows.length-1); ne=clamp(ne,ns+10,curRows.length-1);
      state.view[state.active]={start:ns,end:ne};
      drawChart(state.active);
    }, {passive:false});
    priceCanvas.addEventListener('mousedown',(ev)=>{ dragging=true; dragStartX=ev.clientX; dragStartView={...state.view[state.active]}; });
    window.addEventListener('mouseup',()=>dragging=false);
    window.addEventListener('mousemove',(ev)=>{
      if(!dragging) return;
      const v = dragStartView; if(!v) return;
      const curRows = state.data[state.active]; const range=v.end-v.start;
      const dx = ev.clientX-dragStartX;
      const shift = Math.round(-dx/cw);
      let ns=clamp(v.start+shift,0,curRows.length-1-range); let ne=ns+range;
      state.view[state.active]={start:ns,end:ne};
      drawChart(state.active);
    });
  }
}

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
// 訊號應驗率：偏多型態看之後上漲比例，偏空型態看之後下跌比例
function hitRate(bias, win){
  if (Number.isNaN(win) || bias==='中性') return NaN;
  return bias==='偏多'? win : 1-win;
}
function hitCell(v){
  if (Number.isNaN(v)) return '<span class="tag na">—</span>';
  return `<b class="${v>=0.5?'up':'down'}">${(v*100).toFixed(0)}%</b>`;
}
function toggleCandleGuide(){ state.candleGuideOpen = state.candleGuideOpen===false; render(); }
function openPattern(k){
  const el = document.getElementById('pat-'+k);
  if (el){ el.open = true; el.scrollIntoView({behavior:'smooth', block:'start'}); }
}

function renderCandleTheme(){
  const key = state.active;
  const meta = state.meta[key] || {};
  if (!meta.hasOHLC){
    return `<div class="panel"><div class="note">此指數資料沒有開高低價(僅收盤價)，無法進行K棒型態分析。</div></div>`;
  }
  const patterns = state.candlePatterns[key];
  if (!patterns) return `<div class="panel"><div class="note">尚未計算型態資料。</div></div>`;
  const cp = state.candleParams[key] || DEFAULT_CANDLE_PARAMS;
  const guideOpen = state.candleGuideOpen !== false;

  let html = `
    <div class="panel">
      <div class="guide-head" onclick="toggleCandleGuide()">
        <h3 style="margin:0;">新手導讀：K棒怎麼看？</h3><span class="mute">${guideOpen?'收合 ▲':'展開 ▼'}</span>
      </div>
      ${guideOpen ? `
      <div class="guide">
        <div class="guide-fig">
          ${candleSVG([{o:30,h:92,l:8,c:70},{o:70,h:92,l:8,c:30}], null, 1.6)}
          <div class="guide-cap"><span style="color:var(--candle-up)">紅K</span>：收盤 &gt; 開盤(上漲)<br><span style="color:var(--candle-down)">黑K(綠)</span>：收盤 &lt; 開盤(下跌)</div>
        </div>
        <ul>
          <li><b>實體</b>：開盤價到收盤價之間的粗柱子，越長代表當天漲跌力道越強(長紅、長黑)。</li>
          <li><b>上影線</b>：實體上方的細線，代表盤中最高價。上影線長＝曾經漲上去但被賣下來，<b>上方有賣壓</b>。</li>
          <li><b>下影線</b>：實體下方的細線，代表盤中最低價。下影線長＝曾經跌下去但被買回來，<b>下方有支撐</b>。</li>
          <li><b>偏多/偏空</b>：型態傳統上暗示之後比較可能上漲(偏多)或下跌(偏空)。同一個形狀出現在不同位置(漲多後 vs 跌深後)，意義可能完全相反。</li>
          <li><b>應驗率</b>：本站用歷史資料實際驗證──偏多型態看之後10天有沒有漲、偏空型態看之後10天有沒有跌。高於50%(綠色)代表這個型態在該指數上歷史表現較可靠。</li>
          <li><b>多頭/盤整/空頭</b>：型態出現時的大環境，依收盤價相對60日線、240日線位置判斷。同一型態在不同大環境下表現常常差很多。</li>
        </ul>
        <div class="note" style="margin-top:4px;">K棒型態只是機率上的參考，不保證之後的走勢，請搭配趨勢、成交量與自己的風險控管。</div>
      </div>` : ''}
    </div>

    <div class="panel">
      <h3>型態判定參數</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>長紅／長黑門檻(實體／開盤價) <b>${cp.longBodyPct}%</b></label>
          <input type="range" min="0.3" max="5" step="0.1" value="${cp.longBodyPct}"
            oninput="setCandleParam('${key}','longBodyPct',+this.value)">
        </div>
        <div class="paramitem">
          <label>長影線門檻(佔當天振幅) <b>${cp.longShadowPct}%</b></label>
          <input type="range" min="10" max="80" step="1" value="${cp.longShadowPct}"
            oninput="setCandleParam('${key}','longShadowPct',+this.value)">
        </div>
        <div class="paramitem">
          <label>爆量倍數(相對前${VOL_SPIKE_LOOKBACK}日均量) <b>${cp.volumeSpikeFactor}x</b></label>
          <input type="range" min="1.1" max="4" step="0.1" value="${cp.volumeSpikeFactor}"
            oninput="setCandleParam('${key}','volumeSpikeFactor',+this.value)">
        </div>
      </div>
      <div class="note">長紅/長黑：實體(｜收盤－開盤｜)占開盤價的比例達門檻。小實體：未達門檻的4成。長影線：影線占當天振幅(最高－最低)的比例達門檻。爆量：成交量達前${VOL_SPIKE_LOOKBACK}日均量的設定倍數。「前段下跌/上漲」：收盤比5天前低(高)，且在20日線之下(上)。</div>
    </div>

    <div class="panel">
      <h3>型態總覽(點選列可查看說明與詳細統計)</h3>
      <div class="tablewrap">
        <table class="pattable">
          <thead><tr><th>圖示</th><th>型態</th><th>類型</th><th>出現次數</th><th>10日上漲機率</th><th>平均10日報酬</th><th>10日應驗率</th></tr></thead>
          <tbody>
          ${CANDLE_GROUPS.map(g=>`
            <tr class="grouprow"><td colspan="7">${g.name}</td></tr>
            ${CANDLE_PATTERNS.filter(p=>p.group===g.key).map(p=>{
              const s = summarizePatternGroup(patterns[p.key]);
              return `<tr onclick="openPattern('${p.key}')">
                <td class="kcell">${candleSVG(p.shape, p.vol, 0.75)}</td>
                <td style="font-family:'Inter',sans-serif;font-weight:600;">${p.name}</td>
                <td>${biasTag(p.bias)}</td>
                <td>${s.count}</td>
                <td>${fmtPct(s.win10,0).replace('+','')}</td>
                <td class="${s.avg10>=0?'up':'down'}">${fmtPct(s.avg10)}</td>
                <td>${hitCell(hitRate(p.bias, s.win10))}</td>
              </tr>`;
            }).join('')}`).join('')}
          </tbody>
        </table>
      </div>
      <div class="note">10日上漲機率＝型態出現後第10個交易日收盤高於當天收盤的比例。應驗率：偏多型態＝上漲機率、偏空型態＝下跌機率；十字線為中性不計。</div>
    </div>
  `;
  CANDLE_GROUPS.forEach(g=>{
    html += `<h2 class="grouptitle">${g.name}</h2>`;
    CANDLE_PATTERNS.filter(p=>p.group===g.key).forEach(p=>{
      const occ = patterns[p.key];
      const byRegime = {'多頭':occ.filter(e=>e.regime==='多頭'), '盤整':occ.filter(e=>e.regime==='盤整'), '空頭':occ.filter(e=>e.regime==='空頭')};
      const last = occ.length ? occ[occ.length-1].date : null;
      html += `<details class="panel patcard" id="pat-${p.key}">
        <summary>
          ${candleSVG(p.shape, p.vol, 0.8)}
          <div class="pat-title"><b>${p.name}</b> ${biasTag(p.bias)}<small>共 ${occ.length} 次${last?` · 最近一次 ${last}`:''}</small></div>
        </summary>
        <div class="pat-body">
          <div class="pat-explain">
            ${candleSVG(p.shape, p.vol, 1.5)}
            <div>
              <p class="pat-meaning">${p.meaning}</p>
              <p class="note" style="margin:6px 0 0;">判定條件：${p.rule}</p>
            </div>
          </div>
          <div class="compare" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
            ${['多頭','盤整','空頭'].map(r=>candleRegimeCol(r, byRegime[r])).join('')}
          </div>
        </div>
      </details>`;
    });
  });
  return html;
}
function candleRegimeCol(regimeName, occ){
  const s = summarizePatternGroup(occ);
  const color = regimeName==='多頭'?'var(--up)':regimeName==='空頭'?'var(--down)':'var(--mute)';
  return `<div class="col">
    <h4><i class="dot" style="background:${color}"></i>${regimeName}(${s.count}次)</h4>
    <div class="row"><span>+5日勝率</span><b class="${s.win5>=0.5?'up':'down'}">${fmtPct(s.win5,0)}</b></div>
    <div class="row"><span>+10日勝率</span><b class="${s.win10>=0.5?'up':'down'}">${fmtPct(s.win10,0)}</b></div>
    <div class="row"><span>平均+5日報酬</span><b class="${s.avg5>=0?'up':'down'}">${fmtPct(s.avg5)}</b></div>
    <div class="row"><span>平均+10日報酬</span><b class="${s.avg10>=0?'up':'down'}">${fmtPct(s.avg10)}</b></div>
    <div class="row"><span>+5日乖離率(20MA)</span><b>${fmtPct(s.avgB20_5)}</b></div>
    <div class="row"><span>+10日乖離率(20MA)</span><b>${fmtPct(s.avgB20_10)}</b></div>
    <div class="row"><span>+5日乖離率(60MA)</span><b>${fmtPct(s.avgB60_5)}</b></div>
    <div class="row"><span>+10日乖離率(60MA)</span><b>${fmtPct(s.avgB60_10)}</b></div>
  </div>`;
}

const THEMES = [
  {key:'crash', name:'跌深反彈量能分析'},
  {key:'candle', name:'K棒型態分析'},
];
function switchTheme(theme){ state.theme = theme; render(); }
function render(){
  const app = document.getElementById('app');
  if (!app) return; // 目前不在指數頁面
  const rows = state.active ? state.data[state.active] : null;
  const meta = state.active ? (state.meta[state.active]||{hasOHLC:true,hasVolume:true,name:state.active}) : null;
  const params = state.active ? state.params[state.active] : null;
  const events = state.active ? (state.events[state.active]||[]) : [];
  const themeName = (THEMES.find(t=>t.key===state.theme)||THEMES[0]).name;

  if (state.dataStatus==='loading'){
    app.innerHTML = `<div class="panel"><div class="empty"><p>正在載入最新指數資料…</p></div></div>`;
    return;
  }
  const dm = state.dataMeta;
  const updatedLine = dm ? `<div class="updated">資料更新：${dm.updated_at} (台北時間) · 每個工作日 05:30、15:30 自動更新</div>`
    : (state.dataStatus==='error' ? `<div class="updated">無法載入資料(${state.dataError||''})</div>` : '');

  let html = `
    <header class="top">
      <div>
        <h1>${themeName}</h1>
        <p>全球主要指數 · 急跌事件與K棒型態研究</p>
        ${updatedLine}
      </div>
      <div class="pickrow">
        <label for="indexPick">指數</label>
        <select id="indexPick" class="indexpick" onchange="switchTab(this.value)">
          ${state.indexList.map(c=>`<option value="${c.key}" ${c.key===state.active?'selected':''}>${c.name}${state.data[c.key]?' · '+state.data[c.key].length+'筆':''}</option>`).join('')}
        </select>
      </div>
    </header>
  `;

  if (!state.active || !rows){
    html += `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>目前無法取得指數資料，請稍後重新整理頁面。</p></div></div>`;
    app.innerHTML = html;
    return;
  }

  if (state.theme==='candle'){
    html += renderCandleTheme();
    app.innerHTML = html;
    return;
  }

  const summary = computeSummary(events);
  const buckets = meta.hasVolume ? bucketByRatio(events) : null;

  html += `
        ${(!meta.hasVolume) ? `<div class="banner info">此資料集沒有成交量欄位，量能比值分析已停用；下方仍會正常呈現急跌事件、底部、反彈報酬與勝率統計。${!meta.hasOHLC?' 資料僅含收盤價，圖表以收盤價折線呈現(無法繪製K線)。':''}</div>` : ''}

    <div class="panel">
      <div class="chartbar">
        <h3 style="margin:0;">${meta.name} · ${meta.hasOHLC?'K線圖':'收盤價走勢圖'}(標記急跌事件)</h3>
        <div class="filerow">
          <div class="zoomrow">
            <button onclick="setZoomPreset('${state.active}','all')">全部</button>
            <button onclick="setZoomPreset('${state.active}',1250)">5年</button>
            <button onclick="setZoomPreset('${state.active}',500)">2年</button>
            <button onclick="setZoomPreset('${state.active}',250)">1年</button>
            <button onclick="setZoomPreset('${state.active}',60)">3個月</button>
          </div>
        </div>
      </div>
      <div class="chartwrap">
        <canvas id="priceCanvas"></canvas>
        ${meta.hasVolume ? `<canvas id="volCanvas"></canvas>` : ''}
      </div>
      <div class="legend">
        <span><i class="dot" style="background:#E5484D"></i>起跌點(峰)</span>
        <span><i class="dot" style="background:#5B8DEF"></i>底部</span>
        <span><i class="dot" style="background:#2AC8A0"></i>回到起跌點</span>
        <span><i class="dot" style="background:#F0B94D"></i>創歷史新高</span>
        <span><i class="dot" style="background:rgba(229,72,77,.4)"></i>下跌區間</span>
        <span><i class="dot" style="background:rgba(42,200,160,.4)"></i>反彈區間</span>
        <span style="color:var(--mute)">｜K棒與成交量：紅漲綠跌｜</span>
        <span><i class="dot" style="background:#F0B94D"></i>MA5</span>
        <span><i class="dot" style="background:#5B8DEF"></i>MA20</span>
        <span><i class="dot" style="background:#C08CF0"></i>MA60</span>
        <span><i class="dot" style="background:#C9CED8"></i>MA240</span>
        <span style="color:var(--mute)">滾輪縮放 · 拖曳平移 · 點下方表格列可跳轉</span>
      </div>
    </div>

    <div class="panel">
      <h3>偵測參數</h3>
      <div class="paramgrid">
        <div class="paramitem">
          <label>急跌幅度門檻 <b>${params.dropPct}%</b></label>
          <input type="range" min="-30" max="-5" step="1" value="${params.dropPct}"
            oninput="setParam('${state.active}','dropPct',+this.value)">
        </div>
        <div class="paramitem">
          <label>天數窗口(交易日) <b>${params.windowDays}</b></label>
          <input type="range" min="2" max="20" step="1" value="${params.windowDays}"
            oninput="setParam('${state.active}','windowDays',+this.value)">
        </div>
        <div class="paramitem">
          <label>底部搜尋範圍(交易日) <b>${params.bottomSearchDays}</b></label>
          <input type="range" min="10" max="250" step="5" value="${params.bottomSearchDays}"
            oninput="setParam('${state.active}','bottomSearchDays',+this.value)">
        </div>
        <div class="paramitem">
          <label>後續追蹤天數(交易日) <b>${params.followUpDays}</b></label>
          <input type="range" min="60" max="750" step="10" value="${params.followUpDays}"
            oninput="setParam('${state.active}','followUpDays',+this.value)">
        </div>
      </div>
      <div class="note">定義：於「天數窗口」內從近期高點下跌達「急跌幅度門檻」即判定為一次急跌事件；起跌點取窗口內收盤最高的一日；底部為起跌後「底部搜尋範圍」內的最低價(無最高低價資料時以收盤價替代)；反彈是否成功分別以「回到起跌點價位」與「創歷史新高」兩種基準各自統計；成交量比值 = 下跌區間(起跌點→底部)總量 ÷ 反彈區間(底部隔日起，取與下跌區間相同天數)總量，僅在資料含成交量欄位時計算。</div>
    </div>

    <div class="panel">
      <h3>整體統計(共 ${summary.count} 筆急跌事件)</h3>
      <div class="statgrid">
        <div class="stat"><div class="v">${summary.count}</div><div class="l">事件數</div></div>
        <div class="stat"><div class="v ${summary.win5>=0.5?'up':'down'}">${fmtPct(summary.win5,0)}</div><div class="l">反彈後+5日勝率</div></div>
        <div class="stat"><div class="v ${summary.win10>=0.5?'up':'down'}">${fmtPct(summary.win10,0)}</div><div class="l">反彈後+10日勝率</div></div>
        <div class="stat"><div class="v ${summary.avg5>=0?'up':'down'}">${fmtPct(summary.avg5)}</div><div class="l">平均+5日報酬</div></div>
        <div class="stat"><div class="v ${summary.avg10>=0?'up':'down'}">${fmtPct(summary.avg10)}</div><div class="l">平均+10日報酬</div></div>
        <div class="stat"><div class="v ${summary.win20>=0.5?'up':'down'}">${fmtPct(summary.win20,0)}</div><div class="l">反彈後+20日勝率</div></div>
        <div class="stat"><div class="v ${summary.win60>=0.5?'up':'down'}">${fmtPct(summary.win60,0)}</div><div class="l">反彈後+60日勝率</div></div>
        <div class="stat"><div class="v ${summary.avg20>=0?'up':'down'}">${fmtPct(summary.avg20)}</div><div class="l">平均+20日報酬</div></div>
        <div class="stat"><div class="v ${summary.avg60>=0?'up':'down'}">${fmtPct(summary.avg60)}</div><div class="l">平均+60日報酬</div></div>
        <div class="stat"><div class="v">${fmtPct(summary.newHighProb,0)}</div><div class="l">後續創歷史新高機率</div></div>
        <div class="stat"><div class="v">${fmtPct(summary.reDeclineProb,0)}</div><div class="l">回起跌點後續跌機率</div></div>
      </div>
    </div>

    <div class="panel">
      <h3>反彈結構統計(乖離率與反彈無力訊號)</h3>
      <div class="statgrid">
        <div class="stat"><div class="v ${summary.avgBias20<=0?'down':'up'}">${fmtPct(summary.avgBias20)}</div><div class="l">平均谷底乖離率(20MA)</div></div>
        <div class="stat"><div class="v ${summary.avgBias60<=0?'down':'up'}">${fmtPct(summary.avgBias60)}</div><div class="l">平均谷底乖離率(60MA)</div></div>
        <div class="stat"><div class="v">${fmtPct(summary.avgStallBias20)}</div><div class="l">反彈無力乖離率(20MA)</div></div>
        <div class="stat"><div class="v">${fmtPct(summary.avgStallBias60)}</div><div class="l">反彈無力乖離率(60MA)</div></div>
        <div class="stat"><div class="v">${summary.stallSampleCount}/${summary.count}</div><div class="l">有效樣本數(其餘${summary.noStallCount}筆持續強勢未拉回)</div></div>
      </div>
      <div class="note" style="margin-top:10px;">反彈無力乖離率定義：從底部起追蹤收盤價的區間新高，第一次從某個高點回落達 ${(STALL_PULLBACK_PCT*100).toFixed(0)}% 以上時，取當時那個高點的乖離率(相對20日線/60日線)。數值越高代表反彈通常要漲到「離均線更遠」才會開始拉回；數值偏低則代表反彈剛脫離均線不遠就容易無力。若追蹤期間內完全沒出現${(STALL_PULLBACK_PCT*100).toFixed(0)}%以上拉回，該筆事件不計入平均值(視為持續強勢)，樣本數會顯示在上方。</div>
      <div class="note" style="margin-top:14px;margin-bottom:6px;">最終方向分佈：追蹤期間最後一天，收盤價同時高於60日線與240日線(高於240日線1%以上)判為多方；同時低於兩者(低於240日線1%以上)判為空方；其餘(在均線附近拉鋸、或多空訊號不一致)判為盤整：</div>
      <div class="splitbar" style="height:22px;">
        ${dirBarSegment(summary.dirCounts,'多方','var(--up)')}
        ${dirBarSegment(summary.dirCounts,'盤整','var(--mute)')}
        ${dirBarSegment(summary.dirCounts,'空方','var(--down)')}
        ${dirBarSegment(summary.dirCounts,'N/A','#2a3040')}
      </div>
      <div class="legend" style="margin-top:8px;">
        <span><i class="dot" style="background:var(--up)"></i>多方 ${summary.dirCounts['多方']}筆</span>
        <span><i class="dot" style="background:var(--mute)"></i>盤整 ${summary.dirCounts['盤整']}筆</span>
        <span><i class="dot" style="background:var(--down)"></i>空方 ${summary.dirCounts['空方']}筆</span>
        <span><i class="dot" style="background:#2a3040"></i>資料不足 ${summary.dirCounts['N/A']}筆</span>
      </div>
    </div>

    ${!meta.hasVolume ? `<div class="panel"><div class="note">此指數資料無成交量，量能結構分組比較已停用。</div></div>`
      : buckets ? `
    <div class="panel">
      <h3>量能結構分組比較(以下跌/反彈成交量比值 = ${fmtNum(buckets.threshold,0)} 為分界)</h3>
      <div class="compare">
        <div class="col">
          <h4><i class="dot" style="background:var(--down)"></i> 量縮反彈組 — 反彈量 &lt; 下跌量 (比值≥${fmtNum(buckets.threshold,0)}，共${buckets.highSummary.count}筆)</h4>
          ${compareRows(buckets.highSummary)}
        </div>
        <div class="col">
          <h4><i class="dot" style="background:var(--up)"></i> 量增反彈組 — 反彈量 ≥ 下跌量 (比值&lt;${fmtNum(buckets.threshold,0)}，共${buckets.lowSummary.count}筆)</h4>
          ${compareRows(buckets.lowSummary)}
        </div>
      </div>
      <div class="note">若「量增反彈組」在勝率、報酬與創新高機率上明顯優於「量縮反彈組」，即支持假說：反彈期間量能是否放大，與後續反彈力道及續創新高的機率相關；反之則代表此指數樣本中量能比值對後市判斷的參考性較弱。事件樣本數少時，統計結果僅供參考，避免過度解讀。</div>
    </div>` : `<div class="panel"><div class="note">目前可計算量能比值的事件數不足以分組比較(需至少2筆有效量比的事件)。</div></div>`}

    <div class="panel">
      <h3>急跌事件明細</h3>
      <div class="note" style="margin-top:0;margin-bottom:10px;">谷底乖離率 = (底部收盤價 − 當日均線) ÷ 當日均線，負值越大代表跌得越深、離均線越遠(超跌)。+5/+10/+20/+60日報酬皆以「底部當天收盤價」為基準，計算其後第N個交易日收盤價的漲跌幅。</div>
      <div class="tablewrap">
        <table>
          <thead><tr>
            <th>起跌日</th><th>起跌前高</th><th>底部日</th><th>底部價</th><th>跌幅</th><th>到底天數</th>
            <th>谷底乖離率(20MA)</th><th>谷底乖離率(60MA)</th>
            ${meta.hasVolume?'<th>量比(跌/漲)</th>':''}
            <th>+5日報酬</th><th>+10日報酬</th><th>+20日報酬</th><th>+60日報酬</th><th>回起跌點天數</th><th>創新高天數</th>
          </tr></thead>
          <tbody>
            ${events.map((ev)=>`
              <tr onclick="focusEvent('${state.active}', ${JSON.stringify(ev).replace(/"/g,'&quot;')})">
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

  app.innerHTML = html;
  requestAnimationFrame(()=>drawChart(state.active));
}

function compareRows(s){
  return `
    <div class="row"><span>+5日勝率</span><b class="${s.win5>=0.5?'up':'down'}">${fmtPct(s.win5,0)}</b></div>
    <div class="row"><span>+10日勝率</span><b class="${s.win10>=0.5?'up':'down'}">${fmtPct(s.win10,0)}</b></div>
    <div class="row"><span>+20日勝率</span><b class="${s.win20>=0.5?'up':'down'}">${fmtPct(s.win20,0)}</b></div>
    <div class="row"><span>+60日勝率</span><b class="${s.win60>=0.5?'up':'down'}">${fmtPct(s.win60,0)}</b></div>
    <div class="row"><span>平均+5日報酬</span><b class="${s.avg5>=0?'up':'down'}">${fmtPct(s.avg5)}</b></div>
    <div class="row"><span>平均+10日報酬</span><b class="${s.avg10>=0?'up':'down'}">${fmtPct(s.avg10)}</b></div>
    <div class="row"><span>平均+20日報酬</span><b class="${s.avg20>=0?'up':'down'}">${fmtPct(s.avg20)}</b></div>
    <div class="row"><span>平均+60日報酬</span><b class="${s.avg60>=0?'up':'down'}">${fmtPct(s.avg60)}</b></div>
    <div class="row"><span>後續創新高機率</span><b>${fmtPct(s.newHighProb,0)}</b></div>
    <div class="row"><span>回起跌點後續跌機率</span><b>${fmtPct(s.reDeclineProb,0)}</b></div>
  `;
}
function ratioCell(ratio){
  if (Number.isNaN(ratio)) return '<span class="tag na">N/A</span>';
  const downShare = clamp(ratio/(ratio+1),0.05,0.95)*100;
  return `<span class="mono">${fmtNum(ratio,2)}</span> <span class="mini-split"><div style="width:${downShare}%;background:var(--down)"></div><div style="width:${100-downShare}%;background:var(--up)"></div></span>`;
}
function renderLevels(structure){
  if (!structure) return '<span class="tag na">N/A</span>';
  return structure.levels.map(lv=>{
    let cls='na', label='未觸及';
    if (lv.crossIdx>-1){
      if (lv.held){ cls='yes'; label='站穩'; }
      else { cls='no'; label='遇壓'; }
    }
    return `<span class="tag ${cls}" title="MA${lv.period} ${label}" style="margin-right:3px;">${lv.period}${cls==='yes'?'✓':cls==='no'?'✗':'-'}</span>`;
  }).join('');
}
function finalDirTag(structure){
  if (!structure || structure.finalDir==='N/A') return '<span class="tag na">N/A</span>';
  const map = {'多方':'yes','空方':'no','盤整':'na'};
  return `<span class="tag ${map[structure.finalDir]}">${structure.finalDir}</span>`;
}
function dirBarSegment(counts, key, color){
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  if (!total) return '';
  const pct = counts[key]/total*100;
  if (pct<=0) return '';
  return `<div style="width:${pct}%;background:${color}" title="${key} ${counts[key]}筆"></div>`;
}

function switchTab(key){ state.active = key; render(); }

window.addEventListener('resize', ()=>{ if(document.getElementById('app') && state.active && state.data[state.active]) drawChart(state.active); });


/* ============================== 註冊到 Little Trader ============================== */
let _indicesBooted = false;
function mountIndices(container, theme){
  container.innerHTML = '<div id="app"></div>';
  state.theme = theme;
  if (!_indicesBooted){ _indicesBooted = true; init(); } else { render(); }
}
LT.register({ section:'index', key:'crash', name:'跌深反彈量能分析', mount: el=>mountIndices(el,'crash') });
LT.register({ section:'index', key:'candle', name:'K棒型態分析', mount: el=>mountIndices(el,'candle') });
