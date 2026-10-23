/* 身分驗證：Firebase ID token(登入時驗一次)→ 本站簽發的 session cookie；訪客用另一個簽章 cookie 區分 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env, Identity } from './types';

// Firebase ID token 的公開金鑰；放在模組層，同一個 isolate 內會快取
const JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function verifyFirebaseToken(token: string, projectId: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });                                  // 同時檢查簽章、exp、iat
  if (!payload.sub) throw new Error('missing sub');
  return payload;
}

/* ---------- 簽章 cookie：值.HMAC ---------- */
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
async function unsign(secret: string, token: string): Promise<string | null> {
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const value = token.slice(0, i), expect = enc.encode(await hmac(secret, value)), got = enc.encode(token.slice(i + 1));
  return expect.byteLength === got.byteLength && crypto.subtle.timingSafeEqual(expect, got) ? value : null;
}
function getCookie(req: Request, name: string) {
  const m = (req.headers.get('Cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/* ---------- 會員 session(30 天) ---------- */
const SESSION_DAYS = 30;
type Session = { uid: string; email: string | null; exp: number };

export async function sessionCookie(secret: string, uid: string, email: string | null) {
  const value = b64url(enc.encode(JSON.stringify({ uid, email, exp: Date.now() + SESSION_DAYS * 86400e3 })));
  return cookie('lt_sess', `${value}.${await hmac(secret, value)}`, SESSION_DAYS * 86400);
}
export const clearSessionCookie = cookie('lt_sess', '', 0);

export async function readSession(req: Request, env: Env): Promise<Session | null> {
  const raw = getCookie(req, 'lt_sess');
  if (!raw || !env.SESSION_SECRET) return null;
  const value = await unsign(env.SESSION_SECRET, raw);
  if (!value) return null;
  try {
    const s = JSON.parse(unb64url(value)) as Session;
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}

/* ---------- 訪客 id(1 年)：只用來在日誌裡區分不同訪客 ---------- */
async function readGuest(req: Request, secret: string) {
  const raw = getCookie(req, 'lt_gid');
  return raw ? unsign(secret, raw) : null;
}
// 這個瀏覽器的訪客代號(沒有或簽章不對時為 null)
export async function guestIdOf(req: Request, env: Env) {
  return env.SESSION_SECRET ? readGuest(req, env.SESSION_SECRET) : null;
}
async function guestCookie(secret: string, gid: string) {
  return cookie('lt_gid', `${gid}.${await hmac(secret, gid)}`, 365 * 86400);
}

/* 驗證中介層用：辨識身分
   1. Header 有 Authorization: Bearer <Firebase ID token> → 驗證簽章與期限，合法就是會員；不合法回 invalid(由呼叫端回 401，不降級成訪客)
   2. 有效的 session cookie(網頁登入後發的)→ 會員
   3. 其他都是訪客(前端的訪客標記只控制畫面，後端不採信) */
export async function identify(req: Request, env: Env, ip: string): Promise<{ identity: Identity; setCookie: string | null; invalid?: boolean }> {
  const authz = req.headers.get('Authorization');
  if (authz?.startsWith('Bearer ')) {
    if (!env.FIREBASE_PROJECT_ID) return { identity: { kind: 'guest', gid: 'bearer', quotaKey: 'ip:' + ip }, setCookie: null, invalid: true };
    try {
      const p = await verifyFirebaseToken(authz.slice(7), env.FIREBASE_PROJECT_ID);
      return { identity: { kind: 'member', uid: p.sub!, email: (p.email as string) ?? null, quotaKey: 'u:' + p.sub }, setCookie: null };
    } catch {
      return { identity: { kind: 'guest', gid: 'bearer', quotaKey: 'ip:' + ip }, setCookie: null, invalid: true };
    }
  }
  const s = await readSession(req, env);
  if (s) return { identity: { kind: 'member', uid: s.uid, email: s.email, quotaKey: 'u:' + s.uid }, setCookie: null };
  let gid = env.SESSION_SECRET ? await readGuest(req, env.SESSION_SECRET) : null, setCookie: string | null = null;
  if (!gid) {
    gid = crypto.randomUUID();
    if (env.SESSION_SECRET) setCookie = await guestCookie(env.SESSION_SECRET, gid);
  }
  return { identity: { kind: 'guest', gid, quotaKey: 'ip:' + ip }, setCookie };   // 訪客額度綁 IP：清 cookie 也不會重置
}

export async function isAdmin(env: Env, uid: string) {
  if (!env.DB) return false;
  const row = await env.DB.prepare('SELECT role FROM users WHERE uid = ?1').bind(uid).first<{ role: string }>();
  return row?.role === 'admin';
}
