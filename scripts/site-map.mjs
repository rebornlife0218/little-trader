// 在 Node 裡載入網站的頁面程式(假的瀏覽器環境，不連網、不畫畫面)，取得所有區塊、頁面與目錄頁的項目
//   - scripts/build-site.mjs：部署時依這份清單產生各頁的標題、說明與分享預覽(例如 stock/tw-strategy/lowvol.html)、sitemap.xml
//   - tests/：自動測試檢查每個頁面都註冊得起來、網址不重複
// 載入順序同瀏覽器：index.html 裡的 <script>(第三方套件與登入程式除外)，再加上 access.json 的會員、管理員程式
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

export const SITE = 'https://little-trader.pages.dev/';   // 主站網址(分享預覽、canonical、sitemap 用)
export const ACCESS = JSON.parse(readFileSync(new URL('../functions/_lib/access.json', import.meta.url), 'utf8'));
const SKIP = /^assets\/(vendor\/|js\/(firebase-config|auth)\.js$)/;

// 什麼都能呼叫、什麼屬性都拿得到的假物件(頁面程式載入時碰到的瀏覽器 API)
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub()),
  apply: () => stub(), construct: () => stub(),
});

export function scriptList(web) {
  const html = readFileSync(join(web, 'index.html'), 'utf8');
  const pub = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]).filter(f => !SKIP.test(f));
  return { html, pub, files: [...pub, ...ACCESS.memberScripts, ...ACCESS.adminScripts] };
}

// only: 'public' 只載入訪客拿得到的程式(index.html 裡的)
export function loadSite(web, { only } = {}) {
  const { files: all, pub } = scriptList(web);
  const files = only === 'public' ? pub : all;
  const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const el = () => ({ ...stub(), style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Map, Set, WeakMap, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Symbol, Proxy, Reflect, URL, URLSearchParams,
    Intl, Uint8Array, Float64Array, TextEncoder, TextDecoder, encodeURIComponent, decodeURIComponent, isNaN, isFinite, parseFloat, parseInt, Infinity, NaN,
    localStorage: store(), sessionStorage: store(),
    location: { pathname: '/', hash: '', search: '', origin: new URL(SITE).origin, href: SITE },
    history: { pushState() {}, replaceState() {} },
    navigator: { sendBeacon() {} },
    document: {
      baseURI: SITE, readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: el, createTreeWalker: stub, documentElement: { dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, scrollHeight: 0 }, body: el(), head: el(),
    },
    fetch: () => new Promise(() => {}), requestAnimationFrame: () => 0, requestIdleCallback: () => 0, matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }), ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    Event: class {}, Blob: class {}, NodeFilter: {}, crypto: globalThis.crypto,
    marked: stub(), katex: stub(), LTAuth: { MAIN_SITE: SITE, load: () => new Promise(() => {}), error: '' },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const errors = [];
  for (const f of files) {
    try { vm.runInContext(readFileSync(join(web, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { errors.push(`${f}：${e.message}`); }
  }
  let LT = null;
  try { LT = vm.runInContext('LT', ctx); } catch (e) { errors.push(`找不到 LT：${e.message}`); }
  return { LT, files, errors, sections: LT ? LT.SECTIONS : [], pages: LT ? LT.listPages() : [] };
}

// 每個有自己網址的頁面：{ path, title, desc }(側欄頁面、目錄頁的單一內容、頁面註冊的 routes，例如統計學的各章)
export function routes(site) {
  const out = [];
  for (const p of site.pages) {
    if (p.href || !p.mount || p.redirect || p.hidden) continue;
    const sec = site.sections.find(s => s.key === p.section);
    const base = `${p.section}/${p.key}`;
    out.push({ path: base, title: p.catalog ? p.catalog.title || p.name : p.name, desc: (p.catalog && p.catalog.desc) || p.desc || sec.desc });
    if (p.catalog) for (const g of p.catalog.groups) for (const it of g.items) {
      if (!it.soon) out.push({ path: `${base}/${it.key}`, title: it.name, desc: it.desc || p.catalog.desc || sec.desc });
    }
    for (const r of p.routes || []) out.push({ path: `${base}/${r.path}`, title: r.name, desc: r.desc || sec.desc });
  }
  return out;
}
