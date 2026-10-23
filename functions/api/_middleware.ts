/* 所有 /api：辨識身分(會員 session 或訪客)，回應後寫一筆查詢日誌 */
import { identify } from '../_lib/auth';
import { json, type Env, type Data } from '../_lib/types';

const NO_LOG = new Set(['/api/me']);   // 每次開網頁都會呼叫，不記

export const onRequest: PagesFunction<Env, string, Data> = async (ctx) => {
  const { request, env } = ctx;
  const t0 = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const { identity, setCookie } = await identify(request, env, ip);
  ctx.data.identity = identity;
  ctx.data.ip = ip;

  let res: Response;
  try {
    res = await ctx.next();
  } catch (e) {
    console.error(e);
    res = json({ error: 'internal' }, 500);
  }

  const path = new URL(request.url).pathname;
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

  if (setCookie) {
    res = new Response(res.body, res);
    res.headers.append('Set-Cookie', setCookie);
  }
  return res;
};
