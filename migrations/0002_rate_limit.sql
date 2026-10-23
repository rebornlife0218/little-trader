-- 每分鐘的請求次數(防爬蟲)：訪客依 IP、會員依帳號；舊的分鐘由 api/_middleware.ts 順手清掉
CREATE TABLE rate_minute (
  rate_key TEXT NOT NULL,                      -- 'ip:<ip>' 或 'u:<uid>'
  minute   TEXT NOT NULL,                      -- UTC 'YYYY-MM-DDTHH:MM'
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rate_key, minute)
) WITHOUT ROWID;
