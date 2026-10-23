/* GET /api/symbols：可查詢的股票清單(代號、名稱、資料期間、是否已下市櫃、市場、股本)
   整份清單由 sync.py 存成 meta 的一列(symbols_gz：gzip＋base64)，每次只讀 1 列；還沒有這一列時才讀整張 symbols 表 */
import { json, type Env, type Data } from '../_lib/types';

async function gunzipText(b64: string) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))).text();
}

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  const { results } = await env.DB.prepare("SELECT k, v FROM meta WHERE k IN ('last_date', 'symbols_gz')").all<{ k: string; v: string }>();
  const meta = Object.fromEntries(results.map(r => [r.k, r.v]));
  const symbols = meta.symbols_gz
    ? JSON.parse(await gunzipText(meta.symbols_gz))
    : (await env.DB.prepare('SELECT symbol, name, first_date, last_date, delisted, market, capital FROM symbols ORDER BY symbol').all()).results;
  return json({ last_date: meta.last_date ?? null, symbols }, 200, { 'Cache-Control': 'private, max-age=3600' });
};
