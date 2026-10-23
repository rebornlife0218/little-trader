/* GET /api/prices?symbol=2330&from=2016-01-01&to=2026-10-22
   股價依「股票 × 年度」存成一筆 gzip 的 JSON(price_chunks，pipeline/price_query/sync.py)：查 10 年只讀約 11 列。
   回傳欄式資料 rows = {d 日期, o h l c 開高低收(原始價格), a 還原收盤價, v 成交量, f 外資, t 投信, m 融資餘額, s 融券餘額, b 借券賣出餘額}
   (單位都是張)與 events = [[日期, 種類, 說明, 結束日期]]；另附股票名稱、市場、股本(億元)。
   資料一律在後端篩選：訪客的期間先截成最近 31 天，只讀那幾年的區塊、逐日篩掉範圍外的資料才回傳 */
import { POLICY, json, taipeiDate, type Env, type Data } from '../_lib/types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Chunk = Record<string, unknown[]> & { d: string[]; ev?: [string, string, string, string | null][] };

async function gunzipJson(blob: ArrayBuffer | number[]): Promise<Chunk> {
  const bytes = blob instanceof ArrayBuffer ? new Uint8Array(blob) : Uint8Array.from(blob);
  return new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))).json();
}

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  const q = new URL(request.url).searchParams;
  const symbol = (q.get('symbol') ?? '').trim().toUpperCase();
  if (!/^[0-9A-Z]{4,6}$/.test(symbol)) return json({ error: 'bad_symbol' }, 400);

  const policy = POLICY[data.identity.kind];
  const earliest = taipeiDate(-policy.maxDays);
  const to = q.get('to') || taipeiDate();
  let from = q.get('from') || earliest;
  if (!DATE.test(from) || !DATE.test(to) || from > to) return json({ error: 'bad_range' }, 400);
  const truncated = from < earliest;            // 超出權限的期間直接截掉，並告訴網頁
  if (truncated) from = earliest;
  data.log = { symbol, from, to };

  // 每日額度：原子性 +1 並取回目前次數
  const used = (await env.DB.prepare(
    `INSERT INTO usage_daily (quota_key, day, count) VALUES (?1, ?2, 1)
     ON CONFLICT (quota_key, day) DO UPDATE SET count = count + 1
     RETURNING count`)
    .bind(data.identity.quotaKey, taipeiDate()).first<{ count: number }>())!.count;
  if (used > policy.dailyQuota) return json({ error: 'quota_exceeded', limit: policy.dailyQuota, kind: data.identity.kind }, 429);

  const [info, chunks] = await env.DB.batch([
    env.DB.prepare('SELECT name, first_date, last_date, delisted, market, capital FROM symbols WHERE symbol = ?1').bind(symbol),
    env.DB.prepare('SELECT data FROM price_chunks WHERE symbol = ?1 AND year BETWEEN ?2 AND ?3 ORDER BY year')
      .bind(symbol, +from.slice(0, 4), +to.slice(0, 4)),
  ]);
  if (!info.results.length) return json({ error: 'not_found' }, 404);

  const rows: Record<string, unknown[]> = {};
  const events: unknown[] = [];
  for (const r of chunks.results as { data: ArrayBuffer | number[] }[]) {
    const ch = await gunzipJson(r.data);
    const keys = Object.keys(ch).filter(k => k !== 'ev');
    keys.forEach(k => { rows[k] ??= []; });
    ch.d.forEach((d, i) => {
      if (d < from || d > to) return;
      keys.forEach(k => rows[k].push(ch[k][i]));
    });
    (ch.ev ?? []).forEach(e => { if ((e[3] ?? e[0]) >= from && e[0] <= to) events.push(e); });   // 處置期間只要和查詢期間重疊就給
  }
  if (!rows.d) rows.d = [];
  return json({ symbol, ...info.results[0], from, to, kind: data.identity.kind, truncated,
                remaining: Math.max(0, policy.dailyQuota - used), limit: policy.dailyQuota, rows, events });
};
