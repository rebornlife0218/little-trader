/* data/<資料集>/：會員限定的資料集只給登入的會員(meta.json 公開，首頁頁尾要列更新時間) */
import { readSession } from '../_lib/auth';
import { ACCESS, type Env } from '../_lib/types';

const MEMBER = new Set(ACCESS.memberDatasets);

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const [, , ds, file] = new URL(request.url).pathname.split('/');   // /data/<資料集>/<檔名>
  if (!MEMBER.has(ds) || file === 'meta.json') return next();
  if (!await readSession(request, env)) return new Response('登入後才能查看', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');   // 會員限定的資料不讓 CDN 或共用快取存
  return out;
};
