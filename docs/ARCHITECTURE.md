# 架構與維護指南

給維護者看的細節。網站簡介見根目錄 [README.md](../README.md)，統計學教材的編輯方式見 [CONTENT.md](CONTENT.md)。

## 目錄

```
web/                                網站(部署時整個資料夾就是網站根目錄)
  index.html                        外框，在此依序載入框架與訪客也能看的模組 <script defer>(平行下載、依序執行)；會員區塊的程式登入後才由 app.js 載入
  assets/
    js/app.js                       框架：側欄區塊 SECTIONS、資料集清單 DATASETS、頁面註冊、路由、資料載入、會員區塊的鎖與登入畫面
    js/auth.js                      Google 登入(不用 Firebase SDK)：Google OAuth → Firebase REST → api/session 發 cookie；api/me 取得身分
    js/firebase-config.js           Firebase 與 Google 登入的設定(apiKey、projectId、clientId，都是公開資訊)
    js/chart.js                     共用 SVG 圖表 LTChart.line / LTChart.bars(跟隨主題與寬度、滑鼠提示)
    css/components.css、layout.css  色彩變數(暗色/淺色)與元件樣式、版型
    vendor/                         第三方套件(放在本站以符合 CSP)：marked(Markdown)、KaTeX(公式)
    img/logo.svg                    吉祥物「小K」
  modules/
    home/home.js                    首頁：各區塊入口、各資料集更新狀態
    indices/indices.js              指數：大盤漲跌分析、K棒型態
    indices/futures.js              指數：台指期貨(轉倉、結算日曆；用到 option/lib.js)
    etf/pack.js                     ETF：ETF大禮包(ETF介紹、怎麼存ETF、ETF研究；ETF研究同台股其他研究，最上方選主題(投資方式、主動式 ETF)，再用下拉式選單選研究；A 系列 ETF 跟單用資料集 etf_research，績效統計共用 tw-strategy.js 的 LTTW)
    etf/etf.js                      ETF：即將發行ETF
    stock/disposition.js            股票 · 台股：處置股(新制說明、處置期間表現；資料集 disposition)
    stock/tw.js                     股票 · 台股：隔日沖(建置中)
    stock/tw-strategy.js            股票 · 台股：策略回測(做多：低波動選股、融資都沒退，算我輸嗎(需要密碼)；做空：大盤跌個股逆勢漲就是欠踹；一律和 0050 比較；資料集 tw_strategy)；績效統計與圖表函式以 window.LTTW 共用給 tw-research.js
    stock/tw-research.js            股票 · 台股：其他研究(最上方選主題：營收、因子、事件、機器學習，再用下拉式選單選研究；同一系列同一個顏色；回測結果＋報告 Markdown；資料集 tw_research)
    stock/earnings.js               股票 · 美股：財報行事曆
    stock/us-strategy.js            股票 · 美股：S&P500 季度換股策略回測(最上方選總覽或單一策略；資料集 sp500)
    stock/query.js                  股票 · 台股：股價查詢(api/prices，資料在 Cloudflare D1)；保留給以後開放，目前只給管理員用網址 #/stock/query 預覽
    admin/admin.js                  後台(#/other/admin，只給管理員，不列在側欄)：誰在查資料、熱門股票、API 用量與效能
    option/lib.js                   選擇權共用：Black-Scholes、Greeks、策略定義 STRATEGIES、資料載入、結算日曆
    option/calculator.js            Black-Scholes 計算器元件(在市場概況的分頁裡顯示)
    option/market.js                選擇權市場概況(市場指標、T 字報價與未平倉、Black-Scholes 計算器三個分頁)
    option/strategy.js              策略損益圖
    stats/basic.js                  初級統計學(章節設定、互動模擬、台股實例；內容在 content/)
    stats/stats.js                  計量(建置中)
    other/other.js                  好用推薦
  content/stats/basic/              統計學各章 Markdown、圖片、產生圖片的 R 程式
  data/                             本機執行 pipeline 的輸出(不進版控；正式資料在 data 分支)

pipeline/                           資料抓取，一個資料集一個資料夾，資料夾名稱 = 資料集名稱
  common.py                         共用：輸出資料夾、write_json、write_meta、load_published(讀回上次發佈的檔案做增量更新)
  publish_data.sh                   把 web/data/<資料集>/ 發佈到 data 分支(只替換該資料夾)
  requirements.txt
  indices/update.py、twse.py        全球指數(Yahoo Finance)；台灣加權改用證交所資料
  etf_upcoming/update.py            即將發行 ETF(MoneyDJ)
  options/update.py                 臺指選擇權(期交所)：IV、Put/Call 比、T 字報價；並呼叫 futures.py
  options/futures.py                台指期(期交所)：近月走勢、三大法人淨未平倉、期限結構
  earnings/update.py                美股財報行事曆(Nasdaq)：上週、本週、下週
  etf_compare/update.py             常存 ETF 比較、0050 vs 勞退基金(勞動基金運用局；台股 ETF 股價用本機 PostgreSQL，2016 年以前 Yahoo Finance)
  disposition/update.py             台股處置股(處置名單與股價：本機 PostgreSQL；加權指數用 indices 資料集、櫃買指數用櫃買中心；只在本機執行)
  tw_strategy/update.py             台股低波動策略回測(本機 PostgreSQL 的台股日資料；只在本機執行)，最後呼叫 events.py
  tw_strategy/events.py             台股事件型策略的共用引擎(每天選股、隔天開盤進場、持有幾天出場；漲跌停進不了場或出不了場；本金 100 萬的整數股資金模擬與交易成本，低波動也共用)：融資都沒退(做多)、大盤跌個股逆勢漲(做空)，每個策略一個 JSON
  tw_strategy/private_strategies.py 不公開的策略(條件、網頁說明、密碼；不進版控，只在本機，要自己備份)：輸出時整份加密，網頁輸入密碼後解密
  run_local.py                      本機資料集(tw_strategy、disposition、etf_compare)：等 cm 同步 → 更新 → 發佈到 data 分支 → 觸發一次部署
  tw_research/update.py             台股其他研究：用本機 PostgreSQL(日資料、月營收、公告股本)計算各研究的淨值、交易統計與報告(報告範本 tw_research/reports/<研究>.md，數字由程式填入；進出場、成本與資金模擬共用 tw_strategy/events.py；只在本機手動執行)
  etf_research/update.py            ETF大禮包「ETF研究」的資料檔：把本機研究資料夾(A 系列 ETF 跟單，預設 ~/Desktop/ETF_PANEL/CLAUDE/A系列ETF跟單，環境變數 ETF_FOLLOW_DIR 可改)輸出的淨值、交易統計、統計表與報告轉成 JSON；研究結果不每日更新，只在本機手動執行
  sp500/update.py                   S&P500 季度換股回測：歷史成分股(fja05680/sp500)、Yahoo Finance、Tiingo(已下市公司)
  price_query/sync.py               股價查詢的資料：cm.tw_daily → Cloudflare D1(本機執行，只上傳有變動的部分)

functions/                          Cloudflare Pages Functions(後端，只在 Cloudflare 主站運作)
  _lib/access.json                  權限設定(唯一的設定處)：會員限定的區塊、頁面程式、資料集，以及後台程式
  _lib/auth.ts                      Firebase ID token 驗證、會員 session cookie、訪客 id
  _lib/types.ts                     環境變數、股價查詢的期間與每日額度 POLICY
  _lib/security.ts                  API 的資安防護：來源檢查(CORS)、安全標頭、每分鐘次數限制
  api/                              me(目前身分)、session(登入)、logout、symbols、prices(股價查詢)、admin/stats(後台)；_middleware.ts 辨識身分並寫查詢日誌
  data/_middleware.ts               會員限定的資料集只給會員(meta.json 公開)
  modules/_middleware.ts            會員限定的頁面程式只給會員、後台程式只給管理員
migrations/                         D1 資料表(users、query_logs、usage_daily、rate_minute、symbols、price_chunks、meta)
scripts/build-site.mjs              部署前產生 _routes.json(只有需要檢查的路徑經過 functions)與 GitHub Pages 的公開版
wrangler.toml、package.json         Cloudflare 設定(D1 綁定、Firebase 專案 ID)與本機開發工具(wrangler、jose)

.github/workflows/
  _dataset.yml                      共用流程：update.py → publish_data.sh → deploy
  data-<資料集>.yml                  各資料集的排程，只呼叫 _dataset.yml
  deploy.yml                        組合 web/ 與 data 分支 → Cloudflare Pages(完整版＋functions/)＋ GitHub Pages(公開版)
```

## 資料怎麼流動

1. `data-<資料集>.yml` 依排程觸發 `_dataset.yml`。
2. 執行 `pipeline/<資料集>/update.py`，輸出到 `web/data/<資料集>/`，一定包含 `meta.json`(更新時間、來源、排程、version)。
3. `publish_data.sh` 只替換 data 分支裡該資料集的資料夾。data 分支永遠只有一個 commit。
4. 呼叫 `deploy.yml`：`web/` ＋ data 分支 → `_site/` → 同時發佈到 Cloudflare Pages 與 GitHub Pages(見「部署」)。推送到 main 也會觸發部署(沿用 data 分支現有資料)。

網頁端用 `LT.loadJSON(資料集, 檔名)` 載入資料，網址帶 `meta.version`，資料沒更新前瀏覽器直接用快取。每頁用到的資料集會自動列在頁尾 COPYRIGHT 下方(「資料來源 · 更新時間 · 排程」，換頁時更新；首頁列出全部資料集)，頁面不用自己顯示。

## 部署

同一份 `_site/` 發佈到兩個地方：

| 網址 | 角色 | 部署方式 |
|---|---|---|
| https://little-trader.pages.dev/ (Cloudflare Pages，專案 `little-trader`) | 主要網址：完整版＋後端(登入、會員權限、股價查詢) | `deploy.yml` 的 `cloudflare-pages` 工作，在 repo 根目錄用 wrangler 直接上傳(Direct Upload)，一起上傳 `functions/` |
| https://rebornlife0218.github.io/little-trader/ | 備援，保留不刪：公開版(沒有後端、不能登入，會員區塊顯示「到主站登入」) | `deploy.yml` 的 `github-pages` 工作，用 `scripts/build-site.mjs` 拿掉會員限定的程式與資料 |

- 觸發點不變：推送到 main、資料集排程、`run_local.py`(`gh workflow run deploy.yml`)都會一次部署兩邊。只改網站內容的話，照舊 commit + push 即可，不用碰 Cloudflare。
- 不用 Cloudflare 的「連接 GitHub 自動建置」：網站是 main 的 `web/` 加上 data 分支組合而成，資料更新只推 data 分支，用 Git 連接會漏掉資料更新。
- Cloudflare 沒設定好(缺 secrets)時，`cloudflare-pages` 會顯示警告並略過，不影響 GitHub Pages。
- 網頁一律用相對路徑(GitHub Pages 在 `/little-trader/` 子路徑、Cloudflare 在根目錄，兩邊都能用)；新增檔案或連結時不要寫 `/` 開頭的絕對路徑。
- Cloudflare Pages 單一檔案上限 25 MB、總檔案數上限 20,000，資料檔要控制在這之內。

**第一次設定(只做一次)**

1. 登入 Cloudflare → My Profile → API Tokens → Create Token → 用「Edit Cloudflare Workers」範本，或自訂權限 Account › Cloudflare Pages › Edit。
2. Cloudflare 首頁右側(或任一網址列 `dash.cloudflare.com/<帳戶 ID>`)複製 Account ID。
3. GitHub repo → Settings → Secrets and variables → Actions：新增 secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。也可以用 `gh secret set CLOUDFLARE_API_TOKEN`(會提示貼上，不會留在指令紀錄)。
4. (選填)專案名稱預設 `little-trader`，要改就新增 variable `CLOUDFLARE_PROJECT`。
5. Actions → 部署網站 → Run workflow。第一次會自動建立 Cloudflare Pages 專案，完成後網址顯示在 Cloudflare 的 Workers & Pages。

目前已設定完成(2026-10-23)：token 名稱 `little-trader-pages`，權限 Account › Cloudflare Pages › Edit。

**日後維護**

- API token 到期或被撤銷：重新建立後更新 `CLOUDFLARE_API_TOKEN` 即可。
- 綁自己的網域：Cloudflare → Workers & Pages → 專案 → Custom domains。
- 回復舊版：Cloudflare 專案的 Deployments 可以對任一次部署 Rollback；GitHub Pages 則重跑舊 commit 的部署。
- 不想再部署 GitHub Pages：刪掉 `deploy.yml` 的 `github-pages` 工作，並到 repo Settings → Pages 停用。

## 會員與權限

| 身分 | 看得到 |
|---|---|
| 訪客 | 指數、統計學、其他 |
| 會員(Google 登入) | 全部；設有密碼的策略仍要另外輸入密碼(JSON 整份加密，不受登入影響) |
| 管理員(`users.role = 'admin'`) | 另外有後台 `#/other/admin`，以及保留中的股價查詢 `#/stock/query`(預覽) |

**怎麼運作**

- 登入(`assets/js/auth.js`)：轉到 Google 登入頁 → 回來時用 Firebase REST API(`accounts:signInWithIdp`)換成 Firebase ID token → `POST api/session`，後端驗證 token(`jose`，Google 公開金鑰)後發 `lt_sess` cookie(HttpOnly、HMAC 簽章、30 天)。不用 Firebase SDK，因為它會從 Google 載入外部腳本，違反 CSP 只允許同源的規則；CSP 只為登入多開 `connect-src https://identitytoolkit.googleapis.com`。
- 開網頁時 `app.js` 先呼叫 `api/me`：會員才拿到會員區塊的程式清單並載入；訪客在側欄與首頁看到 🔒，點進去是登入提示。第一次來訪會跳出「用 Google 登入 / 以訪客身分繼續瀏覽」(選訪客會記在 localStorage `lt.guest`，不再詢問；這個標記只控制畫面)。
- 真正的權限在後端：`functions/data/_middleware.ts`、`functions/modules/_middleware.ts` 擋訪客下載會員限定的資料與程式(回 401)，畫面上的鎖只是提示。
- 權限清單只寫在 `functions/_lib/access.json`：後端檢查、部署時的 `_routes.json`、GitHub Pages 公開版、網頁要載入的程式都從這裡來。
  - **新增會員區塊的頁面**：程式放在 `web/modules/<區塊>/`，路徑加到 `memberScripts`(依側欄順序，同一小組要連續)，**不要**寫進 `index.html`。
  - **新增會員限定的資料集**：名稱加到 `memberDatasets`。
  - 要把整個區塊改成公開或會員限定：改 `memberSections`，並把該區塊的程式在 `index.html` 與 `memberScripts` 之間搬動。
- 每個 `/api` 請求都寫一筆 `query_logs`(`/api/me` 除外)：會員 uid 或訪客 id、股票代號、查詢期間、狀態碼、耗時、IP、國家、User-Agent。日誌含個資(IP、email)，要定期清理(例如保留 180 天)：`npx wrangler d1 execute little-trader --remote --command "DELETE FROM query_logs WHERE ts < datetime('now', '-180 days'); DELETE FROM usage_daily WHERE day < date('now', '-30 days')"`。
- API 的資安防護(`functions/_lib/security.ts`，由 `api/_middleware.ts` 套用到所有 `/api`)：
  - **來源檢查(CORS)**：只有 `wrangler.toml` 的 `ALLOWED_ORIGINS`(目前是 `little-trader.pages.dev` 與本機開發)能從瀏覽器呼叫；`Origin` 不在清單內、或 `Sec-Fetch-Site: cross-site` 一律 403，連登入、登出的 POST 也擋(順便防 CSRF)。允許的來源才回 `Access-Control-Allow-Origin`(是那個來源本身，不是 `*`)。綁自己的網域時要加進 `ALLOWED_ORIGINS`。CORS 只擋得了別人的網頁，擋不了程式直接呼叫，那部分靠次數限制。
  - **每分鐘次數限制**：訪客每個 IP 10 次、會員每個帳號 60 次(`PER_MINUTE`)，超過回 429 與 `Retry-After`；`api/me`、`api/logout` 不計。用 D1 的 `rate_minute` 原子計數(Workers 的記憶體不共用、KV 不即時，都算不準；Pages Functions 不能直接用 Durable Objects)。另外股價查詢還有每日額度(`POLICY`)。
  - **驗證**：`Authorization: Bearer <Firebase ID token>` 或網頁登入後的 session cookie 都算會員；token 不合法回 401，不降級成訪客。
  - **資料在後端過濾**：訪客的查詢期間在後端截成最近 31 天，只讀那幾年的資料區塊、逐日篩選後才回傳，訪客拿不到更早的資料。
  - **安全標頭**：API 回應加上 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Content-Security-Policy: default-src 'none'`、`Referrer-Policy: no-referrer`、`Cache-Control: private, no-store`；靜態檔的安全標頭在 `web/_headers`(只有 Cloudflare 會套用)。
- Functions 用量：免費方案每天 10 萬次請求；`_routes.json` 讓只有 `/api/*` 與會員限定的檔案經過 functions，其他靜態檔不計。

**第一次設定(只做一次)**

1. Firebase 主控台(console.firebase.google.com)建立專案 → Authentication → Sign-in method 啟用 Google。
   - 專案設定 › 一般：複製 Web API Key(`apiKey`)與專案 ID(`projectId`)。
   - Google 登入的「網頁 SDK 設定」：複製網路用戶端 ID(`clientId`)。
   - Authentication › Settings › Authorized domains：加上 `little-trader.pages.dev`。
2. Google Cloud Console(同一個專案)› API 和服務 › 憑證 › 上面那個 OAuth 用戶端：
   - 已授權的 JavaScript 來源：`https://little-trader.pages.dev`、`http://localhost:8788`。
   - 已授權的重新導向 URI：`https://little-trader.pages.dev/`、`http://localhost:8788/`(結尾的斜線要有)。
3. 把 `apiKey`、`projectId`、`clientId` 填進 `web/assets/js/firebase-config.js`，`projectId` 也填進 `wrangler.toml` 的 `FIREBASE_PROJECT_ID`。
4. 本機登入 Cloudflare：`npx wrangler login`(瀏覽器授權)。
5. 建立 D1：`npx wrangler d1 create little-trader`，把輸出的 `database_id` 填進 `wrangler.toml`；再 `npm run db:migrate:remote` 建資料表。
6. 設定簽 cookie 的金鑰(隨機產生，不進 repo)：
   `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler pages secret put SESSION_SECRET --project-name little-trader`
7. 第一次上傳股價：`python pipeline/price_query/sync.py`(約 60 MB，之後每天由 `run_local.py` 只上傳變動的部分)。
8. 推送後部署，用 Google 登入一次，再把自己設成管理員：
   `npx wrangler d1 execute little-trader --remote --command "UPDATE users SET role = 'admin' WHERE email = '你的 Gmail'"`

**本機測試**：`npm run dev` 開 http://localhost:8788(含 functions 與本機 D1)。本機的 `SESSION_SECRET` 寫在 `.dev.vars`(不進版控)；本機 D1 要先 `npm run db:migrate:local`、`python pipeline/price_query/sync.py --local`。

## 股價查詢

- **保留給以後開放**：網頁上目前沒有股價查詢；`modules/stock/query.js` 放在 `access.json` 的 `adminScripts`、註冊時 `hidden: true`，只有管理員能用網址 `#/stock/query` 預覽。後端 API、D1 資料與每天的同步都照常運作。開放時把它移到 `memberScripts`(台股那幾頁後面)並拿掉 `hidden`。
- 網頁：股票 › 台股 › 股價查詢(`modules/stock/query.js`)。輸入代號或名稱、選期間，顯示收盤價與還原收盤價走勢、成交量、含息報酬，以及每日資料表(可下載 CSV)。
- 資料：`cm.tw_daily` 2016 年起所有有成交的日子(上市櫃股票與 ETF，含已下市櫃)：開高低收(原始價格)、還原收盤價(含除權息)、成交量(張)。股票名稱來自公司基本資料；資料庫沒有 ETF 名稱，改用證交所、櫃買中心當天的收盤行情補上(累積在 `~/.cache/little-trader/etf_names.json`，下市的 ETF 也留著)。
- 儲存：D1 的 `price_chunks` 每檔每年一筆(gzip 的 JSON)，全部約 2.2 萬筆、60 MB；查 10 年只讀約 11 列，不會用掉 D1 每天 500 萬列的免費讀取額度。
- 同步：`pipeline/price_query/sync.py` 每次在本機重算全部，只上傳內容有變的區塊(新的交易日、除權息後整段還原股價改變、資料修正)；已上傳的內容記在 `~/.cache/little-trader/d1_prices.json`，刪掉就會全部重傳。`run_local.py` 每天在 cm 同步後執行(`wrangler.toml` 還沒填 D1 的 ID 時略過)。
- 權限與額度(`functions/_lib/types.ts` 的 `POLICY`)：會員不限期間、每天 1000 次；訪客最近 31 天、每天 30 次(股價查詢頁只開放會員，訪客的限制是 API 的保險)。額度以台北日期計，會員依帳號、訪客依 IP。
- 報酬一律用還原收盤價計算；開高低收是原始價格，遇到分割(例如 0050 在 2025/6 一拆四)會有斷層。

## 資料集

| 資料集 | 來源 | 排程(台北) | 主要檔案 |
|---|---|---|---|
| indices | Yahoo Finance、臺灣證券交易所 | 週一~五 05:30、15:30 | 每個指數一個 JSON(`d/o/h/l/c/v` 陣列)；另有 `TAIEX_TR.json`(發行量加權股價報酬指數，含股息，2003 起，`d/c`；不列在指數頁，給 ETF大禮包的長期回測) |
| etf_upcoming | MoneyDJ 新基金一覽表 | 週一~五 08:30、17:30 | `upcoming.json` |
| etf_compare | 勞動基金運用局；台股 ETF 股價：本機 PostgreSQL `cm.tw_daily`(2016 年起)，之前用 Yahoo Finance(0050、0056、006208，從上市日起)；ARKK：Yahoo Finance；臺灣證券交易所(除權除息計算結果表) | 週一~五 23:45、週二~六 12:15(本機排程) | `compare.json`(每月：勞退基金報酬、0050 價格與總報酬，用下面每日資料的月底值)、`etfs.json`(常存 ETF 與 ARKK 的每日收盤、股利再投入還原股價、每股配息；排除沒有成交的日子；台股 ETF 的還原股價用證交所除息資料自己算，Yahoo 的還原股價缺 2013 年以前的配息、2014 年的除息也算錯) |
| earnings | Nasdaq Earnings Calendar | 每天 07:30、20:00 | `earnings.json`(上週、本週、下週每天的公司、盤前/盤後、預估與實際 EPS、驚喜幅度) |
| disposition | 本機 PostgreSQL `cm.tw_disposition`(處置名單)、`cm.tw_daily`(股價)；櫃買中心(櫃買指數) | 週一~五 23:45、週二~六 12:15(本機排程) | `events.json`(2026/7 起每個處置事件：期間、新制/舊制、第一天開收、處置前 5 日、處置期間、出關後 5 日與同期大盤報酬) |
| tw_research | 本機 PostgreSQL `cm.tw_daily`、`cm.tw_monthly_revenue`、`cm.tw_company_info` | 不定期(研究更新時手動執行) | 每個研究一個 JSON：`rev_pre.json` 營收公告前布局(不限市值與市值四分位 Q1～Q4 的前 10、前 5 檔與全部合格股票淨值、交易統計、進場日敏感度、綜合分數十分位、因子 IC)、`rev_growth.json` 營收成長特徵(3 種持有期 × 3 種分數組合的淨值與持有檔數、特徵 IC t 值、公告前後累積超額報酬)、`rev_drop.json` 營收衰退開低(日內 / T+1 × 全部 / 均額 ≥ 1 千萬的淨值與持有檔數、分組報酬)、`rev_turn.json` 營收由負轉正(5 日 / 10 日 / 20 日 × 各種門檻與持續成長對照組的淨值與持有檔數、四種營收變化的累積超額報酬與每筆報酬)；都含 `d`(日期，第一天 = 期初)、`b0050`(0050 淨值)、`report`(報告 Markdown，不含建議)；淨值期初 = 1，本金 100 萬整數股、已扣成本，資金規則同 tw_strategy(有新股票進場時再平衡；寫明檔數的用 1/N 上限)。不發佈 csv、png 與原始股價 |
| etf_research | 本機研究資料夾(ETF持股明細、ETF折溢價、台股日資料) | 不定期(研究更新時手動執行) | `etf_follow.json` A 系列 ETF 跟單：`d`(日期，第一天 = 期初)、`b0050`(0050 淨值，報告的總報酬圖用)、`b0050s`(每組訊號自己的 0050，期初和該組策略相同)、`strats`(模式 × 範圍 × 出場的策略：從第一個訊號前一天 `i0` 開始的淨值(期初 = 1，本金 100 萬整數股、已扣成本)、交易統計 `ts`、每日持有檔數 `npos`)、`etfs`(10 檔 ETF 與持股資料起點)、報告用的統計表(`holding` 持有期、`by_etf` 各檔、`consensus` 多家同時、`entry` 進場時點、`flow` 申贖調整、`ex81` 拿掉 00981A、`cexit` 多家同時的出場規則：每筆平均超額報酬與日期聚類 t 值)、`report`(報告 Markdown)。網頁的夏普值用日報酬平均 ÷ 標準差 × √252(研究指定)。不發佈 csv、png 與原始股價 |
| sp500 | fja05680/sp500 歷史成分股、Yahoo Finance、Tiingo | 週六 09:00 | `backtest.json`(四種策略、全部成分股等權重、SPY 的每日淨值(未扣成本)；每季的成分股數、可取得股價數、換手率、無風險利率、持股) |
| options | 臺灣期貨交易所 期貨、選擇權每日交易行情、三大法人 | 週一~五 06:00、16:00 | `history.json`(每日 30 天 IV、P/C 比)、`chain.json`(最新 T 字報價)、`futures.json`(台指期近月走勢、三大法人淨未平倉、各月份契約)、`spot.json`(加權指數近 300 日收盤，選擇權頁面用) |
| tw_strategy | 本機 PostgreSQL `cm.tw_daily`(台股日資料) | 週一~五 23:45、週二~六 12:15(本機排程) | `backtest.json`(低波動 10 檔、低波動 10%、全部合格股票等權重、0050 的每日淨值(本金 100 萬、整數股，已扣手續費、交易稅、滑價)；每日持有檔數 `npos`、交易統計 `tstat`(筆數、勝率、平均與中位數報酬、平均持倉天期)；每月換股日、合格股票數、換手率(買賣合計)；最新一次選股的持股)；事件型策略各一個 `<策略>.json`(`margin` 融資都沒退(加密：`{enc: {iter, salt, iv, ct}}`，解密後另含網頁說明 `info`)、`against` 大盤跌個股逆勢漲：每日淨值(已扣成本、未扣借券費)、0050 淨值、持有檔數、做空另有每天放空比例 `expo`(網頁扣借券費)、每筆交易(含漲跌停延後天數、持有日曆天數)、進不了場而放棄的訊號 `skipped`、連一股都買不起而放棄的筆數 `nocash`(有新股票進場時所有部位再平衡到 min(上限, 1/持有檔數)，現金不夠時新股票平分剩下的現金)、每筆資金上限 `cap`、最近 20 個交易日的選股與欄位) |

增量更新：證交所與期交所一次只能查一個月，所以 indices 與 options 都用 `common.load_published()` 讀回 data 分支上的舊檔，只補最近的資料；沒有舊檔時才完整回補(options 回補 1 年)。

本機資料集(tw_strategy、disposition、etf_compare)：
- 資料庫在本機(localhost:9457)，GitHub Actions 連不到，所以沒有 `data-<資料集>.yml`；由 Windows 工作排程器「LittleTrader_local」在 cm 同步(`CM_PostgreSQL_Sync`：週一~五 23:30、週二~六 12:00；台股日資料約 21:30 進 repo)之後以 `pythonw.exe` 執行 `pipeline/run_local.py`，cm 同步還在跑會先等它結束。不能用 Git Bash：電腦睡眠(新式待命)時排程會在背景執行，msys 的 bash.exe 在這個狀態下啟動失敗(0xC0000142)，所以發佈步驟(同 `publish_data.sh`)在 run_local.py 裡用 Python 呼叫 git.exe。輸出記錄在 `~/.cache/little-trader/local.log`。
- 兩個排程都設定「喚醒電腦執行」與「錯過時間就補跑」(2026-10-17 實測)：插電睡眠時會在背景準時執行、螢幕不會亮，執行完自動回到睡眠；用電池時，從開始功能表選「睡眠」後排程不會執行，要等下次喚醒電腦才補跑(補跑正常)；但閒置自動關閉螢幕(Windows 記為「閒置逾時」進入新式待命)時，程式與排程都照常執行。所以本機的電源設定為：睡眠「永不」、閒置關閉螢幕(電池 5 分鐘、插電 10 分鐘)、電源鍵 =「關閉顯示器」、闔上螢幕 =「不執行任何動作」；離開時按電源鍵或放著讓螢幕自己關，不要選睡眠。建立排程時要取消「只在插電時才啟動」(`New-ScheduledTaskSettingsSet` 預設是勾選的)。
- 連線(`common.pg_connect()`)用環境變數 PGHOST/PGPORT/PGUSER/PGDATABASE(有預設值)，密碼由 libpq 讀 `%APPDATA%\postgresql\pgpass.conf`，不進 repo；需要 `psycopg`(只有本機需要，不在 requirements.txt)。
- 處置股的加權指數讀 data 分支的 `indices/TAIEX.json`(證交所資料，GitHub Actions 每天 15:30 更新)。
- 只發佈回測結果，不發佈原始股價。
- etf_research(ETF研究)不在排程裡：研究在本機的研究資料夾計算(不在 repo 內)，研究改版後執行 `python pipeline/run_local.py etf_research`(轉檔、發佈到 data 分支並重新部署)。
- tw_research(台股其他研究)不在排程裡：`pipeline/tw_research/update.py` 直接用本機 PostgreSQL 計算(規則同 tw_strategy，共用 `events.py`)，報告文字在 `pipeline/tw_research/reports/`；研究更新後手動執行 `python pipeline/run_local.py tw_research`(重跑、發佈到 data 分支並重新部署)。
- 台股回測的規則(進出場、漲跌停、資金分配、交易成本、績效指標)以根目錄 `CLAUDE.md` 的「選股回測原則」為準，實作在 `events.py`(事件型)與 `update.py`(低波動，共用 events.py 的成本與漲跌停函式)；績效統計在網頁 `tw-strategy.js` 的 `stats`、`tradeStats` 計算。

sp500 的特殊處理：
- 已下市、被併購公司的股價 Yahoo 沒有，改用 Tiingo(需要 API 金鑰：本機放在 `~/.tiingo_key`，GitHub Actions 用 Secret `TIINGO_API_KEY`；`data-sp500.yml` 要 `secrets: inherit`)。Tiingo 的原始股價只快取在本機 `~/.cache/little-trader/tiingo/`，**不發佈**(授權不允許轉載)，data 分支只放回測結果。
- 完整重算(從 2000 年)只在本機執行：`python pipeline/sp500/update.py --full`(加 `--offline` 只用快取)；免費方案每小時 50 次請求，第一次下載約 3～4 小時。
- 每週的增量更新讀回已發佈的結果，從倒數第 3 季重算並接上，最近的成分股 Yahoo 幾乎都有，偶爾才需向 Tiingo 查幾檔。
- Yahoo 的代號可能已被別家公司沿用(例如 EP 原為 El Paso，現在是 Empire Petroleum)：成分股期間每日成交金額中位數低於 200 萬美元就視為沿用，改找 Tiingo。

## 新增頁面

在 `web/modules/<區塊>/` 新增 JS，並在 `web/index.html` 的「研究模組」處加上 `<script defer src="...">`(一律加 defer，網頁才會平行下載、不會卡住畫面)。會員區塊(ETF、股票、選擇權)的頁面改加到 `functions/_lib/access.json` 的 `memberScripts`，不寫進 `index.html`(見「會員與權限」)：

```js
LT.register({ section: 'etf', key: 'x', name: '外部網站', href: 'https://...' });       // 側欄直接開新分頁
LT.register({ section: 'stock', key: 'disposition', name: '處置股', desc: '一句話說明' }); // 建置中頁面(沒有 mount)

LT.register({
  section: 'stock',            // 區塊 key(app.js 的 SECTIONS)
  key: 'my-study',             // 網址：#/stock/my-study
  name: '我的研究',             // 側欄顯示名稱
  async mount(el, ctx) {       // el 是內容區；ctx.alive() 為 false 代表使用者已切到別頁
    const { meta, data } = await LT.loadJSON('my_dataset', 'items.json');
    if (!ctx.alive()) return;
    el.innerHTML = `<header class="top"><div><h1>我的研究</h1></div></header>
      <div class="panel"><div id="myChart"></div></div>`;
    LTChart.line(document.getElementById('myChart'), {
      x: data.d, xType: 'date', series: [{ name: '收盤', y: data.c, color: 'var(--amber)' }],
    });
  },
});
```

- **新增側欄區塊**：在 `app.js` 的 `SECTIONS` 加一筆(`desc` 會顯示在首頁)；會員限定的區塊另外加到 `access.json` 的 `memberSections`。
- **不列在側欄的頁面**：註冊時加 `hidden: true`(例如後台)，只能用網址開。
- **區塊內分小組**：註冊頁面時加上 `group: '台股'`，側欄與首頁會顯示小組標題(同組頁面要連續註冊)，例如股票區塊的台股、美股。
- **圖表**：用 `LTChart.line` / `LTChart.bars`(選項見 `chart.js` 開頭註解)，顏色用 CSS 變數，主題切換不用重畫。
- **公式**：KaTeX 已全域載入，`katex.renderToString('\\sigma^2')`。

## 新增資料集

1. 建立 `pipeline/<資料集>/update.py`：用 `common.dataset_dir()` 取得輸出資料夾、`common.write_json()` 寫資料、最後 `common.write_meta(名稱, 來源名稱, 來源網址, 排程說明)`。
2. 複製 `.github/workflows/data-options.yml` 為 `data-<資料集>.yml`，修改名稱、排程(cron 為 UTC，台北時間減 8 小時)與 `dataset:`。
3. 在 `web/assets/js/app.js` 的 `DATASETS` 加一筆，首頁會顯示更新狀態。
4. 有新的 Python 套件就加到 `pipeline/requirements.txt`。

## 選擇權的計算

- **遠期價格**：買賣權平價 $F = K + e^{rT}(C - P)$，取 $|C - P|$ 最小的履約價，不需要現貨價。
- **隱含波動率**：以結算價反推 Black-76 的 σ(二分法)，r = 1.7%。
- **30 天 IV**：各到期契約的價平 IV 換成總變異數 σ²T，在 30 天前後兩個到期日之間線性內插。
- **Put/Call 比**：成交量含一般與盤後時段；未平倉量不含當日到期契約(與期交所公布的數字一致)。
- **台指期近月**：到期日(第 3 個週三)在交易日之後、最早到期的月契約，到期當天換到下一個月份；成交量為全部月份(含盤後)，未平倉不含當日到期契約。
- **轉倉**：另存次月契約的收盤(`code2`、`c2`)與近月/次月的成交量、未平倉(`v1`、`v2`、`oi1`、`oi2`)，網頁畫出轉倉價差(次月 − 近月)與未平倉從近月移到次月的過程；次月未平倉超過近月的那天標為主力換月日。
- **結算日曆**：取自期交所的契約到期日(含假日順延)，選擇權有月選(第 3 個週三)與週選(每週三 W、週五 F)，月選與台指期同日結算。
- **期現貨價差**：在網頁端用台指期近月收盤減去加權指數收盤(indices 資料集)。
- **策略損益圖的標的部位**：以小台計(每點 50 元，與選擇權相同)，價格帶入與選擇權同月份的台指期收盤價。
- **策略**：定義在 `web/modules/option/lib.js` 的 `STRATEGIES`，新增策略只要加一筆(腳的買賣方向、口數、使用第幾個履約價、預設履約價相對價平的檔數)。

## 本機預覽

```bash
pip install -r pipeline/requirements.txt
python pipeline/indices/update.py
python pipeline/etf_upcoming/update.py
python pipeline/options/update.py
python -m http.server 8000 -d web
```

開啟 http://localhost:8000。這樣只有靜態檔、沒有後端，網頁會當作訪客(會員區塊顯示「到主站登入」)；要測登入、會員區塊與股價查詢，改用 `npm install` 後 `npm run dev`(見「會員與權限」的本機測試)。

## 手動更新資料

GitHub repo → Actions → 選擇「資料 · 指數」「資料 · 即將發行ETF」或「資料 · 選擇權」→ Run workflow。
