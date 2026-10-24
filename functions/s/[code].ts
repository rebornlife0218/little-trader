/* GET /s/<代碼>：打開分享連結
   記一次點開(share_links.clicks)，在瀏覽器存下是哪個分享連結(lt_ref cookie，30 天)，再轉到報告頁；
   報告在需要登入的區塊，沒登入的人會先看到登入提示，登入後看報告時由 api/track 記下是誰看的(share_views)。
   LINE、FB 的預覽會跟著轉址，抓到報告頁的標題與預覽圖 */
import type { Env } from '../_lib/types';

const CODE = /^[A-Za-z0-9]{8}$/;

export const onRequestGet: PagesFunction<Env> = async ({ params, env, request, waitUntil }) => {
  const code = String(params.code ?? '');
  const go = (to: string, cookie?: string) => {
    const h = new Headers({ Location: new URL(to, request.url).toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    if (cookie) h.append('Set-Cookie', cookie);
    return new Response(null, { status: 302, headers: h });
  };
  if (!CODE.test(code) || !env.DB) return go('/');
  const row = await env.DB.prepare('SELECT path FROM share_links WHERE code = ?1').bind(code).first<{ path: string }>();
  if (!row) return go('/');
  // 社群網站抓預覽的機器人不算點開
  const ua = request.headers.get('User-Agent') ?? '';
  if (!/bot|crawl|spider|facebookexternalhit|line-poker|preview|slurp/i.test(ua))
    waitUntil(env.DB.prepare('UPDATE share_links SET clicks = clicks + 1 WHERE code = ?1').bind(code).run().catch(e => console.error('share click failed', e)));
  return go('/' + row.path, `lt_ref=${code}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax`);
};
