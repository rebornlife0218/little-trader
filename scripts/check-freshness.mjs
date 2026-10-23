// 本機排程的資料有沒有停更(.github/workflows/check-local.yml 每天呼叫)：node scripts/check-freshness.mjs <data 分支的目錄>
//   - 本機資料集(pipeline/run_local.py：週一~五 23:45、週二~六 12:15)：meta.json 的 updated_at 超過 MAX_HOURS 小時沒更新
//   - 股票查詢(Cloudflare D1 的 meta.last_date)：比台股策略的資料日期(tw_strategy 的 asof)舊，代表股價同步停了；
//     有 CLOUDFLARE_API_TOKEN 才檢查(用 wrangler 查 D1)
// 有問題就印出 ::error:: 並以失敗結束 → GitHub 寄信通知
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_HOURS = 20;   // 檢查時間是台北 14:00：當天 12:15 那次沒跑還在容許範圍，前一晚 23:45 也沒跑才通知
const LOCAL = ['tw_strategy', 'disposition', 'etf_compare'];
const dir = process.argv[2];
if (!dir) throw new Error('用法：node scripts/check-freshness.mjs <data 分支的目錄>');

const problems = [], warnings = [], lines = [];
const taipei = s => new Date(s.replace(' ', 'T') + ':00+08:00');   // updated_at 是台北時間 'YYYY-MM-DD HH:MM'
const meta = {};
for (const ds of LOCAL) {
  const f = join(dir, ds, 'meta.json');
  if (!existsSync(f)) { problems.push(`${ds}：data 分支沒有 meta.json`); continue; }
  meta[ds] = JSON.parse(readFileSync(f, 'utf8'));
  const hours = (Date.now() - taipei(meta[ds].updated_at)) / 3600e3;
  lines.push(`| ${ds} | ${meta[ds].updated_at} | ${hours.toFixed(1)} 小時前 |`);
  if (!(hours <= MAX_HOURS)) problems.push(`${ds}：最後更新 ${meta[ds].updated_at}(${hours.toFixed(0)} 小時前)，超過 ${MAX_HOURS} 小時`);
}

if (process.env.CLOUDFLARE_API_TOKEN) {
  try {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'little-trader', '--remote', '--json', '--command', "SELECT v FROM meta WHERE k = 'last_date'"],
                             { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const last = JSON.parse(out)[0].results[0]?.v;
    const asof = meta.tw_strategy?.asof;
    lines.push(`| 股票查詢(D1) | 資料到 ${last} | 台股策略資料到 ${asof} |`);
    if (!last || (asof && last < asof)) problems.push(`股票查詢：D1 的股價只到 ${last}，比台股策略的 ${asof} 舊(price_query 同步沒跑或失敗)`);
  } catch (e) {
    // 查不到(例如 Cloudflare 金鑰沒有 D1 的讀取權限)只提醒，不算停更
    warnings.push(`股票查詢：查不到 D1 的 last_date，略過這項檢查(${String(e.message).split('\n')[0]})`);
  }
}

const summary = ['### 本機排程檢查', '', '| 資料 | 最後更新 | |', '|---|---|---|', ...lines, '',
  problems.length ? `**有 ${problems.length} 個問題**：\n${problems.map(p => `- ${p}`).join('\n')}\n\n請檢查電腦是否開機、工作排程器「LittleTrader_local」與記錄檔 ~/.cache/little-trader/local.log。` : '全部正常。'].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
for (const w of warnings) console.log(`::warning::${w}`);
for (const p of problems) console.log(`::error::${p}`);
process.exit(problems.length ? 1 : 0);
