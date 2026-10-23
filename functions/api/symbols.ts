/* GET /api/symbols：可查詢的股票清單(代號、名稱、資料期間、是否已下市櫃) */
import { json, type Env, type Data } from '../_lib/types';

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  const [list, last] = await env.DB.batch([
    env.DB.prepare('SELECT symbol, name, first_date, last_date, delisted FROM symbols ORDER BY symbol'),
    env.DB.prepare("SELECT v FROM meta WHERE k = 'last_date'"),
  ]);
  return json({ last_date: (last.results[0] as { v?: string } | undefined)?.v ?? null, symbols: list.results },
              200, { 'Cache-Control': 'private, max-age=3600' });
};
