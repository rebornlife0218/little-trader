/* 指數 · 跌深反彈量能分析 / K棒型態分析
   資料集：data/indices/(scripts/indices/update.py，排程見 .github/workflows/data-indices.yml) */
const INDICES_DATASET = 'indices';
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
  dataMeta: null,  // data/indices/meta.json
  active: 'TAIEX',
  theme: 'crash',  // 'crash' | 'candle'
  regimeDef: 'ma_pos', // 多頭/盤整/空頭的定義，見 REGIME_DEFS
  indexList: [],  // [{key,name}] 下拉選單
  data: {},       // key -> array of {date, open,high,low,close,volume}
  loading: {},    // key -> Promise(下載中)
  meta: {},       // key -> {name, hasOHLC, hasVolume}
  ma: {},         // key -> {5:[],20:[],60:[],240:[]}
  regimes: {},    // key -> {defKey, arr:['多頭'|'盤整'|'空頭'|'N/A']}
  events: {},     // key -> computed events (null = 需重算)
  candlePatterns: {}, // key -> {patternKey: occurrences[]} (null = 需重算)
  candleParams: {},   // key -> {longBodyPct, longShadowPct, volumeSpikeFactor}
  params: {},     // key -> params per index
  view: {},       // key -> {start,end} index window for chart
  openPattern: null, // 型態總覽中展開的型態
};

/* ============================== 小工具 ============================== */
function fmtPct(x,digits=1){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return (x*100>=0?'+':'')+(x*100).toFixed(digits)+'%'; }
function fmtNum(x,digits=2){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return Number(x).toLocaleString('en-US',{maximumFractionDigits:digits}); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

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
const DEFAULT_CANDLE_PARAMS = { longBodyPct:1, longShadowPct:50, volumeSpikeFactor:1.5 };
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
/* ============================== 多頭/盤整/空頭定義 ==============================
   使用者可在頁面上方切換；K棒型態的市場環境分組、反彈結構的最終方向都依此判定 */
const REGIME_DEFS = [
  {key:'ma_pos', name:'均線位置(60日線＋年線)',
    desc:'收盤價高於60日線，且高於240日線(年線)1%以上＝多頭；同時低於兩者(低於年線1%以上)＝空頭；其餘＝盤整。'},
  {key:'ma_align', name:'均線排列(20/60/240日)',
    desc:'20日線 > 60日線 > 240日線(多頭排列)＝多頭；20日線 < 60日線 < 240日線(空頭排列)＝空頭；均線糾結交錯＝盤整。'},
  {key:'ma240_slope', name:'年線方向(240日線斜率)',
    desc:'240日線比20個交易日前上升1%以上＝多頭；下降1%以上＝空頭；其餘(年線走平)＝盤整。'},
  {key:'ret60', name:'近一季漲跌(60日報酬)',
    desc:'收盤價比60個交易日前上漲5%以上＝多頭；下跌5%以上＝空頭；其餘＝盤整。'},
  {key:'range52w', name:'52週高低位置',
    desc:'收盤價位於過去250個交易日最高價～最低價區間的上方30%＝多頭；下方30%＝空頭；中間＝盤整。'},
];
function computeRegimes(data, ma, defKey){
  const n = data.length, out = new Array(n).fill('N/A');
  const c = i=>data[i].close;
  for (let i=0;i<n;i++){
    let r = 'N/A';
    if (defKey==='ma_pos'){
      const m60=ma[60][i], m240=ma[240][i];
      if (!Number.isNaN(m60) && !Number.isNaN(m240)) r = (c(i)>m240*1.01 && c(i)>m60)?'多頭':(c(i)<m240*0.99 && c(i)<m60)?'空頭':'盤整';
    } else if (defKey==='ma_align'){
      const a=ma[20][i], b=ma[60][i], d=ma[240][i];
      if (![a,b,d].some(Number.isNaN)) r = (a>b && b>d)?'多頭':(a<b && b<d)?'空頭':'盤整';
    } else if (defKey==='ma240_slope'){
      const now=ma[240][i], prev=i>=20?ma[240][i-20]:NaN;
      if (!Number.isNaN(now) && !Number.isNaN(prev)){ const sl=now/prev-1; r = sl>=0.01?'多頭':sl<=-0.01?'空頭':'盤整'; }
    } else if (defKey==='ret60'){
      if (i>=60){ const g=c(i)/c(i-60)-1; r = g>=0.05?'多頭':g<=-0.05?'空頭':'盤整'; }
    } else if (defKey==='range52w'){
      if (i>=249){
        let hi=-Infinity, lo=Infinity;
        for (let k=i-249;k<=i;k++){ if(data[k].high>hi) hi=data[k].high; if(data[k].low<lo) lo=data[k].low; }
        const pos = hi>lo ? (c(i)-lo)/(hi-lo) : 0.5;
        r = pos>=0.7?'多頭':pos<=0.3?'空頭':'盤整';
      }
    }
    out[i] = r;
  }
  return out;
}
function regimeDef(){ return REGIME_DEFS.find(d=>d.key===state.regimeDef)||REGIME_DEFS[0]; }
function getRegimes(key){
  const cur = state.regimes[key];
  if (cur && cur.defKey===state.regimeDef) return cur.arr;
  const arr = computeRegimes(state.data[key], state.ma[key], state.regimeDef);
  state.regimes[key] = {defKey:state.regimeDef, arr};
  return arr;
}
function setRegimeDef(defKey){
  state.regimeDef = defKey;
  try{ localStorage.setItem('lt.regimeDef', defKey); }catch(e){}
  // 各指數分析結果都要依新定義重算(用到時才算)
  Object.keys(state.data).forEach(k=>{ state.events[k]=null; state.candlePatterns[k]=null; });
  render();
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

function detectCandlePatterns(data, ma, params, regimes){
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
      return { idx:i, date:data[i].date, ret5, ret10, b20_5, b20_10, b60_5, b60_10, regime: regimes[i] };
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
  if (!state.ma[key]) state.ma[key] = computeAllMA(rows.map(d=>d.close));
  const regimes = getRegimes(key);
  if (state.theme==='crash' && !state.events[key]) state.events[key] = computeEvents(rows, state.params[key], state.ma[key], regimes);
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
    ma:{5:v('--ma5'), 20:v('--ma20'), 60:v('--ma60'), 240:v('--ma240')} };
}
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
      pctx.strokeStyle = C.ma[p];
      pctx.lineWidth = p===240? 1.8 : (p===60? 1.4 : 1.1);
      pctx.globalAlpha = 0.9;
      pctx.stroke();
      pctx.globalAlpha = 1;
    });
  }

  if (vctx){
    let vmax=0; slice.forEach(d=>vmax=Math.max(vmax,d.volume||0));
    vctx.strokeStyle=C.grid; vctx.beginPath(); vctx.moveTo(padL,volH-14); vctx.lineTo(wrapW-padR,volH-14); vctx.stroke();
    slice.forEach((d,i)=>{
      const x=xAt(i); const h=(vmax>0)? (d.volume/vmax)*(volH-24):0;
      vctx.fillStyle = d.close>=d.open? hexA(C.up,0.55):hexA(C.down,0.55);
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
                <td style="font-family:'Inter',sans-serif;font-weight:600;">${p.name}</td>
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
      <div class="note">10日上漲機率＝型態出現後第10個交易日收盤高於當天收盤的比例(紅漲綠跌：高於50%紅色、低於50%綠色)。</div>
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
  {key:'crash', name:'跌深反彈量能分析'},
  {key:'candle', name:'K棒型態分析'},
];
function render(){
  const app = document.getElementById('app');
  if (!app) return; // 目前不在指數頁面
  const themeName = (THEMES.find(t=>t.key===state.theme)||THEMES[0]).name;

  if (state.dataStatus==='loading'){
    app.innerHTML = `<div class="panel"><div class="empty"><p>正在載入最新指數資料…</p></div></div>`;
    return;
  }
  if (state.active && state.data[state.active]) ensureComputed(state.active);
  const rows = state.active ? state.data[state.active] : null;
  const meta = state.active ? (state.meta[state.active]||{hasOHLC:true,hasVolume:true,name:state.active}) : null;
  const params = state.active ? state.params[state.active] : null;
  const events = state.active ? (state.events[state.active]||[]) : [];
  const dm = state.dataMeta;
  const avail = (dm && dm.indices) || {};
  const updatedLine = dm ? LT.sourceLine(dm)
    : (state.dataStatus==='error' ? `<div class="updated">無法載入資料(${state.dataError||''})</div>` : '');
  const rd = regimeDef();

  let html = `
    <header class="top">
      <div>
        <h1>${themeName}</h1>
        <p>全球主要指數 · 急跌事件與K棒型態研究</p>
        ${updatedLine}
      </div>
      <div class="pickers">
        <div class="pickrow">
          <label for="indexPick">指數</label>
          <select id="indexPick" class="indexpick" onchange="switchTab(this.value)" onfocus="prefetchIndices()" onpointerenter="prefetchIndices()">
            ${state.indexList.map(c=>`<option value="${c.key}" ${c.key===state.active?'selected':''}>${c.name}${avail[c.key]?' · '+avail[c.key].rows+'筆':''}</option>`).join('')}
          </select>
        </div>
        <div class="pickrow">
          <label for="regimePick">多空定義</label>
          <select id="regimePick" class="indexpick" onchange="setRegimeDef(this.value)">
            ${REGIME_DEFS.map(d=>`<option value="${d.key}" ${d.key===rd.key?'selected':''}>${d.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </header>
    <div class="regime-note"><b>多頭 / 盤整 / 空頭：</b>${rd.desc}</div>
  `;

  if (!state.active || !rows){
    html += state.loading[state.active]
      ? `<div class="panel"><div class="empty"><p>正在載入「${TICKER_NAMES[state.active]||state.active}」資料…</p></div></div>`
      : `<div class="panel"><div class="empty"><h3 style="margin:0;">資料載入失敗</h3><p>目前無法取得指數資料，請稍後重新整理頁面。${state.dataError?'('+state.dataError+')':''}</p></div></div>`;
    app.innerHTML = html;
    return;
  }

  if (state.theme==='candle'){
    html += renderCandleTheme();
    app.innerHTML = html;
    return;
  }

  const summary = computeSummary(events);

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
        <span><i class="dot" style="background:var(--candle-down)"></i>起跌點(峰)</span>
        <span><i class="dot" style="background:var(--blue)"></i>底部</span>
        <span><i class="dot" style="background:var(--candle-up)"></i>回到起跌點</span>
        <span><i class="dot" style="background:var(--amber)"></i>創歷史新高</span>
        <span><i class="dot" style="background:var(--candle-down);opacity:.45"></i>下跌區間</span>
        <span><i class="dot" style="background:var(--candle-up);opacity:.45"></i>反彈區間</span>
        <span><i class="dot" style="background:var(--ma5)"></i>MA5</span>
        <span><i class="dot" style="background:var(--ma20)"></i>MA20</span>
        <span><i class="dot" style="background:var(--ma60)"></i>MA60</span>
        <span><i class="dot" style="background:var(--ma240)"></i>MA240</span>
        <span style="color:var(--mute)">滾輪縮放 · 拖曳平移 · 點下方表格列可跳轉</span>
      </div>
    </div>

    <div class="panel">
      <h3>偵測參數</h3>
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
      <div class="note">定義：於「天數窗口」內從近期高點下跌達「急跌幅度門檻」即判定為一次急跌事件；起跌點取窗口內收盤最高的一日；底部為起跌後「底部搜尋範圍」內的最低價(無最高低價資料時以收盤價替代)；反彈是否成功分別以「回到起跌點價位」與「創歷史新高」兩種基準各自統計；成交量比值 = 下跌區間(起跌點→底部)總量 ÷ 反彈區間(底部隔日起，取與下跌區間相同天數)總量，僅在資料含成交量欄位時計算。</div>
    </div>

    ${renderCrashStats(events, meta)}

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

  app.innerHTML = html;
  requestAnimationFrame(()=>drawChart(state.active));
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
      <h3>勝率與報酬率(共 ${events.length} 筆急跌事件)</h3>
      <div class="tablewrap">
        <table class="stattable">
          <thead>
            <tr><th rowspan="2">分組</th><th rowspan="2">次數</th><th colspan="4">勝率(上漲機率)</th><th colspan="4">平均報酬率</th></tr>
            <tr><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th><th>+5日</th><th>+10日</th><th>+20日</th><th>+60日</th></tr>
          </thead>
          <tbody>${body(10, s=>win(s.win5)+win(s.win10)+win(s.win20)+win(s.win60)+pct(s.avg5)+pct(s.avg10)+pct(s.avg20)+pct(s.avg60))}</tbody>
        </table>
      </div>
      <div class="note">以「底部當天收盤價」為基準，計算其後第N個交易日的漲跌。勝率＝上漲事件占比(紅漲綠跌：高於50%紅色、低於50%綠色)。</div>
    </div>

    <div class="panel">
      <h3>乖離率與後續發展</h3>
      <div class="tablewrap">
        <table class="stattable">
          <thead>
            <tr><th rowspan="2">分組</th><th rowspan="2">次數</th><th colspan="2">谷底乖離率</th><th colspan="2">反彈無力乖離率</th><th rowspan="2">後續創<br>歷史新高</th><th rowspan="2">回到起跌點後<br>又跌回去</th></tr>
            <tr><th>20MA</th><th>60MA</th><th>20MA</th><th>60MA</th></tr>
          </thead>
          <tbody>${body(8, s=>pct(s.avgBias20)+pct(s.avgBias60)+pct(s.avgStallBias20)+pct(s.avgStallBias60)+prob(s.newHighProb)+prob(s.reDeclineProb))}</tbody>
        </table>
      </div>
      <div class="note">谷底乖離率＝底部收盤價相對均線的偏離，越負代表跌得越深。反彈無力乖離率＝反彈過程中第一次從高點拉回 ${(STALL_PULLBACK_PCT*100).toFixed(0)}% 時，那個高點相對均線的偏離；數值越高代表通常要漲離均線越遠才會拉回(持續強勢未拉回的事件不計入)。量能分組：下跌期間總量 ÷ 反彈期間(取相同天數)總量。樣本數少時僅供參考。</div>
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

/* ============================== 註冊到 Little Trader ============================== */
let _indicesBooted = false;
function mountIndices(container, theme){
  container.innerHTML = '<div id="app"></div>';
  state.theme = theme;
  if (!_indicesBooted){ _indicesBooted = true; init(); } else { render(); }
}
LT.register({ section:'index', key:'crash', name:'跌深反彈量能分析', mount: el=>mountIndices(el,'crash') });
LT.register({ section:'index', key:'candle', name:'K棒型態分析', mount: el=>mountIndices(el,'candle') });
