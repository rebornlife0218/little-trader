-- 訪客代號(瀏覽器的 lt_gid cookie)與 Google 帳號的對應：登入的人開網頁時記一筆(api/me)
-- 後台統計排除管理員時，連管理員登入前用訪客身分的紀錄也一起排除
CREATE TABLE guest_links (
  gid TEXT PRIMARY KEY,
  uid TEXT NOT NULL
) WITHOUT ROWID;
