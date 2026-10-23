/* 指數 · 大盤漲跌分析 / K棒型態分析(1/7)：常數、狀態(state)、小工具、移動平均、多頭/盤整/空頭定義
   資料集：data/indices/(pipeline/indices/update.py，排程見 .github/workflows/data-indices.yml)
   多個檔案共用同一組全域變數與函式(一般 <script>，不是 module)，載入順序見 index.html */
const INDICES_DATASET = 'indices';
/* ============================== 常數與設定 ============================== */
// 指數代碼與中文名稱(下拉選單依此順序排列)
const INDICES = [
  {key:'TAIEX',   name:'台灣加權'},  // 開高低收量來自證交所(成交量為成交金額)，其餘指數來自 Yahoo Finance
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
  mode: 'crash',   // 大盤漲跌分析的模式：'crash' 跌深反彈 | 'myth' 常見迷思 | 'cycle' 週期性分析 | 'm4'
  myth: {},        // key -> 常見迷思統計 (null = 需重算)
  mythParams: {settleDays:15, confirmDays:1},
  cycle: {},       // key -> 週期性分析統計 (null = 需重算)
  cycleParams: {span:0, monthDef:'cal'},
  cursor: {},      // key -> K線圖上點選的資料索引
};

/* ============================== 小工具 ============================== */
function fmtPct(x,digits=1){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return (x*100>=0?'+':'')+(x*100).toFixed(digits)+'%'; }
function fmtNum(x,digits=2){ if(x===null||x===undefined||Number.isNaN(x)) return '—'; return Number(x).toLocaleString('en-US',{maximumFractionDigits:digits}); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

/* ============================== 移動平均線 ============================== */
const MA_PERIODS = [5,10,20,60,120,240];
const VOL_MA = 5; // K線圖成交量均線天數
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
