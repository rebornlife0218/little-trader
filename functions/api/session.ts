/* POST /api/session {idToken}：驗證 Firebase ID token(Google 登入)，建立會員資料並發 session cookie */
import { verifyFirebaseToken, sessionCookie } from '../_lib/auth';
import { json, type Env, type Data } from '../_lib/types';

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  if (!env.FIREBASE_PROJECT_ID || !env.SESSION_SECRET || !env.DB) return json({ error: 'not_configured' }, 503);
  let idToken: unknown;
  try { ({ idToken } = await request.json() as { idToken?: unknown }); } catch { /* 下面一起處理 */ }
  if (typeof idToken !== 'string') return json({ error: 'bad_request' }, 400);

  let p;
  try { p = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID); }
  catch { return json({ error: 'invalid_token' }, 401); }
  if ((p.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider !== 'google.com') return json({ error: 'google_only' }, 403);

  const uid = p.sub!, email = (p.email as string) ?? null;
  await env.DB.prepare(
    `INSERT INTO users (uid, email, display_name, last_seen_at) VALUES (?1, ?2, ?3, datetime('now'))
     ON CONFLICT (uid) DO UPDATE SET email = ?2, display_name = ?3, last_seen_at = datetime('now')`)
    .bind(uid, email, (p.name as string) ?? null).run();
  return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env.SESSION_SECRET, uid, email) });
};
