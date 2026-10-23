-- D1(SQLite)資料表：會員、查詢日誌、每日額度、股價
-- 套用：npm run db:migrate:local(本機)、npm run db:migrate:remote(正式)

-- 會員：第一次用 Google 登入時建立；role = 'admin' 的可以看後台
CREATE TABLE users (
  uid          TEXT PRIMARY KEY,                -- Firebase uid
  email        TEXT,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

-- 查詢日誌：每個 /api 請求一筆(/api/me 除外)
CREATE TABLE query_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),   -- UTC
  kind        TEXT NOT NULL CHECK (kind IN ('member', 'guest')),
  subject     TEXT NOT NULL,                   -- 會員 uid 或訪客 id
  endpoint    TEXT NOT NULL,
  symbol      TEXT,
  range_from  TEXT,
  range_to    TEXT,
  status      INTEGER NOT NULL,
  duration_ms INTEGER,
  ip          TEXT,
  country     TEXT,
  user_agent  TEXT
);
CREATE INDEX idx_logs_ts         ON query_logs (ts);
CREATE INDEX idx_logs_subject_ts ON query_logs (subject, ts);
CREATE INDEX idx_logs_symbol_ts  ON query_logs (symbol, ts);

-- 每日額度：會員用 uid、訪客用 IP 計數
CREATE TABLE usage_daily (
  quota_key TEXT NOT NULL,                     -- 'u:<uid>' 或 'ip:<ip>'
  day       TEXT NOT NULL,                     -- 台北日期 YYYY-MM-DD
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quota_key, day)
);

-- 股票清單
CREATE TABLE symbols (
  symbol     TEXT PRIMARY KEY,
  name       TEXT,
  first_date TEXT,
  last_date  TEXT,
  delisted   INTEGER NOT NULL DEFAULT 0
);

-- 股價：每檔每年一筆，data = gzip 的 JSON {d, o, h, l, c, a, v}(由本機 pipeline/price_query/sync.py 匯入)
CREATE TABLE price_chunks (
  symbol TEXT NOT NULL,
  year   INTEGER NOT NULL,
  n      INTEGER NOT NULL,                      -- 交易日數
  data   BLOB NOT NULL,
  PRIMARY KEY (symbol, year)
) WITHOUT ROWID;

CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
