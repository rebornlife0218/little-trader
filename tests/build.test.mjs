// 部署流程的自動測試：在暫存資料夾跑一次 scripts/build-site.mjs，檢查 _routes.json、各頁面的 HTML、公開版(GitHub Pages)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACCESS } from '../scripts/site-map.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tmp = mkdtempSync(join(tmpdir(), 'lt-build-'));
const site = join(tmp, 'site'), pub = join(tmp, 'pub');
cpSync(join(ROOT, 'web'), site, { recursive: true });
// 假的研究資料(CI 沒有 data 分支)：檢查部署時產生精簡版、公開版只留精簡版
rmSync(join(site, 'data'), { recursive: true, force: true });
mkdirSync(join(site, 'data', 'tw_gap'), { recursive: true });
writeFileSync(join(site, 'data', 'tw_gap', 'meta.json'), '{"version":"1"}');
writeFileSync(join(site, 'data', 'tw_gap', 'gap.json'), JSON.stringify({ asof: '2026-10-30', start: '2016-01-04', n: 9, bins: ['a'], all: { n: [1], ov: [0.1], intra: [0.2] },
  nl: { n: [1], ov: [0.1], intra: [0.2] }, fill: { out: {} }, vol: {}, report: '> **先講結論**：測試\n\n## 一、研究目的\n完整報告才有的內容' }));
execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs'), site, pub, '/little-trader/'], { stdio: 'pipe' });
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const read = f => readFileSync(f, 'utf8');

test('_routes.json：API、會員程式與會員資料集經過 functions', () => {
  const r = JSON.parse(read(join(site, '_routes.json')));
  assert.ok(r.include.includes('/api/*'));
  assert.ok(r.include.includes('/s/*'), '分享連結 /s/ 要經過 functions');
  for (const f of [...ACCESS.memberScripts, ...ACCESS.adminScripts]) assert.ok(r.include.includes('/' + f), f);
  for (const d of ACCESS.memberDatasets) {
    assert.ok(r.include.includes(`/data/${d}/*`), d);
    assert.ok(r.exclude.includes(`/data/${d}/brief/*`), `${d} 的精簡版不用經過 functions`);
  }
});

test('精簡版：部署時從完整資料拆出，不含完整報告', () => {
  const b = JSON.parse(read(join(site, 'data/tw_gap/brief/gap.json')));
  assert.equal(b.hero, '> **先講結論**：測試');
  assert.ok(!read(join(site, 'data/tw_gap/brief/gap.json')).includes('完整報告才有的內容'));
  assert.ok(!('fill' in b) && !('intra' in b.all));
});

test('各頁面的 HTML：標題、說明、分享預覽換成這一頁的', () => {
  const h = read(join(site, 'stats/basic/8.html'));
  assert.match(h, /<title>第 8 章 區間估計 · Little Trader<\/title>/);
  assert.match(h, /<meta property="og:url" content="https:\/\/little-trader\.pages\.dev\/stats\/basic\/8">/);
  assert.match(h, /<link rel="canonical" href="https:\/\/little-trader\.pages\.dev\/stats\/basic\/8">/);
  assert.match(h, /<base href="\/">/);
  for (const p of ['index/crash', 'stock/tw-strategy/lowvol', 'etf/research/lsi']) assert.ok(existsSync(join(site, p + '.html')), p);
  const map = read(join(site, 'sitemap.xml'));
  for (const p of ['etf/pack/intro', 'stock/disposition/strategy']) assert.ok(map.includes(`<loc>https://little-trader.pages.dev/${p}</loc>`), p);
  assert.ok(!map.includes('<loc>https://little-trader.pages.dev/etf/intro</loc>'), '舊網址(轉址頁)不列在 sitemap');
});

test('公開版(GitHub Pages)：拿掉會員程式與資料、根目錄改成子目錄、有 404.html', () => {
  for (const f of [...ACCESS.memberScripts, ...ACCESS.adminScripts]) assert.ok(!existsSync(join(pub, f)), `公開版不能有 ${f}`);
  assert.ok(!existsSync(join(pub, 'data/tw_gap/gap.json')), '公開版不能有完整報告');
  assert.ok(existsSync(join(pub, 'data/tw_gap/brief/gap.json')) && existsSync(join(pub, 'data/tw_gap/meta.json')), '公開版要留精簡版與 meta.json');
  assert.ok(!existsSync(join(pub, '_routes.json')));
  for (const f of ['index.html', '404.html', 'stats/basic/8.html']) assert.match(read(join(pub, f)), /<base href="\/little-trader\/">/, f);
});
