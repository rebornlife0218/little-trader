/* POST api/track {section, page, title, locked}：網頁每次換頁送一筆瀏覽紀錄(後台的「最受歡迎的主題」)
   只收本站的區塊與頁面格式；有自己的每分鐘上限(security.ts 的 PER_MINUTE_TRACK)，不佔一般 API 的額度 */
import { json, type Env, type Data } from '../_lib/types';

const KEY = /^[a-z0-9_-]{1,40}$/;

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data, waitUntil }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  let b: { section?: unknown; page?: unknown; title?: unknown; locked?: unknown } = {};
  try { b = await request.json(); } catch { /* 下面一起檢查 */ }
  const section = String(b.section ?? ''), page = String(b.page ?? '');
  if (!KEY.test(section) || (page && !KEY.test(page))) return json({ error: 'bad_request' }, 400);
  const id = data.identity;
  waitUntil(env.DB.prepare('INSERT INTO page_views (kind, subject, section, page, title, locked) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id.kind, id.kind === 'member' ? id.uid : id.gid, section, page, String(b.title ?? '').slice(0, 60) || null, b.locked ? 1 : 0)
    .run().catch(e => console.error('track failed', e)));
  return json({ ok: true });
};
