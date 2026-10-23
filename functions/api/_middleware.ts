/* 所有 /api 的驗證中介層：
   1. 來源檢查(CORS)：只有 ALLOWED_ORIGINS 的網頁能從瀏覽器呼叫，其他網站一律 403
   2. 辨識身分：Bearer Firebase token 或 session cookie → 會員；都沒有 → 訪客；token 不合法 → 401
   3. 每分鐘次數限制：訪客每個 IP 10 次、會員每個帳號 60 次，超過回 429(api/me、api/logout 不計；api/track 另計 30 次)
   4. 回應後寫一筆查詢日誌，並加上安全標頭 */
import { identify } from '../_lib/auth';
import { checkOrigin, rateLimit, secure, PER_MINUTE_TRACK } from '../_lib/security';
import { json, type Env, type Data } from '../_lib/types';

const NO_LOG = new Set(['/api/me', '/api/track']);        // 每次開網頁、換頁都會呼叫，不記(瀏覽紀錄另存 page_views)
const NO_LIMIT = new Set(['/api/me', '/api/logout']);

export const onRequest: PagesFunction<Env, string, Data> = async (ctx) => {
  const { request, env } = ctx;
  const t0 = Date.now();
  const blocked = checkOrigin(request, env);
  if (blocked) return blocked;
  const origin = request.headers.get('Origin');            // checkOrigin 通過 = 沒有 Origin 或在允許清單內
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const path = new URL(request.url).pathname;
  const { identity, setCookie, invalid } = await identify(request, env, ip);
  if (invalid) return secure(json({ error: 'invalid_token' }, 401), origin);
  ctx.data.identity = identity;
  ctx.data.ip = ip;

  let res: Response | null = NO_LIMIT.has(path) ? null : await rateLimit(env, identity, ip, p => ctx.waitUntil(p),
    path === '/api/track' ? { prefix: 't', limit: PER_MINUTE_TRACK } : null);
  if (!res) {
    try {
      res = await ctx.next();
    } catch (e) {
      console.error(e);
      res = json({ error: 'internal' }, 500);
    }
  }

  if (env.DB && !NO_LOG.has(path)) {
    const log = ctx.data.log ?? {};
    // waitUntil：回應送出後才寫，不拖慢查詢
    ctx.waitUntil(env.DB.prepare(
      `INSERT INTO query_logs (kind, subject, endpoint, symbol, range_from, range_to, status, duration_ms, ip, country, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(identity.kind, identity.kind === 'member' ? identity.uid : identity.gid, path,
            log.symbol ?? null, log.from ?? null, log.to ?? null, res.status, Date.now() - t0, ip,
            (request.cf?.country as string) ?? null, request.headers.get('User-Agent')?.slice(0, 200) ?? null)
      .run().catch(e => console.error('log failed', e)));
  }

  res = secure(res, origin);
  if (setCookie) res.headers.append('Set-Cookie', setCookie);
  return res;
};
