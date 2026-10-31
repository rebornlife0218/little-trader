/* POST api/share {path, title}：產生研究報告的分享連結(只給登入的會員)
   同一個人分享同一份報告回傳同一個代碼；連結是 /s/<代碼>(functions/s/[code].ts)，打開的人看得到上半部，登入 Google 才看得到完整報告 */
import { json, type Env, type Data } from '../_lib/types';

// 只有研究與策略的單一內容可以分享(區塊/頁面/項目)；不公開的策略不能分享
const PATH = /^(etf|stock|option|index|stats|other)\/[a-z0-9-]{1,40}\/[a-z0-9_-]{1,40}$/;
const PRIVATE = new Set(['stock/tw-strategy/margin', 'stock/disposition/strategy']);
const label = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : '';
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   // 去掉容易看錯的 0 O 1 l I
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ABC[b % ABC.length]).join('');

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  const id = data.identity;
  if (id.kind !== 'member') return json({ error: 'login_required' }, 401);
  let b: { path?: unknown; title?: unknown } = {};
  try { b = await request.json(); } catch { /* 下面一起檢查 */ }
  const path = String(b.path ?? '');
  if (!PATH.test(path) || PRIVATE.has(path)) return json({ error: 'bad_request' }, 400);
  const db = env.DB;
  let row = await db.prepare('SELECT code FROM share_links WHERE uid = ?1 AND path = ?2').bind(id.uid, path).first<{ code: string }>();
  for (let i = 0; !row && i < 3; i++) {   // 代碼撞到既有的(機率極低)就重新產生
    const code = newCode();
    const r = await db.prepare('INSERT OR IGNORE INTO share_links (code, uid, path, title) VALUES (?1, ?2, ?3, ?4)')
      .bind(code, id.uid, path, label(b.title) || null).run();
    row = r.meta.changes ? { code } : await db.prepare('SELECT code FROM share_links WHERE uid = ?1 AND path = ?2').bind(id.uid, path).first<{ code: string }>();
  }
  if (!row) return json({ error: 'internal' }, 500);
  return json({ code: row.code, url: `${new URL(request.url).origin}/s/${row.code}` });
};
