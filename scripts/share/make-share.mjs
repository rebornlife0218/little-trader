// 研究的分享素材(本機執行，不上傳)：node scripts/share/make-share.mjs [--pdf] [--ig] [主題 key …]
//   PDF/<研究名稱>.pdf    研究報告的 PDF(網站上的報告印出來；浮水印在頁首頁尾、每張圖的正下方、一句話結論框內)
//   IG/<研究名稱>/1～5.png  給 IG 的圖卡(1080×1350，5 張：門面、戳痛點、重點 1、重點 2、邀請卡；內容在 ig-topics.mjs)
// 都不加參數 = 兩種都做、全部主題。需要：本機 web/data/ 有各研究的資料(run_local.py 產生)、.dev.vars 的 SESSION_SECRET、Chrome
// 做法：用 wrangler 在本機開網站(含 functions)，以本機金鑰簽一個會員 cookie，headless Chrome 打開各研究頁面印成 PDF、截圖圖卡
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { TOPICS } from './ig-topics.mjs';
import { cardsHtml } from './ig-card.mjs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const want = { pdf: args.includes('--pdf') || !args.includes('--ig'), ig: args.includes('--ig') || !args.includes('--pdf') };
const only = args.filter(a => !a.startsWith('--'));
const topics = TOPICS.filter(t => !only.length || only.includes(t.key));
const PORT = 8793, BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 本機網站與會員 cookie ----------
const secret = (readFileSync(join(ROOT, '.dev.vars'), 'utf8').match(/^SESSION_SECRET\s*=\s*"?([^"\r\n]+)"?/m) || [])[1];
if (!secret) throw new Error('.dev.vars 沒有 SESSION_SECRET');
const tmp = mkdtempSync(join(tmpdir(), 'lt-share-'));
writeFileSync(join(tmp, 'entry.ts'), `export { sessionCookie } from '${ROOT}functions/_lib/auth';`);
await build({ entryPoints: [join(tmp, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'auth.mjs'), logLevel: 'error' });
const { sessionCookie } = await import(pathToFileURL(join(tmp, 'auth.mjs')).href);
const cookie = (await sessionCookie(secret, 'local-share', 'share@local')).split(';')[0].split('=');

const server = spawn(process.execPath, [join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'dev', 'web', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('wrangler 啟動逾時')), 120000);
  server.stdout.on('data', d => { if (/Ready on/.test(d)) { clearTimeout(t); ok(); } });
});
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9350', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${join(tmp, 'chrome')}`, 'about:blank']);
const cleanup = () => { try { chrome.kill(); } catch (e) {} try { server.kill(); } catch (e) {} try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
process.on('exit', cleanup);
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try { const t = (await (await fetch('http://127.0.0.1:9350/json')).json()).find(x => x.type === 'page'); ws = new WebSocket(t.webSocketDebuggerUrl); } catch (e) { await sleep(250); }
}
await new Promise(r => ws.onopen = r);
let id = 0; const wait = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (wait.has(m.id)) { wait.get(m.id)(m.result || m.error); wait.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Network.enable');
await send('Network.setCookie', { name: cookie[0], value: cookie.slice(1).join('='), url: BASE });
await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('lt.guest','1'); localStorage.setItem('lt.theme','light'); } catch (e) {}" });
const until = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await ev(expr)) return true; await sleep(250); } return false; };

// ---------- PDF ----------
const logo = 'data:image/svg+xml;base64,' + readFileSync(join(ROOT, 'web/assets/img/logo.svg')).toString('base64');
const today = new Date().toISOString().slice(0, 10);
const PRINT_CSS = `
  .sidebar, .topbar, .scroll-btns, footer.copy, .crumbs, .welcome-mask, .paramgrid, .btnrow-l, .lt-hide { display:none !important; }
  .shell, .main { display:block !important; } #content { max-width:none !important; padding:0 !important; }
  .panel { box-shadow:none !important; } h3, h4 { break-after:avoid; } tr, figure, svg, .doc blockquote { break-inside:avoid; }
  body { background:#fff !important; }
  .doc blockquote { position:relative; padding-bottom:22px; }
  .lt-wm { text-align:right; font-size:8px; line-height:1; margin:2px 4px 0 0; color:#9aa1ab; font-family:Inter, sans-serif; }
  .doc blockquote .lt-wm { position:absolute; right:12px; bottom:7px; margin:0; }`;
// 只留報告：有「研究報告」區塊就只印那一塊；沒有的研究(內容直接寫在頁面上)印整頁、藏起操作元件
const PREPARE = `(() => {
  const st = document.createElement('style'); st.textContent = ${JSON.stringify(PRINT_CSS)}; document.head.appendChild(st);
  const panels = [...document.querySelectorAll('#content .panel')];
  const rep = panels.find(p => (p.querySelector(':scope > h3') || {}).textContent?.startsWith('研究報告'));
  if (rep) { panels.forEach(p => { if (p !== rep) p.classList.add('lt-hide'); }); rep.querySelector(':scope > h3')?.classList.add('lt-hide'); }
  const hero = document.querySelector('.lt-hero blockquote');   // 網頁上搬到最上方的一句話結論，放回報告開頭
  if (hero && rep) { rep.querySelector('.doc').prepend(hero); document.querySelector('.lt-hero').remove(); }
  const root = rep || document.getElementById('content');
  const boxes = new Set([...root.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 120).map(s => s.closest('[id], figure, .twr-fig') || s.parentElement));
  boxes.forEach(b => b.insertAdjacentHTML('afterend', '<div class="lt-wm">Little Trader</div>'));
  root.querySelectorAll('.doc blockquote').forEach(q => q.insertAdjacentHTML('beforeend', '<div class="lt-wm">Little Trader</div>'));
  return !!root; })()`;
async function pdf(t) {
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + t.path });
  if (!await until("!!document.querySelector('#content .doc') && !document.querySelector('#content .page-loading')")) throw new Error(`${t.name}：頁面載入逾時`);
  await sleep(2500);   // 圖表畫完
  await ev(PREPARE); await sleep(800);
  const r = await send('Page.printToPDF', {
    paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.55, marginBottom: 0.55, marginLeft: 0.45, marginRight: 0.45, printBackground: true, displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-size:8px;color:#9aa1ab;padding:0 0.45in;display:flex;justify-content:space-between;font-family:'Microsoft JhengHei',sans-serif;">
      <span>${t.section} · ${t.name}</span><span><img src="${logo}" style="width:10px;height:10px;vertical-align:-2px;opacity:.8"> Little Trader</span></div>`,
    footerTemplate: `<div style="width:100%;font-size:7.5px;color:#9aa1ab;padding:0 0.45in;display:flex;justify-content:space-between;font-family:'Microsoft JhengHei',sans-serif;">
      <span>little-trader.pages.dev · ${today} · 內容僅供研究參考，不構成投資建議</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  mkdirSync(join(ROOT, 'PDF'), { recursive: true });
  const f = join(ROOT, 'PDF', `${t.name}.pdf`);
  writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log(`PDF  ${t.name}.pdf  ${(Buffer.from(r.data, 'base64').length / 1024).toFixed(0)} KB`);
}

// ---------- IG 圖卡 ----------
async function ig(t) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1350, deviceScaleFactor: 1, mobile: false });
  // 先開本機網站上的 CSS 檔(同源、不會執行網站程式)，再把整頁換成圖卡，圖卡裡的 LOGO 與樣式才載入得到
  await send('Page.navigate', { url: BASE + 'assets/css/layout.css' });
  await sleep(500);
  const { frameTree } = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: cardsHtml(t, BASE) });
  await until("document.fonts && document.fonts.status === 'loaded' && [...document.images].every(i => i.complete)");
  await sleep(500);
  const dir = join(ROOT, 'IG', t.name);
  mkdirSync(dir, { recursive: true });
  const n = await ev("document.querySelectorAll('.card').length");
  for (let i = 0; i < n; i++) {
    const b = await ev(`(() => { const r = document.querySelectorAll('.card')[${i}].getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
    writeFileSync(join(dir, `${i + 1}.png`), Buffer.from(s.data, 'base64'));
  }
  console.log(`IG   ${t.name}/  ${n} 張`);
}

try {
  for (const t of topics) {
    if (want.pdf) await pdf(t);
    if (want.ig) await ig(t);
  }
} finally {
  ws.close(); cleanup();
}
process.exit(0);
