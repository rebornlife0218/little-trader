/* modules/：會員限定區塊的網頁程式只給會員，後台程式只給管理員 */
import { readSession, isAdmin } from '../_lib/auth';
import { ACCESS, type Env } from '../_lib/types';

const MEMBER = new Set(ACCESS.memberScripts), ADMIN = new Set(ACCESS.adminScripts);
const deny = () => new Response('登入後才能查看', { status: 401, headers: { 'Cache-Control': 'no-store' } });

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const path = new URL(request.url).pathname.slice(1);   // modules/xxx/yyy.js
  if (!MEMBER.has(path) && !ADMIN.has(path)) return next();
  const s = await readSession(request, env);
  if (!s) return deny();
  if (ADMIN.has(path) && !await isAdmin(env, s.uid)) return deny();
  const res = await next();
  // 會員限定的檔案不讓 CDN 或共用快取存
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-cache');
  return out;
};
