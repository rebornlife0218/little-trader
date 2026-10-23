/* GET /api/admin/stats?days=7：後台統計(誰在查、熱門股票、每日請求與效能、最近的查詢)
   query_logs.ts 存 UTC，這裡都換成台北時間 */
import { json, type Env, type Data } from '../../_lib/types';

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  const db = env.DB!;
  const days = Math.min(365, Math.max(1, +(new URL(request.url).searchParams.get('days') ?? 7) || 7));
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const [users, symbols, daily, recent, totals, pages, sections] = await db.batch([
    // a. 誰在查資料：每位使用者的用量
    db.prepare(`
      SELECT l.kind, COALESCE(u.email, l.subject) AS who, COUNT(*) AS n,
             COUNT(DISTINCT l.symbol) AS symbols, MAX(datetime(l.ts, '+8 hours')) AS last
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 GROUP BY l.kind, l.subject ORDER BY n DESC LIMIT 50`).bind(since),
    // b. 熱門股票排行
    db.prepare(`
      SELECT l.symbol, s.name, COUNT(*) AS n, COUNT(DISTINCT l.subject) AS users,
             SUM(l.kind = 'member') AS member, SUM(l.kind = 'guest') AS guest
      FROM query_logs l LEFT JOIN symbols s ON s.symbol = l.symbol
      WHERE l.ts >= ?1 AND l.symbol IS NOT NULL AND l.status = 200
      GROUP BY l.symbol ORDER BY n DESC LIMIT 20`).bind(since),
    // c. 系統用量與效能：每天的請求數、錯誤、超過額度、平均與最慢回應
    db.prepare(`
      SELECT date(ts, '+8 hours') AS day, COUNT(*) AS n, COUNT(DISTINCT subject) AS users,
             SUM(status >= 400) AS errors, SUM(status = 429) AS throttled,
             ROUND(AVG(duration_ms)) AS avg_ms, MAX(duration_ms) AS max_ms
      FROM query_logs WHERE ts >= ?1 GROUP BY day ORDER BY day`).bind(since),
    // 最近的查詢紀錄
    db.prepare(`
      SELECT datetime(l.ts, '+8 hours') AS ts, l.kind, COALESCE(u.email, l.subject) AS who, l.endpoint,
             l.symbol, l.range_from, l.range_to, l.status, l.duration_ms, l.ip, l.country
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 ORDER BY l.ts DESC LIMIT 100`).bind(since),
    db.prepare(`
      SELECT (SELECT COUNT(*) FROM users) AS members,
             (SELECT COUNT(*) FROM users WHERE last_seen_at >= datetime(?1)) AS active_members,
             (SELECT COUNT(*) FROM query_logs WHERE ts >= ?1) AS requests,
             (SELECT COUNT(DISTINCT subject) FROM query_logs WHERE ts >= ?1 AND kind = 'guest') AS guests,
             (SELECT COUNT(*) FROM page_views WHERE ts >= ?1) AS views,
             (SELECT COUNT(DISTINCT subject) FROM page_views WHERE ts >= ?1) AS viewers`).bind(since),
    // 最受歡迎的主題：各頁面的瀏覽次數、不重複瀏覽人數(登入 Google / 訪客)；locked = 訪客點進需要登入的區塊
    db.prepare(`
      SELECT section, page, MAX(title) AS title, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest, MAX(locked) AS locked
      FROM page_views WHERE ts >= ?1 AND section <> 'home'
      GROUP BY section, page ORDER BY n DESC LIMIT 30`).bind(since),
    db.prepare(`
      SELECT section, COUNT(*) AS n, COUNT(DISTINCT subject) AS people, SUM(locked) AS locked
      FROM page_views WHERE ts >= ?1 GROUP BY section ORDER BY n DESC`).bind(since),
  ]);
  return json({ days, totals: totals.results[0], users: users.results, symbols: symbols.results, daily: daily.results, recent: recent.results,
                pages: pages.results, sections: sections.results });
};
