/* POST /api/logout：清除 session cookie */
import { clearSessionCookie } from '../_lib/auth';
import { json, type Env } from '../_lib/types';

export const onRequestPost: PagesFunction<Env> = async () => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie });
