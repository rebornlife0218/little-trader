-- 頁面瀏覽紀錄：網頁每次換頁送一筆(api/track)，後台用來看哪個主題最受歡迎
CREATE TABLE page_views (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),   -- UTC
  kind    TEXT NOT NULL CHECK (kind IN ('member', 'guest')),
  subject TEXT NOT NULL,                       -- Google 帳號的 uid 或訪客 id
  section TEXT NOT NULL,                       -- 區塊 key(home 為首頁)
  page    TEXT NOT NULL DEFAULT '',            -- 頁面 key(區塊被鎖住時為空)
  title   TEXT,                                -- 頁面名稱(顯示用)
  locked  INTEGER NOT NULL DEFAULT 0           -- 1 = 訪客點進需要登入的區塊
);
CREATE INDEX idx_views_ts ON page_views (ts);
