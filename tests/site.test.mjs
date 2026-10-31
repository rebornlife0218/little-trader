// 網站前端的自動測試(npm test)：每個頁面註冊得起來、網址不重複、權限清單和 index.html 一致、沒有外部腳本、沒有殘留的 #/ 舊網址
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACCESS, loadSite, routes, scriptList } from '../scripts/site-map.mjs';

const WEB = new URL('../web/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
const rel = f => relative(WEB, f).replace(/\\/g, '/');
const site = loadSite(WEB);
const { html, pub } = scriptList(WEB);

test('所有頁面程式都載入得起來(沒有語法錯誤、載入時不出錯)', () => {
  assert.deepEqual(site.errors, []);
  assert.ok(site.pages.length >= 15, `只註冊了 ${site.pages.length} 個頁面`);
});

test('每個頁面的區塊都存在，同一區塊裡的網址不重複', () => {
  const keys = new Set(site.sections.map(s => s.key));
  const seen = new Set();
  for (const p of site.pages) {
    assert.ok(keys.has(p.section), `${p.name}：未知區塊 ${p.section}`);
    assert.ok(p.key && /^[a-z0-9-]+$/.test(p.key), `${p.name}：網址 key 只能用小寫英數與 -(${p.key})`);
    const k = `${p.section}/${p.key}`;
    assert.ok(!seen.has(k), `網址重複：${k}`);
    seen.add(k);
  }
});

test('目錄頁(LT.catalog)的項目 key 不重複，每個可以點的項目都有 run()', () => {
  for (const p of site.pages.filter(x => x.catalog)) {
    const items = p.catalog.groups.flatMap(g => g.items);
    const keys = items.map(i => i.key);
    assert.equal(new Set(keys).size, keys.length, `${p.name} 的項目 key 重複：${keys}`);
    for (const it of items) if (!it.soon) assert.equal(typeof it.run, 'function', `${p.name} › ${it.name} 沒有 run()`);
  }
});

test('有網址的頁面不重複，也不會和網站的資料夾撞名', () => {
  const R = routes(site), paths = R.map(r => r.path);
  assert.equal(new Set(paths).size, paths.length, '網址重複');
  for (const r of R) {
    assert.ok(!['api', 'assets', 'content', 'data', 'modules'].includes(r.path.split('/')[0]), `撞名：${r.path}`);
    assert.ok(r.title && r.desc, `${r.path} 沒有標題或說明(分享預覽用)`);
  }
});

test('後台熱門主題的子項目(topics)都是名稱字串或 {name, items}', () => {
  const ok = t => typeof t === 'string' ? t.length > 0 : t && typeof t.name === 'string' && (t.items || []).every(ok);
  for (const p of site.pages) {
    for (const t of p.topics || []) assert.ok(ok(t), `${p.name} 的 topics 格式不對`);
    if (p.catalog) for (const it of p.catalog.groups.flatMap(g => g.items)) for (const t of it.topics || []) assert.ok(ok(t), `${it.name} 的 topics 格式不對`);
  }
});

test('權限清單(access.json)：會員、管理員程式都存在，而且不寫在 index.html', () => {
  for (const f of [...ACCESS.memberScripts, ...ACCESS.adminScripts]) {
    assert.ok(existsSync(join(WEB, f)), `access.json 列的檔案不存在：${f}`);
    assert.ok(!pub.includes(f), `會員程式不能寫在 index.html：${f}`);
  }
  const sectionKeys = site.sections.map(s => s.key);
  for (const s of ACCESS.memberSections) assert.ok(sectionKeys.includes(s), `memberSections 有未知區塊：${s}`);
});

test('研究與策略：需要登入的資料集一律用 LT.loadReport 載入(訪客拿精簡版)，每個都有精簡版規則；研究、策略的目錄頁標 report', async () => {
  const { BRIEFS } = await import('../scripts/briefs.mjs');
  for (const d of ACCESS.memberDatasets) assert.equal(typeof BRIEFS[d], 'function', `${d} 沒有精簡版規則(scripts/briefs.mjs 的 BRIEFS)`);
  for (const f of walk(join(WEB, 'modules')).filter(f => f.endsWith('.js'))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/LT\.loadJSON\(\s*'(\w+)'/g))
      assert.ok(!ACCESS.memberDatasets.includes(m[1]), `${rel(f)} 用 LT.loadJSON 載入需要登入的 ${m[1]}，訪客會拿不到；改用 LT.loadReport`);
  }
  const cat = (sec, key) => site.pages.find(p => p.section === sec && p.key === key);
  for (const [sec, key] of [['stock', 'tw-strategy'], ['stock', 'tw-research'], ['stock', 'us-strategy'], ['etf', 'research']])
    assert.equal(cat(sec, key).catalog.report, true, `${sec}/${key} 是研究或策略，LT.catalog 要設 report: true`);
  const disp = cat('stock', 'disposition').catalog.groups.flatMap(g => g.items);
  for (const k of ['kbar', 'strategy']) assert.equal(disp.find(i => i.key === k).report, true, `處置股 › ${k} 要設 report: true`);
});

test('精簡版的先講結論：只取報告開頭的 > 引言', async () => {
  const { heroOf, BRIEFS } = await import('../scripts/briefs.mjs');
  assert.equal(heroOf('\n> **先講結論**：甲\n> 乙\n\n## 一、研究目的\n內容'), '> **先講結論**：甲\n> 乙');
  assert.equal(heroOf('## 標題\n> 不是開頭'), '');
  const b = BRIEFS.tw_gap('gap.json', { asof: 'x', start: 'y', n: 1, bins: [], all: { n: [1], ov: [2], intra: [3] }, nl: { n: [1], ov: [2], intra: [3] }, fill: {}, vol: {}, report: '> **先講結論**：丙\n\n## 一、研究目的\n機密' });
  assert.equal(b.hero, '> **先講結論**：丙');
  assert.ok(!('report' in b) && !('fill' in b) && !('intra' in b.all), '精簡版不能有完整報告的欄位');
  // 近期明細要登入：精簡版不能有股票代號、名稱、日期與選股
  const t = BRIEFS.tw_strategy('rev20.json', { d: [], nav: {}, trades: [['2330', '台積電', '2026-01-02', '2026-01-10', 0.1, 'time', 5, 0, 0, 8]], recent: [{ d: 'x', p: [['2330']] }], cols: [], skipped: [] });
  assert.deepEqual(t.trades[0].slice(0, 4), ['', '', '', '2026']);
  assert.ok(!('recent' in t) && !('cols' in t) && !('skipped' in t));
  assert.ok(!('picks' in BRIEFS.tw_strategy('backtest.json', { d: [], picks: { lv10p: [['2330']] } })));
  assert.ok(!('picks' in BRIEFS.sp500('backtest.json', { d: [], nav: {}, q: [{ q: '2026Q1', picks: { s1: [['AAPL']] } }] }).q[0]));
  const enc = { enc: { iter: 1, salt: 'a', iv: 'b', ct: 'c' } };
  assert.deepEqual(BRIEFS.tw_research('disp.json', enc), enc, '上鎖的研究：精簡版就是整份加密檔');
});

test('訪客載入的程式(index.html)只註冊訪客能看的區塊', () => {
  const pubSite = loadSite(WEB, { only: 'public' });
  assert.deepEqual(pubSite.errors, []);
  for (const p of pubSite.pages) assert.ok(!ACCESS.memberSections.includes(p.section), `${p.name}(${p.section})在會員區塊，程式要放到 access.json 的 memberScripts`);
});

test('每個頁面程式都有被載入(寫在 index.html 或 access.json)', () => {
  const loaded = new Set(site.files);
  for (const f of walk(join(WEB, 'modules')).map(rel).filter(f => f.endsWith('.js'))) assert.ok(loaded.has(f), `沒有被載入的程式：${f}`);
});

test('index.html：<script> 都加 defer、只載入本站的檔案', () => {
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1];
    if (!/\bsrc=/.test(attrs)) continue;
    assert.match(attrs, /\bdefer\b/, `沒有 defer：${m[0]}`);
    assert.doesNotMatch(attrs, /src="(https?:)?\/\//, `外部腳本：${m[0]}`);
  }
  assert.match(html, /<base href="\/">/, 'index.html 要有 <base href="/">(部署時改寫成備援站的子目錄)');
});

test('app.js 裡沒有同名的函式或變數遮蔽 LT 的公開函式(例如搜尋框裡另宣告 go，會讓換頁失效)', () => {
  const s = readFileSync(join(WEB, 'assets/js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // 去掉註解
  const exported = s.match(/return \{ get auth\(\)[^\n]*\};/)[0].match(/\b[a-zA-Z_]\w*\b/g);
  for (const name of new Set(exported)) {
    const decl = s.match(new RegExp(`(?:\\b(?:const|let|var|function)\\s+${name}\\b)|(?:[,(]\\s*${name}\\s*(?:=[^=>]|[,)]\\s*=>))`, 'g')) || [];
    assert.ok(decl.length <= 1, `app.js 宣告了 ${decl.length} 次 ${name}：${decl.join(' / ')}`);
  }
});

test('文字對比：次要文字、強調色在暗色與淺色主題都 ≥ 4.5:1', () => {
  const css = readFileSync(join(WEB, 'assets/css/components.css'), 'utf8');
  const block = sel => { const i = css.indexOf(sel + '{'); return css.slice(i, css.indexOf('}', i)); };
  const tok = (b, name) => (b.match(new RegExp(`--${name}:(#[0-9A-Fa-f]{6})`)) || [])[1];
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [theme, b] of [['暗色', block('  :root')], ['淺色', block('  :root[data-theme="light"]')]]) {
    for (const fg of ['mute', 'dim', 'text', 'amber']) for (const bg of ['bg', 'panel']) {
      const r = ratio(tok(b, fg), tok(b, bg));
      assert.ok(r >= 4.5, `${theme} --${fg} 對 --${bg} 只有 ${r.toFixed(2)}:1`);
    }
  }
});

test('網頁程式沒有 CDN 或外部腳本', () => {
  for (const f of walk(WEB).filter(f => /\.(js|html)$/.test(f) && !f.includes('vendor'))) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /<script[^>]+src=["'`]https?:/i, `${rel(f)} 載入外部腳本`);
    assert.doesNotMatch(s, /\b(cdn\.jsdelivr|cdnjs|unpkg)\./, `${rel(f)} 用到 CDN`);
  }
});

test('站內連結用一般網址，不再用 #/ 舊網址', () => {
  for (const f of walk(WEB).filter(f => /\.(js|html|md)$/.test(f) && !f.includes('vendor'))) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /href=["'`]#\/|\]\(#\/|location\.hash\s*=/, `${rel(f)} 還有 #/ 舊網址`);
  }
});

test('新策略、研究上線：events.py 的每個台股事件型策略都列在策略頁(後台熱門主題依目錄頁自動列出)；IG 圖卡的網址都對得到頁面', async () => {
  const items = sec => new Map(site.pages.filter(p => p.catalog && p.section === sec).flatMap(p => p.catalog.groups.flatMap(g => g.items.map(it => [`${p.section}/${p.key}/${it.key}`, it]))));
  const all = new Map([...items('stock'), ...items('etf'), ...items('index'), ...items('stats'), ...items('option'), ...items('other')]);
  const py = readFileSync(new URL('../pipeline/tw_strategy/events.py', import.meta.url), 'utf8');
  const keys = [...py.slice(py.indexOf('STRATEGIES = [')).matchAll(/\{'key': '(\w+)', 'side'/g)].map(m => m[1]);
  assert.ok(keys.length >= 2, 'events.py 找不到策略');
  for (const k of keys) assert.ok(all.has(`stock/tw-strategy/${k}`), `策略 ${k} 沒有列在台股策略頁(web/modules/stock/tw-strategy.js 的 SIDES)`);
  const { TOPICS } = await import('../scripts/share/ig-topics.mjs');
  for (const t of TOPICS) assert.ok(all.has(t.path), `IG 圖卡 ${t.key} 的網址 ${t.path} 沒有對應的頁面`);
});
