/* data/<資料集>/：需要登入的資料集(研究與策略的完整報告)只給登入 Google 的人；
   meta.json 與精簡版 brief/(頁面上半部用，scripts/briefs.mjs 部署時產生)公開，_routes.json 也讓 brief/ 不經過這裡
   防爬蟲：每個帳號每分鐘最多下載 PER_MINUTE_DATA 個資料檔，超過回 429(頁面程式不計，見 security.ts) */
import { readSession } from '../_lib/auth';
import { rateLimit, PER_MINUTE_DATA } from '../_lib/security';
import { ACCESS, type Env } from '../_lib/types';

const MEMBER = new Set(ACCESS.memberDatasets);

export const onRequest: PagesFunction<Env> = async ({ request, env, next, waitUntil }) => {
  const [, , ds, file] = new URL(request.url).pathname.split('/');   // /data/<資料集>/<檔名>
  if (!MEMBER.has(ds) || file === 'meta.json' || file === 'brief') return next();
  const s = await readSession(request, env);
  if (!s) return new Response('登入後才能查看', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const limited = await rateLimit(env, { kind: 'member', uid: s.uid, email: s.email, quotaKey: 'u:' + s.uid }, '', waitUntil,
                                  { prefix: 'd', limit: PER_MINUTE_DATA });
  if (limited) return limited;
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');   // 需要登入的資料不讓 CDN 或共用快取存
  return out;
};
