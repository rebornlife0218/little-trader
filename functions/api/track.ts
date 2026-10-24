/* POST api/track {section, page, title, locked, path}：網頁的瀏覽紀錄(後台的「最受歡迎的主題」)
   換頁時 path 為空；頁面裡切換分頁、下拉選單時 path = 最多三層的名稱(例如 ['ETF研究', '主動式ETF', 'A 系列 ETF 跟單'])
   只收本站的區塊與頁面格式；有自己的每分鐘上限(security.ts 的 PER_MINUTE_TRACK)，不佔一般 API 的額度 */
import { json, type Env, type Data } from '../_lib/types';

const KEY = /^[a-z0-9_-]{1,40}$/;
const label = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data, waitUntil }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  let b: { section?: unknown; page?: unknown; title?: unknown; locked?: unknown; path?: unknown } = {};
  try { b = await request.json(); } catch { /* 下面一起檢查 */ }
  const section = String(b.section ?? ''), page = String(b.page ?? '');
  if (!KEY.test(section) || (page && !KEY.test(page))) return json({ error: 'bad_request' }, 400);
  const path = (Array.isArray(b.path) ? b.path : []).slice(0, 3).map(label).filter(Boolean);
  const id = data.identity;
  waitUntil(env.DB.prepare('INSERT INTO page_views (kind, subject, section, page, title, locked, l1, l2, l3) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(id.kind, id.kind === 'member' ? id.uid : id.gid, section, page, label(b.title) || null, b.locked ? 1 : 0,
          path[0] ?? null, path[1] ?? null, path[2] ?? null)
    .run().catch(e => console.error('track failed', e)));
  // 透過分享連結(/s/<代碼>，lt_ref cookie)進來的會員，看到那份報告的頁面時記一筆(分享的人自己看不算)
  const ref = (request.headers.get('Cookie') ?? '').match(/(?:^|;\s*)lt_ref=([A-Za-z0-9]{8})(?:;|$)/)?.[1];
  if (ref && id.kind === 'member' && !path.length) {
    waitUntil(env.DB.prepare(`
      INSERT INTO share_views (code, uid)
      SELECT code, ?2 FROM share_links WHERE code = ?1 AND uid <> ?2 AND (path = ?3 OR path LIKE ?3 || '/%')
      ON CONFLICT (code, uid) DO UPDATE SET n = n + 1, last_at = datetime('now')`)
      .bind(ref, id.uid, `${section}/${page}`)
      .run().catch(e => console.error('share view failed', e)));
  }
  return json({ ok: true });
};
