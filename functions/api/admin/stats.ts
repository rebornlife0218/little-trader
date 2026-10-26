/* GET /api/admin/stats?days=7：後台統計(誰在查、熱門股票、每日請求與效能、最近的查詢、最受歡迎的主題、登入用戶看了哪些主題、分享紀錄)
   query_logs、page_views 的 ts 存 UTC，這裡都換成台北時間。
   一律排除不計入的帳號(管理員、測試帳號，見 _lib/exclude.ts)，以及連到這些帳號的訪客代號(登入前用訪客身分瀏覽的紀錄，guest_links) */
import { json, type Env, type Data } from '../../_lib/types';
import { excludedUids } from '../../_lib/exclude';

const XU = '(SELECT value FROM json_each(?2))';   // 不計入的會員 uid(?2 = JSON 陣列)
const ADMINS = `(SELECT value FROM json_each(?2) UNION SELECT gid FROM guest_links WHERE uid IN ${XU})`;

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env }) => {
  const db = env.DB!;
  const days = Math.min(365, Math.max(1, +(new URL(request.url).searchParams.get('days') ?? 7) || 7));
  const since = new Date(Date.now() - days * 86400e3).toISOString(), ex = JSON.stringify(await excludedUids(db));
  const [users, symbols, daily, recent, totals, sections, pages, lv1, lv2, lv3, members, mviews] = await db.batch([
    // a. 誰在查資料：每位使用者的用量
    db.prepare(`
      SELECT l.kind, COALESCE(u.email, l.subject) AS who, COUNT(*) AS n,
             COUNT(DISTINCT l.symbol) AS symbols, MAX(datetime(l.ts, '+8 hours')) AS last
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 AND l.subject NOT IN ${ADMINS} GROUP BY l.kind, l.subject ORDER BY n DESC LIMIT 50`).bind(since, ex),
    // b. 熱門股票排行
    db.prepare(`
      SELECT l.symbol, s.name, COUNT(*) AS n, COUNT(DISTINCT l.subject) AS users,
             SUM(l.kind = 'member') AS member, SUM(l.kind = 'guest') AS guest
      FROM query_logs l LEFT JOIN symbols s ON s.symbol = l.symbol
      WHERE l.ts >= ?1 AND l.symbol IS NOT NULL AND l.status = 200 AND l.subject NOT IN ${ADMINS}
      GROUP BY l.symbol ORDER BY n DESC LIMIT 20`).bind(since, ex),
    // c. 系統用量與效能：每天的請求數、錯誤、超過額度、平均與最慢回應
    db.prepare(`
      SELECT date(ts, '+8 hours') AS day, COUNT(*) AS n, COUNT(DISTINCT subject) AS users,
             SUM(status >= 400) AS errors, SUM(status = 429) AS throttled,
             ROUND(AVG(duration_ms)) AS avg_ms, MAX(duration_ms) AS max_ms
      FROM query_logs WHERE ts >= ?1 AND subject NOT IN ${ADMINS} GROUP BY day ORDER BY day`).bind(since, ex),
    // 最近的查詢紀錄
    db.prepare(`
      SELECT datetime(l.ts, '+8 hours') AS ts, l.kind, COALESCE(u.email, l.subject) AS who, l.endpoint,
             l.symbol, l.range_from, l.range_to, l.status, l.duration_ms, l.ip, l.country
      FROM query_logs l LEFT JOIN users u ON u.uid = l.subject
      WHERE l.ts >= ?1 AND l.subject NOT IN ${ADMINS} ORDER BY l.ts DESC LIMIT 100`).bind(since, ex),
    db.prepare(`
      SELECT (SELECT COUNT(*) FROM users WHERE uid NOT IN ${XU}) AS members,
             (SELECT COUNT(*) FROM users WHERE uid NOT IN ${XU} AND last_seen_at >= datetime(?1)) AS active_members,
             (SELECT COUNT(*) FROM query_logs WHERE ts >= ?1 AND subject NOT IN ${ADMINS}) AS requests,
             (SELECT COUNT(DISTINCT subject) FROM query_logs WHERE ts >= ?1 AND kind = 'guest' AND subject NOT IN ${ADMINS}) AS guests,
             (SELECT COUNT(*) FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND subject NOT IN ${ADMINS}) AS views,
             (SELECT COUNT(DISTINCT subject) FROM page_views WHERE ts >= ?1 AND subject NOT IN ${ADMINS}) AS viewers`).bind(since, ex),
    // 最受歡迎的主題(後台一層一層點開)：區塊 › 頁面 › 頁面裡的細項(分頁、下拉選單，最多三層 l1 l2 l3)
    // 區塊與頁面算「換頁」的次數(l1 為 NULL)；細項算切換到那個畫面的次數，上層的次數 = 底下所有細項加總
    // locked = 訪客點進需要登入的區塊被擋下的次數
    db.prepare(`
      SELECT section, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest, SUM(locked) AS locked
      FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND subject NOT IN ${ADMINS} GROUP BY section`).bind(since, ex),
    db.prepare(`
      SELECT section, page, MAX(title) AS title, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest
      FROM page_views WHERE ts >= ?1 AND l1 IS NULL AND page <> '' AND subject NOT IN ${ADMINS} GROUP BY section, page`).bind(since, ex),
    ...['l1', 'l1, l2', 'l1, l2, l3'].map(cols => db.prepare(`
      SELECT section, page, ${cols}, COUNT(*) AS n, COUNT(DISTINCT subject) AS people,
             SUM(kind = 'member') AS member, SUM(kind = 'guest') AS guest
      FROM page_views WHERE ts >= ?1 AND ${cols.split(', ').pop()} IS NOT NULL AND subject NOT IN ${ADMINS}
      GROUP BY section, page, ${cols}`).bind(since, ex)),
    // 登入用戶分析：每位會員(第一次登入、最後上線)，以及期間內看了哪些頁面與細項(每一筆瀏覽紀錄就是看到的最深一層)
    db.prepare(`
      SELECT uid, email, display_name AS name, datetime(created_at, '+8 hours') AS created, datetime(last_seen_at, '+8 hours') AS last_seen
      FROM users WHERE uid NOT IN (SELECT value FROM json_each(?1)) ORDER BY last_seen_at DESC`).bind(ex),
    db.prepare(`
      SELECT subject AS uid, section, page, MAX(title) AS title, l1, l2, l3, COUNT(*) AS n, MAX(datetime(ts, '+8 hours')) AS last
      FROM page_views WHERE ts >= ?1 AND kind = 'member' AND page <> '' AND subject NOT IN ${XU}
      GROUP BY subject, section, page, l1, l2, l3 LIMIT 5000`).bind(since, ex),
  ]);
  // 分享紀錄(全部期間)：誰分享了哪份報告、被點開幾次、哪些會員登入後看了、其中透過這個連結才第一次登入的人數
  // 不計入的帳號分享的連結整筆不列，看報告的人也不算這些帳號
  // 「新會員」= 第一次登入的時間在分享之後，且在第一次看這份報告前 30 分鐘內(點連結 → 登入 → 看報告)
  const shares = await db.prepare(`
    SELECT s.code, s.path, s.title, s.clicks, datetime(s.created_at, '+8 hours') AS created, su.email AS sharer,
           COUNT(v.uid) AS viewers, COALESCE(SUM(v.n), 0) AS views,
           SUM(CASE WHEN u.created_at >= s.created_at AND u.created_at >= datetime(v.first_at, '-30 minutes') THEN 1 ELSE 0 END) AS new_members,
           GROUP_CONCAT(COALESCE(u.email, v.uid), '、') AS who
    FROM share_links s LEFT JOIN users su ON su.uid = s.uid
    LEFT JOIN share_views v ON v.code = s.code AND v.uid NOT IN (SELECT value FROM json_each(?1)) LEFT JOIN users u ON u.uid = v.uid
    WHERE s.uid NOT IN (SELECT value FROM json_each(?1))
    GROUP BY s.code ORDER BY s.created_at DESC LIMIT 200`).bind(ex).all().catch(() => ({ results: [] }));   // 還沒建立資料表時不影響其他統計
  return json({ days, totals: totals.results[0], users: users.results, symbols: symbols.results, daily: daily.results, recent: recent.results,
                sections: sections.results, pages: pages.results, levels: [lv1.results, lv2.results, lv3.results], shares: shares.results,
                members: members.results, mviews: mviews.results });
};
