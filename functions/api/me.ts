/* GET /api/me：目前身分、可載入的會員程式(網頁依此決定顯示哪些區塊) */
import { isAdmin } from '../_lib/auth';
import { ACCESS, json, type Env, type Data } from '../_lib/types';

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ env, data }) => {
  const id = data.identity;
  const admin = id.kind === 'member' && await isAdmin(env, id.uid);
  return json({
    kind: id.kind,
    email: id.kind === 'member' ? id.email : null,
    admin,
    loginReady: !!(env.FIREBASE_PROJECT_ID && env.SESSION_SECRET && env.DB),
    memberSections: ACCESS.memberSections,
    scripts: id.kind === 'member' ? [...ACCESS.memberScripts, ...(admin ? ACCESS.adminScripts : [])] : [],
  });
};
