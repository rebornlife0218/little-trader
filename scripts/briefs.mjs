// 研究與策略的公開精簡版：部署時(scripts/build-site.mjs)從需要登入的資料集拆出 data/<資料集>/brief/<檔名>
//   精簡版只放頁面上半部(LT.brief：先講結論、績效卡片、累積報酬圖、近期明細)用到的欄位，用白名單挑選，新欄位預設不公開；
//   完整報告(下半部)用的資料只在原本的檔案裡，訪客下載會被 functions/data/_middleware.ts 擋下(401)。
//   頁面用 LT.loadReport(資料集, 檔名)：登入的人拿完整版，訪客拿精簡版。改了頁面上半部用到的欄位，這裡要一起改。
//   也可以單獨執行：node scripts/briefs.mjs <網站目錄>(本機測試用，產生 <網站目錄>/data/*/brief/)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
// 報告(Markdown)開頭的「> **先講結論**：…」引言：精簡版只帶這一段(網頁放在最上方)
export function heroOf(md) {
  const lines = String(md || '').split(/\r?\n/), out = [];
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  while (i < lines.length && lines[i].startsWith('>')) out.push(lines[i++]);
  return out.join('\n');
}
const withHero = (o, j) => ({ ...o, hero: heroOf(j.report) });

// 資料集 → (檔名, 完整資料) → 精簡版；回傳 null 表示這個檔沒有精簡版(訪客拿不到)
export const BRIEFS = {
  // 台股策略(stock/tw-strategy.js)：低波動選股的精簡版要用到每月換股紀錄；近期明細要登入，所以不放持股、選股與股票代號
  //   事件型策略的績效卡片要用每筆交易的報酬與天數：交易只留報酬、出場原因、天數、出場年度與借券天數，拿掉代號、名稱與日期
  tw_strategy: (f, j) => j.enc ? j   // 不公開的策略：整份加密，要密碼才能解開
    : f === 'backtest.json' ? pick(j, ['asof', 'd', 'nav', 'npos', 'tstat', 'm'])
    : { ...pick(j, ['key', 'side', 'asof', 'd', 'nav', 'npos', 'expo', 'params', 'info']),
        trades: (j.trades || []).map(t => ['', '', '', t[3] ? String(t[3]).slice(0, 4) : t[3], t[4], t[5], t[6], 0, 0, t[9]]) },
  // 美股策略(stock/us-strategy.js)：精簡版依回測起點與成本算出最好的策略，要用到全部淨值與每季持股
  sp500: (f, j) => f === 'backtest.json' ? { ...pick(j, ['asof', 'd', 'nav']), q: j.q.map(({ picks, ...q }) => q) } : null,   // 每季持股(近期明細)要登入
  // 台股其他研究、處置股策略與處置期間的 K 棒(stock/tw-research.js)：只帶精簡版那一個版本
  tw_research: (f, j) => {
    if (j.enc) return j;   // 上鎖的研究(處置股策略)：整份加密，要密碼才能解開
    const base = withHero(pick(j, ['asof', 'd', 'b0050']), j);
    const one = (T, keys) => T && pick(T, keys);
    switch (f) {
      case 'rev_pre.json': {
        const V = j.versions[0];
        return { ...base, versions: [{ ...pick(V, ['key', 'name']), nav: { t10: V.nav.t10 }, ts: { t10: V.ts.t10 } }] };
      }
      case 'rev_drop.json': return { ...base, strats: [one(j.strats[0], ['key', 'name', 'nav', 'ts'])] };
      case 'rev_growth.json': return { ...base, strats: [one(j.strats.find(x => x.h === '5日' && x.g === '分數 = 3') || j.strats[0], ['h', 'g', 'nav', 'ts'])] };
      case 'rev_turn.json': return { ...base, strats: [one(j.strats.find(x => x.h === '20日' && x.g === '由負轉正') || j.strats[0], ['h', 'g', 'nav', 'ts'])] };
      case 'disp.json': return { ...base, strat: one(j.strat, ['name', 'nav', 'ts']) };   // 近期明細(交易、即將進場)要登入
      case 'disp_kbar.json': return withHero({ ...pick(j, ['asof', 'points']), rows: j.rows.filter(r => r.g === '全部'), info: j.info.filter(r => r.g === '全部') }, j);
      default: return null;
    }
  },
  // 跳空與隔夜報酬(stock/tw-research.js)：精簡版只有各組的隔夜平均
  tw_gap: (f, j) => f === 'gap.json'
    ? withHero({ ...pick(j, ['asof', 'start', 'n', 'bins', 'down', 'up']), all: pick(j.all, ['n', 'ov']), nl: pick(j.nl, ['n', 'ov']) }, j) : null,
  // A 系列 ETF 跟單(etf/research.js)：精簡版只有「加碼｜全部｜跟單出場」
  etf_research: (f, j) => {
    if (f !== 'etf_follow.json') return null;
    const T = j.strats.find(s => s.mode === '加碼' && s.group === '全部' && s.hold === '跟單出場') || j.strats[0], k = `${T.mode}｜${T.group}`;
    return withHero({ ...pick(j, ['asof', 'd']), strats: [T], b0050s: { [k]: j.b0050s[k] } }, j);
  },
};

// <網站目錄>/data/<資料集>/brief/：每個需要登入的資料集都產生一次(先清掉舊的)，回傳產生的檔數
export function writeBriefs(site, datasets) {
  let n = 0;
  for (const ds of datasets) {
    const dir = join(site, 'data', ds), rule = BRIEFS[ds];
    if (!existsSync(dir)) continue;
    if (!rule) throw new Error(`需要登入的資料集 ${ds} 沒有精簡版規則(scripts/briefs.mjs 的 BRIEFS)`);
    const out = join(dir, 'brief');
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'meta.json') continue;
      const b = rule(f, JSON.parse(readFileSync(join(dir, f), 'utf8')));
      if (b) { writeFileSync(join(out, f), JSON.stringify(b)); n++; }
    }
  }
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const site = process.argv[2];
  if (!site) throw new Error('用法：node scripts/briefs.mjs <網站目錄>');
  const A = JSON.parse(readFileSync(new URL('../functions/_lib/access.json', import.meta.url), 'utf8'));
  console.log(`產生 ${writeBriefs(site, A.memberDatasets)} 個精簡版`);
}
