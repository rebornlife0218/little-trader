/* 後端共用：環境變數、身分、權限設定 */
import access from './access.json';

export interface Env {
  DB?: D1Database;                 // wrangler.toml 的 d1_databases
  FIREBASE_PROJECT_ID?: string;    // wrangler.toml 的 vars
  SESSION_SECRET?: string;         // 簽 cookie 用(wrangler pages secret put SESSION_SECRET)，不進 repo
  ALLOWED_ORIGINS?: string;        // 允許呼叫 API 的網頁來源(逗號分隔)，wrangler.toml 的 vars
}

export type Identity =
  | { kind: 'member'; uid: string; email: string | null; quotaKey: string }
  | { kind: 'guest'; gid: string; quotaKey: string };

export type Data = {
  identity: Identity;
  ip: string;
  log?: { symbol?: string; from?: string; to?: string };   // 端點填入，api/_middleware.ts 寫進查詢日誌
};

export const ACCESS = access as {
  memberSections: string[]; memberScripts: string[]; memberDatasets: string[]; adminScripts: string[];
};

// 股票查詢的權限：訪客最近 31 天、每天 30 次；會員不限期間(資料從 2016 年開始)、每天 1000 次
// (股票查詢頁只開放會員，訪客的限制是 API 的保險)
export const POLICY = {
  guest:  { maxDays: 31,    dailyQuota: 30 },
  member: { maxDays: 36500, dailyQuota: 1000 },
} as const;

export const taipeiDate = (offsetDays = 0) =>
  new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
