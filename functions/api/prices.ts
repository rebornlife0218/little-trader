/* GET /api/prices?symbol=2330&from=2016-01-01&to=2026-10-22
   股價依「股票 × 年度」存成一筆 gzip 的 JSON(price_chunks)：查 10 年只讀約 11 列，不會用掉 D1 的讀取額度。
   回傳欄式資料 rows = {d 日期, o h l c 開高低收(原始價格), a 還原收盤價(含除權息), v 成交量(張)} */
import { POLICY, json, taipeiDate, type Env, type Data } from '../_lib/types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Chunk = { d: string[]; o: number[]; h: number[]; l: number[]; c: number[]; a: number[]; v: number[] };
const COLS = ['d', 'o', 'h', 'l', 'c', 'a', 'v'] as const;

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
    env.DB.prepare('SELECT name, first_date, last_date, delisted FROM symbols WHERE symbol = ?1').bind(symbol),
    env.DB.prepare('SELECT data FROM price_chunks WHERE symbol = ?1 AND year BETWEEN ?2 AND ?3 ORDER BY year')
      .bind(symbol, +from.slice(0, 4), +to.slice(0, 4)),
  ]);
  if (!info.results.length) return json({ error: 'not_found' }, 404);

  const rows: Chunk = { d: [], o: [], h: [], l: [], c: [], a: [], v: [] };
  for (const r of chunks.results as { data: ArrayBuffer | number[] }[]) {
    const ch = await gunzipJson(r.data);
    ch.d.forEach((d, i) => {
      if (d < from || d > to) return;
      COLS.forEach(k => (rows[k] as unknown[]).push(ch[k][i]));
    });
  }
  return json({ symbol, ...info.results[0], from, to, kind: data.identity.kind, truncated,
                remaining: Math.max(0, policy.dailyQuota - used), limit: policy.dailyQuota, rows });
};
