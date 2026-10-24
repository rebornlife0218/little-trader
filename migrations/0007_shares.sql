-- 分享研究報告的連結(研究、策略頁的「分享」按鈕，api/share 產生；/s/<代碼> 打開)
-- 同一個人分享同一份報告只會有一個代碼；clicks = 連結被點開的次數(含沒登入的人)
CREATE TABLE share_links (
  code       TEXT PRIMARY KEY,                -- 8 碼英數
  uid        TEXT NOT NULL,                   -- 分享的人(Google 帳號 uid)
  path       TEXT NOT NULL,                   -- 報告網址，例如 etf/research/etf_follow
  title      TEXT,                            -- 報告名稱(顯示用)
  clicks     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))   -- UTC
);
CREATE UNIQUE INDEX idx_share_uid_path ON share_links (uid, path);

-- 透過分享連結進來、登入後看了報告的人(每個連結 × 每個帳號一筆，n = 看了幾次)
CREATE TABLE share_views (
  code     TEXT NOT NULL,
  uid      TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 1,
  first_at TEXT NOT NULL DEFAULT (datetime('now')),   -- UTC
  last_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (code, uid)
) WITHOUT ROWID;
