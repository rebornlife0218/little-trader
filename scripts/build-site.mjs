// 部署前處理(.github/workflows/deploy.yml 呼叫)：node scripts/build-site.mjs <網站目錄> <公開版目錄>
//   1. <網站目錄>/_routes.json：只有 api/ 與會員限定的程式、資料經過 functions/ 檢查，其他靜態檔直接送出(省 Functions 用量)
//   2. <公開版目錄>：給 GitHub Pages 備援站(沒有後端、不能登入)，拿掉會員限定的程式與資料(meta.json 保留)
// 權限清單都來自 functions/_lib/access.json
import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [site, pub] = process.argv.slice(2);
if (!site || !pub) throw new Error('用法：node scripts/build-site.mjs <網站目錄> <公開版目錄>');
const A = JSON.parse(readFileSync(new URL('../functions/_lib/access.json', import.meta.url), 'utf8'));
const scripts = [...A.memberScripts, ...A.adminScripts];

const routes = { version: 1, include: ['/api/*', ...scripts.map(p => '/' + p), ...A.memberDatasets.map(d => `/data/${d}/*`)], exclude: [] };
writeFileSync(join(site, '_routes.json'), JSON.stringify(routes, null, 2));
console.log(`_routes.json：${routes.include.length} 條路徑經過 functions`);

rmSync(pub, { recursive: true, force: true });
cpSync(site, pub, { recursive: true });
rmSync(join(pub, '_routes.json'), { force: true });
let removed = 0;
for (const p of scripts) if (existsSync(join(pub, p))) { rmSync(join(pub, p)); removed++; }
for (const d of A.memberDatasets) {
  const dir = join(pub, 'data', d);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f !== 'meta.json') { rmSync(join(dir, f), { recursive: true }); removed++; }
}
console.log(`公開版：拿掉 ${removed} 個會員限定的檔案`);
