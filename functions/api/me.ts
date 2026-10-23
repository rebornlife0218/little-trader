/* GET /api/me：目前身分、可載入的會員程式(網頁依此決定顯示哪些區塊) */
import { isAdmin, guestIdOf } from '../_lib/auth';
import { ACCESS, json, type Env, type Data } from '../_lib/types';

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env, data, waitUntil }) => {
  const id = data.identity;
  const admin = id.kind === 'member' && await isAdmin(env, id.uid);
  // 登入的人：記下這個瀏覽器的訪客代號屬於誰(後台排除管理員時，連登入前的訪客紀錄一起排除)；已記過就不再寫入
  if (id.kind === 'member' && env.DB) {
    const gid = await guestIdOf(request, env);
    if (gid) waitUntil(env.DB.prepare('INSERT OR IGNORE INTO guest_links (gid, uid) VALUES (?1, ?2)').bind(gid, id.uid).run().catch(() => {}));
  }
  return json({
    kind: id.kind,
    email: id.kind === 'member' ? id.email : null,
    admin,
    loginReady: !!(env.FIREBASE_PROJECT_ID && env.SESSION_SECRET && env.DB),
    memberSections: ACCESS.memberSections,
    scripts: id.kind === 'member' ? [...ACCESS.memberScripts, ...(admin ? ACCESS.adminScripts : [])] : [],
  });
};
