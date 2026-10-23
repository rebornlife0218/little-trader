/* GET /api/admin/stats?days=7：後台統計(誰在查、熱門股票、每日請求與效能、最近的查詢、最受歡迎的主題)
   query_logs、page_views 的 ts 存 UTC，這裡都換成台北時間。
   一律排除管理員自己的紀錄：管理員帳號，以及連到管理員的訪客代號(登入前用訪客身分瀏覽的紀錄，guest_links) */
import { json, type Env, type Data } from '../../_lib/types';

const ADMINS = `(SELECT uid FROM users WHERE role = 'admin' UNION SELECT gid FROM guest_links WHERE uid IN (SELECT uid FROM users WHERE role = 'admin'))`;

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  const db = env.DB!;
  const days = Math.min(365, Math.max(1, +(new URL(request.url).searchParams.get('days') ?? 7) || 7));
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const [users, symbols, daily, recent, totals, sections, pages, lv1, lv2, lv3] = await db.batch([
    // a. 誰在查資料：每位使用者的用量
    db.prepare(`
      SELECT l.kind, COALESCE(u.email, l.subject) AS who, COUNT(*) AS n,
             COUNT(DISTINCT l.symbol) AS symbols, MAX(datetime(l.ts, '+8 hours')) AS last
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 AND l.subject NOT IN ${ADMINS} GROUP BY l.kind, l.subject ORDER BY n DESC LIMIT 50`).bind(since),
    // b. 熱門股票排行
    db.prepare(`
      SELECT l.symbol, s.name, COUNT(*) AS n, COUNT(DISTINCT l.subject) AS users,
             SUM(l.kind = 'member') AS member, SUM(l.kind = 'guest') AS guest
      FROM query_logs l LEFT JOIN symbols s ON s.symbol = l.symbol
      WHERE l.ts >= ?1 AND l.symbol IS NOT NULL AND l.status = 200 AND l.subject NOT IN ${ADMINS}
      GROUP BY l.symbol ORDER BY n DESC LIMIT 20`).bind(since),
    // c. 系統用量與效能：每天的請求數、錯誤、超過額度、平均與最慢回應
    db.prepare(`
      SELECT date(ts, '+8 hours') AS day, COUNT(*) AS n, COUNT(DISTINCT subject) AS users,
             SUM(status >= 400) AS errors, SUM(status = 429) AS throttled,
             ROUND(AVG(duration_ms)) AS avg_ms, MAX(duration_ms) AS max_ms
      FROM query_logs WHERE ts >= ?1 AND subject NOT IN ${ADMINS} GROUP BY day ORDER BY day`).bind(since),
    // 最近的查詢紀錄
    db.prepare(`
      SELECT datetime(l.ts, '+8 hours') AS ts, l.kind, COALESCE(u.email, l.subject) AS who, l.endpoint,
             l.symbol, l.range_from, l.range_to, l.status, l.duration_ms, l.ip, l.country
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 AND l.subject NOT IN ${ADMINS} ORDER BY l.ts DESC LIMIT 100`).bind(since),
    db.prepare(`
      SELECT (SELECT COUNT(*) FROM users WHERE role <> 'admin') AS members,
             (SELECT COUNT(*) FROM users WHERE role <> 'admin' AND last_seen_at >= datetime(?1)) AS active_members,
             (SELECT COUNT(*) FROM query_logs WHERE ts >= ?1 AND subject NOT IN ${ADMINS}) AS requests,
             (SELECT COUNT(DISTINCT subject) FROM query_logs WHERE ts >= ?1 AND kind = 'guest' AND subject NOT IN ${ADMINS}) AS guests,
             (SELECT COUNT(*) FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND subject NOT IN ${ADMINS}) AS views,
             (SELECT COUNT(DISTINCT subject) FROM page_views WHERE ts >= ?1 AND subject NOT IN ${ADMINS}) AS viewers`).bind(since),
    // 最受歡迎的主題(後台一層一層點開)：區塊 › 頁面 › 頁面裡的細項(分頁、下拉選單，最多三層 l1 l2 l3)
    // 區塊與頁面算「換頁」的次數(l1 為 NULL)；細項算切換到那個畫面的次數，上層的次數 = 底下所有細項加總
    // locked = 訪客點進需要登入的區塊被擋下的次數
    db.prepare(`
      SELECT section, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest, SUM(locked) AS locked
      FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND subject NOT IN ${ADMINS} GROUP BY section`).bind(since),
    db.prepare(`
      SELECT section, page, MAX(title) AS title, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest
      FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND page <> '' AND subject NOT IN ${ADMINS} GROUP BY section, page`).bind(since),
    ...['l1', 'l1, l2', 'l1, l2, l3'].map(cols => db.prepare(`
      SELECT section, page, ${cols}, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest
      FROM page_views WHERE ts >= ?1 AND ${cols.split(', ').pop()} IS NOT NULL AND subject NOT IN ${ADMINS}
      GROUP BY section, page, ${cols}`).bind(since)),
  ]);
  return json({ days, totals: totals.results[0], users: users.results, symbols: symbols.results, daily: daily.results, recent: recent.results,
                sections: sections.results, pages: pages.results, levels: [lv1.results, lv2.results, lv3.results] });
};
