/* /api/admin/*：只允許管理員(users.role = 'admin') */
import { isAdmin } from '../../_lib/auth';
import { json, type Env, type Data } from '../../_lib/types';

export const onRequest: PagesFunction<Env, string, Data> = async ({ env, data, next }) => {
  const id = data.identity;
  if (id.kind !== 'member') return json({ error: 'login_required' }, 401);
  if (!await isAdmin(env, id.uid)) return json({ error: 'forbidden' }, 403);
  return next();
};
