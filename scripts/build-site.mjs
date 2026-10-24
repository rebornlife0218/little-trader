// 部署前處理(.github/workflows/deploy.yml 呼叫)：node scripts/build-site.mjs <網站目錄> <公開版目錄> [公開版的根目錄，例如 /little-trader/]
//   1. <網站目錄>/_routes.json：只有 api/、分享連結 s/ 與會員限定的程式、資料經過 functions/ 檢查，其他靜態檔直接送出(省 Functions 用量)
//   2. 各頁面的 HTML(例如 stock/tw-strategy/lowvol.html)：內容同 index.html，只換標題、說明與分享預覽(LINE、FB、搜尋引擎看得到)；
//      清單來自頁面程式(scripts/site-map.mjs)。沒有列出的網址(例如 stock/query/2330)由 Cloudflare Pages 回傳 index.html
//   3. sitemap.xml、robots.txt
//   4. <公開版目錄>：給 GitHub Pages 備援站(沒有後端、不能登入)，拿掉會員限定的程式與資料(meta.json 保留)；
//      網站放在子目錄，<base href> 改成子目錄；另外複製一份 404.html，讓沒有列出的網址也能開
// 權限清單都來自 functions/_lib/access.json
import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ACCESS as A, SITE, loadSite, routes } from './site-map.mjs';

const [site, pub, pubBase = '/'] = process.argv.slice(2);
if (!site || !pub) throw new Error('用法：node scripts/build-site.mjs <網站目錄> <公開版目錄> [公開版的根目錄]');
const scripts = [...A.memberScripts, ...A.adminScripts];

const routesJson = { version: 1, include: ['/api/*', '/s/*', ...scripts.map(p => '/' + p), ...A.memberDatasets.map(d => `/data/${d}/*`)], exclude: [] };
writeFileSync(join(site, '_routes.json'), JSON.stringify(routesJson, null, 2));
console.log(`_routes.json：${routesJson.include.length} 條路徑經過 functions`);

// ---------- 各頁面的 HTML ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tpl = readFileSync(join(site, 'index.html'), 'utf8');
function setMeta(html, re, value, what) {
  if (!re.test(html)) throw new Error(`index.html 找不到 ${what}，請檢查 scripts/build-site.mjs`);
  return html.replace(re, (m, a, b) => a + esc(value) + b);
}
function pageHtml(r) {
  const title = `${r.title} · Little Trader`, url = SITE + r.path;
  let h = tpl;
  h = setMeta(h, /(<title>)[^<]*(<\/title>)/, title, '<title>');
  h = setMeta(h, /(<meta name="description" content=")[^"]*(")/, r.desc, 'description');
  h = setMeta(h, /(<link rel="canonical" href=")[^"]*(")/, url, 'canonical');
  h = setMeta(h, /(<meta property="og:title" content=")[^"]*(")/, title, 'og:title');
  h = setMeta(h, /(<meta property="og:description" content=")[^"]*(")/, r.desc, 'og:description');
  h = setMeta(h, /(<meta property="og:url" content=")[^"]*(")/, url, 'og:url');
  return h;
}
const S = loadSite(site);
if (S.errors.length) throw new Error('頁面程式載入失敗：\n' + S.errors.join('\n'));
const R = routes(S);
const RESERVED = new Set(['api', 'assets', 'content', 'data', 'modules']);
for (const r of R) {
  if (RESERVED.has(r.path.split('/')[0])) throw new Error(`網址和網站的資料夾撞名：${r.path}`);
  const f = join(site, r.path + '.html');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, pageHtml(r));
}
console.log(`產生 ${R.length} 個頁面的 HTML(標題、說明、分享預覽)`);
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', ...R.map(r => r.path)].map(p => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(site, 'robots.txt'), `User-agent: *\nDisallow: /api/\nSitemap: ${SITE}sitemap.xml\n`);

// ---------- GitHub Pages 備援站(公開版) ----------
rmSync(pub, { recursive: true, force: true });
cpSync(site, pub, { recursive: true });
for (const f of ['_routes.json', 'sitemap.xml', 'robots.txt']) rmSync(join(pub, f), { force: true });
let removed = 0;
for (const p of scripts) if (existsSync(join(pub, p))) { rmSync(join(pub, p)); removed++; }
for (const d of A.memberDatasets) {
  const dir = join(pub, 'data', d);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f !== 'meta.json') { rmSync(join(dir, f), { recursive: true }); removed++; }
}
console.log(`公開版：拿掉 ${removed} 個會員限定的檔案`);
const rebase = f => {
  const h = readFileSync(f, 'utf8');
  if (!h.includes('<base href="/">')) throw new Error(`${f} 沒有 <base href="/">`);
  writeFileSync(f, h.replace('<base href="/">', `<base href="${esc(pubBase)}">`));
};
cpSync(join(pub, 'index.html'), join(pub, '404.html'));
for (const f of ['index.html', '404.html', ...R.map(r => r.path + '.html')]) rebase(join(pub, f));
console.log(`公開版：根目錄 ${pubBase}`);
