// 研究的 IG 圖卡(本機執行，不上傳)：node scripts/share/make-share.mjs [主題 key …]
//   IG/<研究名稱>/1～5.png  1080×1350，5 張：門面、戳痛點、重點 1、重點 2、邀請卡；內容在 ig-topics.mjs、版面在 ig-card.mjs
// 不加參數 = 全部主題。需要 Chrome。做法：用 wrangler 在本機開網站(圖卡要用網站的 LOGO 與樣式)，headless Chrome 截圖
// (研究報告的分享改用網站上的「分享」按鈕產生連結，見 functions/api/share.ts)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOPICS } from './ig-topics.mjs';
import { cardsHtml } from './ig-card.mjs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const only = process.argv.slice(2);
const topics = TOPICS.filter(t => !only.length || only.includes(t.key));
const PORT = 8793, BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'lt-share-'));
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
const until = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await ev(expr)) return true; await sleep(250); } return false; };
await send('Page.enable');

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
  for (const t of topics) await ig(t);
} finally {
  ws.close(); cleanup();
}
process.exit(0);
