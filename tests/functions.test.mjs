// 後端(functions/)的自動測試：來源檢查、會員程式與會員資料的權限。先用 esbuild 把 TypeScript 打包成一個暫存檔再載入
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { timingSafeEqual } from 'node:crypto';

// Cloudflare Workers 才有的 crypto.subtle.timingSafeEqual，用 Node 的同名函式代替
const bytes = x => new Uint8Array(x.buffer ?? x, x.byteOffset ?? 0, x.byteLength);
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => a.byteLength === b.byteLength && timingSafeEqual(bytes(a), bytes(b));

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tmp = mkdtempSync(join(tmpdir(), 'lt-fn-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const entry = join(tmp, 'entry.ts');
writeFileSync(entry, `
export { checkOrigin, secure } from '${ROOT}functions/_lib/security';
export { sessionCookie, readSession } from '${ROOT}functions/_lib/auth';
export { ACCESS } from '${ROOT}functions/_lib/types';
export { onRequest as modulesMw } from '${ROOT}functions/modules/_middleware';
export { onRequest as dataMw } from '${ROOT}functions/data/_middleware';
`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'fn.mjs'), logLevel: 'error' });
const F = await import(pathToFileURL(join(tmp, 'fn.mjs')).href);

const SITE = 'https://little-trader.pages.dev';
const SECRET = 'test-secret-only-for-tests';
// D1 的替身：查不到資料；次數限制寫入失敗時照常放行(fail open)
const DB = { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => { throw new Error('no db'); }, all: async () => ({ results: [] }) }) }), batch: async () => { throw new Error('no db'); } };
const env = { SESSION_SECRET: SECRET, DB };
const req = (path, headers = {}) => new Request(SITE + path, { headers });
const memberCookie = async () => (await F.sessionCookie(SECRET, 'uid-test', 'test@example.com')).split(';')[0];
async function call(mw, request) {
  let passed = false;
  const res = await mw({ request, env, next: async () => { passed = true; return new Response('ok'); }, waitUntil: () => {} });
  return { passed, res };
}

test('來源檢查：別的網站呼叫 API 一律 403，允許的來源只回自己的網址(不是 *)', () => {
  assert.equal(F.checkOrigin(req('/api/me', { Origin: 'https://evil.example' }), env).status, 403);
  assert.equal(F.checkOrigin(req('/api/me', { 'Sec-Fetch-Site': 'cross-site' }), env).status, 403);
  assert.equal(F.checkOrigin(req('/api/me'), env), null);
  const pre = F.checkOrigin(new Request(SITE + '/api/me', { method: 'OPTIONS', headers: { Origin: SITE } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.notEqual(F.secure(new Response('x'), null).headers.get('Access-Control-Allow-Origin'), '*');
});

test('會員程式：訪客 401，登入後可以下載且不讓 CDN 快取；公開程式照常', async () => {
  const f = '/' + F.ACCESS.memberScripts[0];
  let r = await call(F.modulesMw, req(f));
  assert.equal(r.passed, false); assert.equal(r.res.status, 401);
  r = await call(F.modulesMw, req(f, { Cookie: await memberCookie() }));
  assert.equal(r.passed, true); assert.match(r.res.headers.get('Cache-Control'), /private/);
  r = await call(F.modulesMw, req('/modules/stats/basic.js'));
  assert.equal(r.passed, true);
});

test('後台程式：一般會員也不能下載', async () => {
  const r = await call(F.modulesMw, req('/' + F.ACCESS.adminScripts[0], { Cookie: await memberCookie() }));
  assert.equal(r.passed, false); assert.equal(r.res.status, 401);
});

test('會員資料集：訪客 401(meta.json 公開)，登入後可以下載；簽章不對的 cookie 視同訪客', async () => {
  const ds = F.ACCESS.memberDatasets[0];
  let r = await call(F.dataMw, req(`/data/${ds}/x.json`));
  assert.equal(r.res.status, 401);
  r = await call(F.dataMw, req(`/data/${ds}/meta.json`));
  assert.equal(r.passed, true);
  r = await call(F.dataMw, req(`/data/${ds}/x.json`, { Cookie: await memberCookie() }));
  assert.equal(r.passed, true);
  const forged = (await memberCookie()).replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
  r = await call(F.dataMw, req(`/data/${ds}/x.json`, { Cookie: forged }));
  assert.equal(r.res.status, 401);
  r = await call(F.dataMw, req('/data/indices/TAIEX.json'));
  assert.equal(r.passed, true);
});
