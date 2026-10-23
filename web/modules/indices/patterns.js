/* 指數(2/7)：K棒型態的定義與偵測 */
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
