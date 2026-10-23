/* API 的資安防護：來源檢查(CORS)、安全標頭、每分鐘次數限制 */
import type { Env, Identity } from './types';

/* ---------- 來源檢查(CORS) ----------
   API 只給本站的網頁用：允許的來源寫在 wrangler.toml 的 ALLOWED_ORIGINS(逗號分隔)，絕不回 `*`。
   瀏覽器從別的網站呼叫時，帶的 Origin 不在清單內 → 直接 403(連 POST 的登入、登出也擋，順便防 CSRF)；
   沒有 Origin 的請求(同源 GET、curl 等程式)照常處理，但程式化的大量請求由下面的次數限制擋。 */
const DEFAULT_ORIGINS = ['https://little-trader.pages.dev'];
export function allowedOrigins(env: Env) {
  return env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}

// 回傳 null = 可以繼續；否則是要直接回的 Response(拒絕或 CORS 預檢)
export function checkOrigin(req: Request, env: Env): Response | null {
  const origin = req.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const site = req.headers.get('Sec-Fetch-Site');           // 瀏覽器自動帶，網頁改不了
  if ((origin && !allowed.includes(origin)) || site === 'cross-site') {
    return secure(Response.json({ error: 'forbidden_origin' }, { status: 403 }), null);
  }
  if (req.method === 'OPTIONS') {                             // CORS 預檢：只對允許的來源回應
    return secure(new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
    } }), origin);
  }
  return null;
}

// 安全標頭：所有 API 回應都加上；只有允許的來源才回 Access-Control-Allow-Origin(且是那個來源本身，不是 *)
export function secure(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  const h = out.headers;
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
  }
  h.append('Vary', 'Origin');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");   // API 只回 JSON，不該被當成網頁執行
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (!h.has('Cache-Control')) h.set('Cache-Control', 'private, no-store');
  return out;
}

/* ---------- 每分鐘次數限制(防爬蟲) ----------
   用 D1 計數：INSERT … ON CONFLICT … RETURNING 是原子操作，多台機器同時處理也算得準
   (Workers 的記憶體不共用、KV 不即時，都不適合精準計數；Pages Functions 不能直接用 Durable Objects)。
   訪客依 IP、會員依帳號，超過就回 429 與 Retry-After。 */
export const PER_MINUTE = { guest: 10, member: 60 } as const;
export const PER_MINUTE_TRACK = 30;   // 瀏覽紀錄(api/track)另外計，換頁快也不會卡到一般 API
// 需要登入的資料檔(data/<資料集>/，functions/data/_middleware.ts)：每個帳號每分鐘的下載上限，防止登入後用程式整批抓。
// 一般瀏覽一頁只載入 1～5 個檔；頁面程式(modules/)不計，因為每次開網頁會一次載入 11 支
export const PER_MINUTE_DATA = 100;

export async function rateLimit(env: Env, id: Identity, ip: string, waitUntil: (p: Promise<unknown>) => void,
                                bucket: { prefix: string; limit: number } | null = null): Promise<Response | null> {
  if (!env.DB) return null;
  const now = new Date(), minute = now.toISOString().slice(0, 16);
  const key = (bucket ? bucket.prefix + ':' : '') + (id.kind === 'member' ? 'u:' + id.uid : 'ip:' + ip);
  let row: { count: number } | null;
  try {
    row = await env.DB.prepare(
      `INSERT INTO rate_minute (rate_key, minute, count) VALUES (?1, ?2, 1)
       ON CONFLICT (rate_key, minute) DO UPDATE SET count = count + 1
       RETURNING count`).bind(key, minute).first<{ count: number }>();
  } catch (e) {
    console.error('rate limit failed', e);   // 計數出錯不擋正常使用(錯誤會留在 Cloudflare 的記錄)
    return null;
  }
  // 約 1% 的請求順手清掉 10 分鐘前的計數，資料表不會越長越大
  if (Math.random() < 0.01) {
    waitUntil(env.DB.prepare('DELETE FROM rate_minute WHERE minute < ?1')
      .bind(new Date(now.getTime() - 10 * 60e3).toISOString().slice(0, 16)).run());
  }
  const limit = bucket ? bucket.limit : PER_MINUTE[id.kind];
  if ((row?.count ?? 0) <= limit) return null;
  const retry = 60 - now.getUTCSeconds();
  return Response.json({ error: 'rate_limited', limit_per_minute: limit, retry_after: retry },
                       { status: 429, headers: { 'Retry-After': String(retry) } });
}
