/* 後台統計不計入的帳號：管理員(users.role = 'admin')，以及下面這些 email(管理員自己、測試帳號)
   repo 是公開的，所以只放 email(小寫)的 SHA-256，不寫 email 本身。新增一個帳號：
     node -e "console.log(require('crypto').createHash('sha256').update('<email 小寫>').digest('hex'))" */
const HASHES = new Set([
  'af5ab0697f51ce673a41621ef325e3586cfeea286be263c7bd3af65f8eb437a3',   // 管理員
  '8610f3f913ef06b19df9c5bb8f8a2915d20d227a25f9c38183b90799a77a1a38',   // 測試帳號
]);

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const excludedEmail = async (email: string | null | undefined) => !!email && HASHES.has(await sha256hex(email.trim().toLowerCase()));

// 不計入統計的會員 uid(管理員 + 名單裡的 email)
export async function excludedUids(db: D1Database) {
  const { results } = await db.prepare('SELECT uid, email, role FROM users').all<{ uid: string; email: string | null; role: string }>();
  const out: string[] = [];
  for (const u of results) if (u.role === 'admin' || await excludedEmail(u.email)) out.push(u.uid);
  return out;
}
