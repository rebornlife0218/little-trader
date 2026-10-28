# 架構與維護指南

給維護者看的細節。網站簡介見根目錄 [README.md](../README.md)，統計學教材的編輯方式見 [CONTENT.md](CONTENT.md)。

## 目錄

```
web/                                網站(部署時整個資料夾就是網站根目錄)
  index.html                        外框，在此依序載入框架與訪客也能看的模組 <script defer>(平行下載、依序執行)；會員區塊的程式登入後才由 app.js 載入。
                                    <base href="/"> 是網站根目錄(所有網址都寫相對路徑)；標題、說明、分享預覽(og:)是部署時產生各頁 HTML 的範本
  assets/
    js/app.js                       框架：側欄區塊 SECTIONS、頁面註冊、路由(一般網址，見「網址」)、麵包屑、分頁元件 LT.tabs、目錄頁 LT.catalog、資料載入、會員區塊的鎖與登入畫面
    js/auth.js                      Google 登入(不用 Firebase SDK)：Google OAuth → Firebase REST → api/session 發 cookie；api/me 取得身分
    js/firebase-config.js           Firebase 與 Google 登入的設定(apiKey、projectId、clientId，都是公開資訊)
    js/chart.js                     共用 SVG 圖表 LTChart.line / LTChart.bars(跟隨主題與寬度、滑鼠提示)
    css/components.css、layout.css  色彩變數(暗色/淺色)與元件樣式、版型
    vendor/                         第三方套件(放在本站以符合 CSP)：marked(Markdown)、KaTeX(公式)
    img/logo.svg                    吉祥物「小K」；img/og.png 是分享到 LINE、FB 時的預覽圖(1200×630)
  modules/
    home/home.js                    首頁：近期更新、各區塊入口、各資料集更新狀態
    indices/core.js … render.js     指數：大盤漲跌分析、K棒型態分析，拆成 7 個檔、共用全域變數(順序不能換，見 index.html)：
                                    core(常數、state、均線、多空定義)、patterns(K棒型態偵測)、events(急跌反彈偵測、資料載入)、
                                    kchart(K 線圖)、myth(常見迷思)、cycle(週期性分析)、render(畫面與註冊)
    indices/futures.js              指數：台指期貨(轉倉、結算日曆；用到 option/lib.js)
    etf/lib.js                      ETF 共用(window.LTETF)：格式化、報酬統計、滾動期間比較、配息課稅試算、載入常存 ETF 資料(etf_compare)
    etf/pack.js                     ETF：ETF大禮包(目錄頁：ETF介紹、怎麼存ETF、即將發行ETF 三個子主題，網址 etf/pack/<子主題>；舊網址 etf/intro、etf/save、etf/upcoming 轉過來，更早的 etf/pack/<研究> 轉到 ETF研究)
    etf/intro.js                    ETF：ETF大禮包 › ETF介紹
    etf/save.js                     ETF：ETF大禮包 › 怎麼存ETF(常存 ETF 比較、配息課稅試算、0050 vs 勞退基金)
    etf/research.js                 ETF：ETF研究(目錄頁：投資方式、主動式 ETF 分組的研究卡片；A 系列 ETF 跟單用資料集 etf_research，績效統計共用 tw-strategy.js 的 LTTW)
    etf/etf.js                      ETF：ETF大禮包 › 即將發行ETF
    stock/disposition.js            股票 · 台股：處置股(目錄頁：處置股介紹 = 處置條件與處置措施、新制說明、處置期間表現，資料集 disposition；處置股策略 = 回測與報告，資料集 tw_research 的 disp.json，畫面在 tw-research.js 的 LTTWR.disp)
    stock/tw.js                     股票 · 台股：隔日沖(建置中)
    stock/tw-strategy.js            股票 · 台股：策略回測(目錄頁：做多、做空分組的策略卡片；做多：低波動選股、融資都沒退，算我輸嗎(需要密碼)；做空：大盤跌個股逆勢漲就是欠踹；一律和 0050 比較；資料集 tw_strategy)；績效統計與圖表函式以 window.LTTW 共用給 tw-research.js
    stock/tw-research.js            股票 · 台股：其他研究(目錄頁：營收、因子、事件、機器學習分組的研究卡片；同一系列同一個顏色；回測結果＋報告 Markdown；資料集 tw_research)
    stock/earnings.js               股票 · 美股：財報行事曆
    stock/us-strategy.js            股票 · 美股：策略(目錄頁)；S&P500 季度換股策略回測(單一策略頁裡選總覽或單一策略；資料集 sp500)
    stock/query.js                  股票 · 台股：股票查詢(不列在側欄，從 LOGO 下方的搜尋框或代號連結進入；K 線圖、法人、融資券、借券、月營收與除權息等事件；api/prices，資料在 Cloudflare D1)
    admin/admin.js                  後台(other/admin，只給管理員，不列在側欄)：最受歡迎的主題、登入用戶分析、分享紀錄、誰在查資料、熱門股票、API 用量與效能
    option/lib.js                   選擇權共用：Black-Scholes、Greeks、策略定義 STRATEGIES、資料載入、結算日曆
    option/calculator.js            Black-Scholes 計算器元件(在市場概況的分頁裡顯示)
    option/market.js                選擇權市場概況(市場指標、T 字報價與未平倉、Black-Scholes 計算器三個分頁)
    option/strategy.js              策略損益圖
    stats/basic.js                  初級統計學(章節設定、互動模擬、台股實例；內容在 content/)
    stats/stats.js                  計量(建置中)
    other/other.js                  好用推薦(依 CATS 分類：新聞與行事曆、研究與分析、工具與追蹤)
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
  run_local.py                      本機資料集(tw_strategy、disposition、tw_research 的處置股策略、etf_compare)：等 cm 同步 → 更新 → 發佈到 data 分支 → 觸發一次部署；失敗時跳 Windows 通知
  tw_research/update.py             台股其他研究：用本機 PostgreSQL(日資料、月營收、公告股本)計算各研究的淨值、交易統計與報告(報告範本 tw_research/reports/<研究>.md，依 CLAUDE.md「研究報告」的結構，數字由程式填入；進出場、成本與資金模擬共用 tw_strategy/events.py；只在本機手動執行)
  etf_research/update.py            「ETF研究」的資料檔：把本機研究資料夾(A 系列 ETF 跟單，預設 ~/Desktop/ETF_PANEL/CLAUDE/A系列ETF跟單，環境變數 ETF_FOLLOW_DIR 可改)輸出的淨值、交易統計、統計表與報告轉成 JSON；網頁版報告依「研究報告」結構重新編排，存在 etf_research/reports/etf_follow.md(有這份就用這份，研究數字改變時要同步更新)；研究結果不每日更新，只在本機手動執行
  sp500/update.py                   S&P500 季度換股回測：歷史成分股(fja05680/sp500)、Yahoo Finance、Tiingo(已下市公司)
  price_query/sync.py               股票查詢的資料：cm schema → Cloudflare D1(本機執行，只上傳有變動的部分)

functions/                          Cloudflare Pages Functions(後端，只在 Cloudflare 主站運作)
  _lib/access.json                  權限設定(唯一的設定處)：會員限定的區塊、頁面程式、資料集，以及後台程式
  _lib/auth.ts                      Firebase ID token 驗證、會員 session cookie、訪客 id
  _lib/types.ts                     環境變數、股票查詢的期間與每日額度 POLICY
  _lib/security.ts                  API 的資安防護：來源檢查(CORS)、安全標頭、每分鐘次數限制
  api/                              me(目前身分)、session(登入)、logout、track(頁面瀏覽紀錄)、share(分享連結)、symbols、prices(股票查詢)、admin/stats(後台)；_middleware.ts 辨識身分並寫查詢日誌
  data/_middleware.ts               會員限定的資料集只給會員(meta.json 公開)
  modules/_middleware.ts            會員限定的頁面程式只給會員、後台程式只給管理員
migrations/                         D1 資料表(users、guest_links、query_logs、page_views、share_links、share_views、usage_daily、rate_minute、symbols、price_chunks、meta)
scripts/build-site.mjs              部署前產生 _routes.json(只有需要檢查的路徑經過 functions)、各頁面的 HTML(標題與分享預覽)、sitemap.xml、GitHub Pages 的公開版
scripts/site-map.mjs                在 Node 裡載入頁面程式，列出所有頁面與網址(build-site.mjs 與自動測試共用)
scripts/check-freshness.mjs         本機排程的資料多久沒更新(check-local.yml 呼叫)
scripts/share/                      研究的 IG 圖卡(本機執行)：make-share.mjs 產生 IG/<研究>/1～5.png；ig-card.mjs 是圖卡版面、ig-topics.mjs 是各研究的圖卡內容
tests/                              自動測試(npm test，node:test)：site(頁面註冊、權限清單、defer、外部腳本、#/ 舊網址)、build(部署流程)、functions(來源檢查、會員權限)
wrangler.toml、package.json         Cloudflare 設定(D1 綁定、Firebase 專案 ID)與本機開發工具(wrangler、jose；esbuild 給自動測試打包 functions/)

.github/workflows/
  _dataset.yml                      共用流程：update.py → publish_data.sh → deploy
  data-<資料集>.yml                  各資料集的排程，只呼叫 _dataset.yml
  deploy.yml                        自動測試 → 組合 web/ 與 data 分支 → Cloudflare Pages(完整版＋functions/)＋ GitHub Pages(公開版)；測試沒過就不部署
  check-local.yml                   本機排程檢查：台北週二~六 14:00 檢查本機資料集與股票查詢的更新時間，停更就失敗(GitHub 寄信)
```

## 資料怎麼流動

1. `data-<資料集>.yml` 依排程觸發 `_dataset.yml`。
2. 執行 `pipeline/<資料集>/update.py`，輸出到 `web/data/<資料集>/`，一定包含 `meta.json`(更新時間、來源、排程、version)。
3. `publish_data.sh` 只替換 data 分支裡該資料集的資料夾。data 分支永遠只有一個 commit。
4. 呼叫 `deploy.yml`：`web/` ＋ data 分支 → `_site/` → 同時發佈到 Cloudflare Pages 與 GitHub Pages(見「部署」)。推送到 main 也會觸發部署(沿用 data 分支現有資料)。

網頁端用 `LT.loadJSON(資料集, 檔名)` 載入資料，網址帶 `meta.version`，資料沒更新前瀏覽器直接用快取。網頁不顯示資料來源與更新排程(統計學教材的參考資料、ETF介紹、怎麼存ETF、ETF研究的資料來源除外；頁尾固定寫「資料來源：臺灣證券交易所、證券櫃檯買賣中心、臺灣期貨交易所、公開資訊觀測站、臺灣集中保管結算所」，在 `index.html`)；`meta.json` 的來源、更新時間、排程只留在資料裡供維護參考。

## 部署

同一份 `_site/` 發佈到兩個地方：

| 網址 | 角色 | 部署方式 |
|---|---|---|
| https://little-trader.pages.dev/ (Cloudflare Pages，專案 `little-trader`) | 主要網址：完整版＋後端(登入、會員權限、股票查詢) | `deploy.yml` 的 `cloudflare-pages` 工作，在 repo 根目錄用 wrangler 直接上傳(Direct Upload)，一起上傳 `functions/` |
| https://rebornlife0218.github.io/little-trader/ | 備援，保留不刪：公開版(沒有後端、不能登入，會員區塊顯示「到主站登入」) | `deploy.yml` 的 `github-pages` 工作，用 `scripts/build-site.mjs` 拿掉會員限定的程式與資料 |

- 觸發點不變：推送到 main、資料集排程、`run_local.py`(`gh workflow run deploy.yml`)都會一次部署兩邊。只改網站內容的話，照舊 commit + push 即可，不用碰 Cloudflare。
- 部署前先跑自動測試(`deploy.yml` 的 `test` 工作，同本機的 `npm test`)，沒過就不部署；改程式後 push 前請先在本機跑 `npm test`。
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
| 訪客 | 指數、選擇權、統計學、其他 |
| 登入 Google(程式裡稱 member) | 全部；設有密碼的策略仍要另外輸入密碼(JSON 整份加密，不受登入影響) |
| 管理員(`users.role = 'admin'`) | 另外有後台 `other/admin`；後台統計(含分享紀錄)不計入管理員與測試帳號(`functions/_lib/exclude.ts`：管理員，以及列在裡面的 email；repo 公開，只放 email 小寫的 SHA-256)，連同這些帳號登入前在同一個瀏覽器用訪客身分的紀錄(登入的人開網頁時把瀏覽器的訪客代號記到 `guest_links`)；這些帳號點開分享連結也不算點開次數 |

**怎麼運作**

- 登入(`assets/js/auth.js`)：轉到 Google 登入頁 → 回來時用 Firebase REST API(`accounts:signInWithIdp`)換成 Firebase ID token → `POST api/session`，後端驗證 token(`jose`，Google 公開金鑰)後發 `lt_sess` cookie(HttpOnly、HMAC 簽章、30 天)。不用 Firebase SDK，因為它會從 Google 載入外部腳本，違反 CSP 只允許同源的規則；CSP 只為登入多開 `connect-src https://identitytoolkit.googleapis.com`。
- 開網頁時 `app.js` 先呼叫 `api/me`：會員才拿到會員區塊的程式清單並載入；訪客在側欄與首頁看到「🔒 登入 Google 看更多」，點進去是登入提示(網頁上不用「會員」這個詞)。第一次來訪會跳出「用 Google 登入 / 以訪客身分繼續瀏覽」(選訪客會記在 localStorage `lt.guest`，不再詢問；這個標記只控制畫面)。
- 真正的權限在後端：`functions/data/_middleware.ts`、`functions/modules/_middleware.ts` 擋訪客下載會員限定的資料與程式(回 401)，畫面上的鎖只是提示。
- 權限清單只寫在 `functions/_lib/access.json`：後端檢查、部署時的 `_routes.json`、GitHub Pages 公開版、網頁要載入的程式都從這裡來。
  - **新增會員區塊的頁面**：程式放在 `web/modules/<區塊>/`，路徑加到 `memberScripts`(依側欄順序，同一小組要連續)，**不要**寫進 `index.html`。
  - **新增會員限定的資料集**：名稱加到 `memberDatasets`。
  - 要把整個區塊改成公開或會員限定：改 `memberSections`，並把該區塊的程式在 `index.html` 與 `memberScripts` 之間搬動。
- 頁面瀏覽紀錄：每次換頁網頁送一筆 `POST api/track`(區塊、頁面、是否登入、訪客是否被擋在需要登入的區塊)，存在 `page_views`；頁面裡切換分頁、研究、下拉選單時，頁面呼叫 `LT.view(第一層, 第二層, 第三層)` 再記一筆細項(`l1`～`l3`，例如 ETF研究 › 主動式ETF › A 系列 ETF 跟單)，0.6 秒內連續切換只記最後停下來的畫面。後台的「最受歡迎的主題」是可一層一層展開的樹狀表：區塊 › 頁面 › 細項，區塊與頁面算進入次數，細項算切換次數(上層是底下所有細項的加總)。同一頁重新整理會再記一筆。後台的「登入用戶分析」列出登入用戶最常看的主題(依人數)與每位會員看了哪些主題(主題 = 頁面 › 看到的最深一層細項，只算登入後的瀏覽)；Google 登入只拿 email 與名稱(scope `openid email profile`)，沒有年齡、性別。`api/track` 有自己的每分鐘上限 30 次(`PER_MINUTE_TRACK`)，不佔一般 API 的額度。
- 每個 `/api` 請求都寫一筆 `query_logs`(`/api/me`、`/api/track` 除外)：會員 uid 或訪客 id、股票代號、查詢期間、狀態碼、耗時、IP、國家、User-Agent。日誌含個資(IP、email)，要定期清理(例如保留 180 天)：`npx wrangler d1 execute little-trader --remote --command "DELETE FROM query_logs WHERE ts < datetime('now', '-180 days'); DELETE FROM page_views WHERE ts < datetime('now', '-180 days'); DELETE FROM usage_daily WHERE day < date('now', '-30 days')"`。
- API 的資安防護(`functions/_lib/security.ts`，由 `api/_middleware.ts` 套用到所有 `/api`)：
  - **來源檢查(CORS)**：只有 `wrangler.toml` 的 `ALLOWED_ORIGINS`(目前是 `little-trader.pages.dev` 與本機開發)能從瀏覽器呼叫；`Origin` 不在清單內、或 `Sec-Fetch-Site: cross-site` 一律 403，連登入、登出的 POST 也擋(順便防 CSRF)。允許的來源才回 `Access-Control-Allow-Origin`(是那個來源本身，不是 `*`)。綁自己的網域時要加進 `ALLOWED_ORIGINS`。CORS 只擋得了別人的網頁，擋不了程式直接呼叫，那部分靠次數限制。
  - **每分鐘次數限制**：訪客每個 IP 10 次、會員每個帳號 60 次(`PER_MINUTE`)，超過回 429 與 `Retry-After`；`api/me`、`api/logout` 不計。用 D1 的 `rate_minute` 原子計數(Workers 的記憶體不共用、KV 不即時，都算不準；Pages Functions 不能直接用 Durable Objects)。另外股票查詢還有每日額度(`POLICY`)。
  - **需要登入的資料檔也限流**：`data/<需要登入的資料集>/` 每個帳號每分鐘最多 100 個檔(`PER_MINUTE_DATA`，`functions/data/_middleware.ts`)，防止登入後用程式整批下載；頁面程式(`modules/`)與 `meta.json` 不計。公開區塊的檔案(指數、選擇權資料等)沒有限流，由 Cloudflare CDN 提供。
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
7. 第一次上傳股價：`python pipeline/price_query/sync.py`(約 92 MB，之後每天由 `run_local.py` 只上傳變動的部分)。
8. 推送後部署，用 Google 登入一次，再把自己設成管理員：
   `npx wrangler d1 execute little-trader --remote --command "UPDATE users SET role = 'admin' WHERE email = '你的 Gmail'"`

**本機測試**：`npm run dev` 開 http://localhost:8788(含 functions 與本機 D1)。本機的 `SESSION_SECRET` 寫在 `.dev.vars`(不進版控)；本機 D1 要先 `npm run db:migrate:local`、`python pipeline/price_query/sync.py --local`。

## 股票查詢

- 網頁：左側 LOGO 下方的搜尋框(`app.js` 的 `initSearch`，輸入代號或名稱，Enter 或選建議清單)跳到 `stock/query/<代號>`(`modules/stock/query.js`，登入 Google 才能用；不列在側欄)。查詢頁也可以改代號、選期間：
  - 標題列：代號、名稱、上市／上櫃／創新板、股本(億元，實收資本額；ETF 沒有股本)。
  - K 線圖(canvas)：左上角切換原始價、還原價(開高低乘上當天的還原收盤價 ÷ 收盤價)；5、20、60MA；點一下出現十字線(左側價格軸標收盤價)，資訊列列出開高低收、各 MA(後面 ↑↓ 是當天斜率)、成交量、外資與投信買賣超、融資券餘額、借券賣出餘額、當天的事件；滾輪縮放、拖曳平移、← → 移動。為了讓 60MA 從第一天就有值，查詢時多抓前 120 個日曆天(圖一開始只顯示查詢期間)。
  - 事件：月營收在公告日的 K 棒上方畫小菱形(紅色 = 單月營收年成長、綠色 = 年衰退，點 K 棒在資訊列看年成長 %)；「息」除權息、「分割」分割或減資、「停」暫停交易標在 K 棒下方；處置期間畫淡色底。
  - 下方小圖(可隱藏)：成交量、外資買賣超、投信買賣超、融資餘額、融券餘額、借券賣出餘額(都是張)。
  - 統計卡(最新收盤、含息報酬、年化、外資與投信累計買賣超)。
  - 從其他頁面連過來：網址 `stock/query/<代號>` 會直接查這一檔(換代號時網址跟著改，可以分享)，上方出現「← 返回(原頁面)」按鈕，按了回到原本的頁面與捲動位置。
- 資料：`cm.tw_daily` 2016 年起所有有成交的日子(上市櫃股票與 ETF，含已下市櫃)：開高低收(原始價格)、還原收盤價、成交量、外資與投信買賣超、融資(`資餘`)與融券(`券餘`)餘額、借券賣出餘額，單位都已用 2330 核對(都是張)。事件來自 `cm.tw_monthly_revenue`(公告日、單月合併營收年成長，沒有合併數字時用單月營收)、`cm.tw_trading_halt`、`cm.tw_disposition`；除權息、分割或減資沒有現成欄位，由「還原收盤價 ÷ 收盤價」的跳動推算(超過四捨五入誤差才算；跳動超過 25% 視為分割或減資)，日期對到該股票的交易日(公告日沒交易就放在下一個交易日)。名稱、市場、股本來自 `cm.tw_company_info`(上市上櫃代碼：1 上市、2 上櫃、7 創新板)；資料庫沒有 ETF，改用證交所(上市)、櫃買中心(上櫃)當天的收盤行情補名稱與市場(累積在 `~/.cache/little-trader/etf_names.json`)。
- 儲存：D1 的 `price_chunks` 每檔每年一筆(gzip 的 JSON，欄位與事件都在裡面)，全部約 2.2 萬筆、92 MB；查 10 年只讀約 11 列。
- 同步：`pipeline/price_query/sync.py` 每次在本機重算全部，只上傳內容有變的區塊(新的交易日、除權息後整段還原股價改變、資料修正)；已上傳的內容記在 `~/.cache/little-trader/d1_prices.json`，刪掉就會全部重傳(約 4 分鐘)。`run_local.py` 每天在 cm 同步後執行。
- 權限與額度(`functions/_lib/types.ts` 的 `POLICY`)：登入 Google 不限期間、每天 1000 次；訪客最近 31 天、每天 30 次(查詢頁只開放登入的人，訪客的限制是 API 的保險)。額度以台北日期計，登入的人依帳號、訪客依 IP；另有每分鐘上限(見「會員與權限」)。

## 資料集

| 資料集 | 來源 | 排程(台北) | 主要檔案 |
|---|---|---|---|
| indices | Yahoo Finance、臺灣證券交易所 | 週一~五 05:30、15:30 | 每個指數一個 JSON(`d/o/h/l/c/v` 陣列)；另有 `TAIEX_TR.json`(發行量加權股價報酬指數，含股息，2003 起，`d/c`；不列在指數頁，給怎麼存ETF、ETF研究的長期回測) |
| etf_upcoming | MoneyDJ 新基金一覽表 | 週一~五 08:30、17:30 | `upcoming.json` |
| etf_compare | 勞動基金運用局；台股 ETF 股價：本機 PostgreSQL `cm.tw_daily`(2016 年起)，之前用 Yahoo Finance(0050、0056、006208，從上市日起)；ARKK：Yahoo Finance；臺灣證券交易所(除權除息計算結果表) | 週一~五 23:45、週二~六 12:15(本機排程) | `compare.json`(每月：勞退基金報酬、0050 價格與總報酬，用下面每日資料的月底值)、`etfs.json`(常存 ETF 與 ARKK 的每日收盤、股利再投入還原股價、每股配息；排除沒有成交的日子；台股 ETF 的還原股價用證交所除息資料自己算，Yahoo 的還原股價缺 2013 年以前的配息、2014 年的除息也算錯) |
| earnings | Nasdaq Earnings Calendar | 每天 07:30、20:00 | `earnings.json`(上週、本週、下週每天的公司、盤前/盤後、預估與實際 EPS、驚喜幅度) |
| disposition | 本機 PostgreSQL `cm.tw_disposition`(處置名單)、`cm.tw_daily`(股價)；櫃買中心(櫃買指數) | 週一~五 23:45、週二~六 12:15(本機排程) | `events.json`(2026/7 起每個處置事件：期間、新制/舊制、處置第一天的開收(網頁算處置後第一天報酬 = 開盤 → 收盤)、處置前 5 日、處置期間、出關後 5 日與同期大盤報酬) |
| tw_research | 本機 PostgreSQL `cm.tw_daily`、`cm.tw_monthly_revenue`、`cm.tw_company_info`、`cm.tw_disposition` | `disp.json` 週一~五 23:45、週二~六 12:15(本機排程)；其他研究不定期(研究更新時手動執行) | 每個研究一個 JSON：`rev_pre.json` 營收公告前布局(不限市值與市值四分位 Q1～Q4 的前 10、前 5 檔與全部合格股票淨值、交易統計、進場日敏感度、綜合分數十分位、因子 IC)、`rev_growth.json` 營收成長特徵(3 種持有期 × 3 種分數組合的淨值與持有檔數、特徵 IC t 值、公告前後累積超額報酬)、`rev_drop.json` 營收衰退開低(日內 / T+1 × 全部 / 均額 ≥ 1 千萬的淨值與持有檔數、分組報酬)、`disp.json` 處置股策略(處置第一天收盤買進「融資使用率 ≥ 20%、投信持股比率近 20 日增加」的處置股、處置結束後一天開盤賣；`strat` 是主策略，回測期間是新制 2026/8/10 起，含淨值、持有檔數、交易統計與交易明細(條件欄位見 `cols`)；`upcoming` 是已公告、還沒開始且符合條件的處置；報告另含 2016 年起的融資門檻 × 有沒有投信條件 × 兩種出場的敏感度、依融資使用率／投信持股增減／處置措施／新舊制分組的每筆報酬；資金是使用者指定的例外：有新股票進場時總資產平均分散到所有持股、不設上限，收盤進場的模擬寫在 update.py 的 disp_simulate；用 `cm.tw_disposition` 與 `cm.tw_daily` 的 `資使用率`、`投信持股比率(%)`)、`rev_turn.json` 營收由負轉正(5 日 / 10 日 / 20 日 × 各種門檻與持續成長對照組的淨值與持有檔數、四種營收變化的累積超額報酬與每筆報酬)；都含 `d`(日期，第一天 = 期初)、`b0050`(0050 淨值)、`report`(報告 Markdown，不含建議)；淨值期初 = 1，本金 100 萬整數股、已扣成本，資金規則同 tw_strategy(有新股票進場時再平衡；寫明檔數的用 1/N 上限)。不發佈 csv、png 與原始股價 |
| etf_research | 本機研究資料夾(ETF持股明細、ETF折溢價、台股日資料) | 不定期(研究更新時手動執行) | `etf_follow.json` A 系列 ETF 跟單：`d`(日期，第一天 = 期初)、`b0050`(0050 淨值，報告的總報酬圖用)、`b0050s`(每組訊號自己的 0050，期初和該組策略相同)、`strats`(模式 × 範圍 × 出場的策略：從第一個訊號前一天 `i0` 開始的淨值(期初 = 1，本金 100 萬整數股、已扣成本)、交易統計 `ts`、每日持有檔數 `npos`)、`etfs`(10 檔 ETF 與持股資料起點)、報告用的統計表(`holding` 持有期、`by_etf` 各檔、`consensus` 多家同時、`entry` 進場時點、`flow` 申贖調整、`ex81` 拿掉 00981A、`cexit` 多家同時的出場規則：每筆平均超額報酬與日期聚類 t 值)、`report`(報告 Markdown)。網頁的夏普值用日報酬平均 ÷ 標準差 × √252(研究指定)。不發佈 csv、png 與原始股價 |
| sp500 | fja05680/sp500 歷史成分股、Yahoo Finance、Tiingo | 週二~六 07:00(美股每個交易日收盤後) | `backtest.json`(四種策略、全部成分股等權重、SPY 的每日淨值(未扣成本)；每季的成分股數、可取得股價數、換手率、無風險利率、持股) |
| options | 臺灣期貨交易所 期貨、選擇權每日交易行情、三大法人 | 週一~五 06:00、16:00 | `history.json`(每日 30 天 IV、P/C 比)、`chain.json`(最新 T 字報價)、`futures.json`(台指期近月走勢、三大法人淨未平倉、各月份契約)、`spot.json`(加權指數近 300 日收盤，選擇權頁面用) |
| tw_strategy | 本機 PostgreSQL `cm.tw_daily`(台股日資料) | 週一~五 23:45、週二~六 12:15(本機排程) | `backtest.json`(低波動 10 檔、低波動 10%、全部合格股票等權重、0050 的每日淨值(本金 100 萬、整數股，已扣手續費、交易稅、滑價)；每日持有檔數 `npos`、交易統計 `tstat`(筆數、勝率、平均與中位數報酬、平均持倉天期)；每月換股日、合格股票數、換手率(買賣合計)；最新一次選股的持股)；事件型策略各一個 `<策略>.json`(`margin` 融資都沒退(加密：`{enc: {iter, salt, iv, ct}}`，解密後另含網頁說明 `info`)、`against` 大盤跌個股逆勢漲、`rev20` 月營收年增率長期以來第一次破20%(做多，另讀 `cm.tw_monthly_revenue` 與 `cm.tw_daily` 的 `買分價家數`、`分價買張1～5`、`分價賣張1～5`)、`boss` 老闆回頭發動了(做多，另讀 `cm.tw_open_close_vol` 的開盤量(2020/3/2 起，回測從 2020/3 開始)與 `cm.tw_daily` 的外資買賣超、買／賣分價家數、資買、券增減、券買)：每日淨值(已扣成本、未扣借券費)、0050 淨值、持有檔數、做空另有每天放空比例 `expo`(網頁扣借券費)、每筆交易(含漲跌停延後天數、持有日曆天數)、進不了場而放棄的訊號 `skipped`、連一股都買不起而放棄的筆數 `nocash`(有新股票進場時所有部位再平衡到 min(上限, 1/持有檔數)，現金不夠時新股票平分剩下的現金)、每筆資金上限 `cap`、最近 20 個交易日的選股與欄位) |

增量更新：證交所與期交所一次只能查一個月，所以 indices 與 options 都用 `common.load_published()` 讀回 data 分支上的舊檔，只補最近的資料；沒有舊檔時才完整回補(options 回補 1 年)。

本機資料集(tw_strategy、disposition、tw_research 的處置股策略、etf_compare)：
- 資料庫在本機(localhost:9457)，GitHub Actions 連不到，所以沒有 `data-<資料集>.yml`；由 Windows 工作排程器「LittleTrader_local」在 cm 同步(`CM_PostgreSQL_Sync`：週一~五 23:30、週二~六 12:00；台股日資料約 21:30 進 repo)之後以 `pythonw.exe` 執行 `pipeline/run_local.py`，cm 同步還在跑會先等它結束。不能用 Git Bash：電腦睡眠(新式待命)時排程會在背景執行，msys 的 bash.exe 在這個狀態下啟動失敗(0xC0000142)，所以發佈步驟(同 `publish_data.sh`)在 run_local.py 裡用 Python 呼叫 git.exe。輸出記錄在 `~/.cache/little-trader/local.log`。
- 失敗通知：run_local.py 有資料集失敗時跳出 Windows 通知(睡眠中錯過的留在通知中心)；電腦沒開、排程根本沒跑時，由 GitHub 的「本機排程檢查」(`check-local.yml`，台北週二~六 14:00)發現：本機資料集的 `updated_at` 超過 20 小時沒更新，或股票查詢 D1 的 `meta.last_date` 比 tw_strategy 的 `asof` 舊，workflow 就失敗，GitHub 會寄信(帳號 Settings › Notifications › Actions 要開失敗通知)。Cloudflare 金鑰沒有 D1 讀取權限時，股票查詢那項只顯示警告、不算失敗。
- 兩個排程都設定「喚醒電腦執行」與「錯過時間就補跑」(2026-10-17 實測)：插電睡眠時會在背景準時執行、螢幕不會亮，執行完自動回到睡眠；用電池時，從開始功能表選「睡眠」後排程不會執行，要等下次喚醒電腦才補跑(補跑正常)；但閒置自動關閉螢幕(Windows 記為「閒置逾時」進入新式待命)時，程式與排程都照常執行。所以本機的電源設定為：睡眠「永不」、閒置關閉螢幕(電池 5 分鐘、插電 10 分鐘)、電源鍵 =「關閉顯示器」、闔上螢幕 =「不執行任何動作」；離開時按電源鍵或放著讓螢幕自己關，不要選睡眠。建立排程時要取消「只在插電時才啟動」(`New-ScheduledTaskSettingsSet` 預設是勾選的)。
- 連線(`common.pg_connect()`)用環境變數 PGHOST/PGPORT/PGUSER/PGDATABASE(有預設值)，密碼由 libpq 讀 `%APPDATA%\postgresql\pgpass.conf`，不進 repo；需要 `psycopg`(只有本機需要，不在 requirements.txt)。
- 處置股的加權指數讀 data 分支的 `indices/TAIEX.json`(證交所資料，GitHub Actions 每天 15:30 更新)。
- 只發佈回測結果，不發佈原始股價。
- etf_research(ETF研究)不在排程裡：研究在本機的研究資料夾計算(不在 repo 內)，研究改版後執行 `python pipeline/run_local.py etf_research`(轉檔、發佈到 data 分支並重新部署)。
- tw_research(台股其他研究)：`pipeline/tw_research/update.py` 直接用本機 PostgreSQL 計算(規則同 tw_strategy，共用 `events.py`)，報告文字在 `pipeline/tw_research/reports/`。處置股策略(`disp.json`)每天在排程裡重跑(run_local.py 的 `tw_research:disp`，處置股更新之後)，策略頁才能列出已公告、隔天要進場的處置股；其他研究不在排程裡，研究更新後手動執行 `python pipeline/run_local.py tw_research`(全部重跑、發佈到 data 分支並重新部署)。發佈時是整個 `web/data/tw_research/` 資料夾，每天只重跑 disp 時其他研究沿用本機上次算好的檔案；本機排程檢查(`check-local.yml`)也檢查 tw_research 的 `updated_at`。
- 台股回測的規則(進出場、漲跌停、資金分配、交易成本、績效指標)以根目錄 `CLAUDE.md` 的「選股回測原則」為準，實作在 `events.py`(事件型)與 `update.py`(低波動，共用 events.py 的成本與漲跌停函式)；績效統計在網頁 `tw-strategy.js` 的 `stats`、`tradeStats` 計算。

sp500 的特殊處理：
- 已下市、被併購公司的股價 Yahoo 沒有，改用 Tiingo(需要 API 金鑰：本機放在 `~/.tiingo_key`，GitHub Actions 用 Secret `TIINGO_API_KEY`；`data-sp500.yml` 要 `secrets: inherit`)。Tiingo 的原始股價只快取在本機 `~/.cache/little-trader/tiingo/`，**不發佈**(授權不允許轉載)，data 分支只放回測結果。
- 完整重算(從 2000 年)只在本機執行：`python pipeline/sp500/update.py --full`(加 `--offline` 只用快取)；免費方案每小時 50 次請求，第一次下載約 3～4 小時。
- 每週的增量更新讀回已發佈的結果，從倒數第 3 季重算並接上，最近的成分股 Yahoo 幾乎都有，偶爾才需向 Tiingo 查幾檔。
- Yahoo 的代號可能已被別家公司沿用(例如 EP 原為 El Paso，現在是 Empire Petroleum)：成分股期間每日成交金額中位數低於 200 萬美元就視為沿用，改找 Tiingo。

## 新增頁面

在 `web/modules/<區塊>/` 新增 JS，並在 `web/index.html` 的「研究模組」處加上 `<script defer src="...">`(一律加 defer，網頁才會平行下載、不會卡住畫面)。會員區塊(ETF、股票)的頁面改加到 `functions/_lib/access.json` 的 `memberScripts`，不寫進 `index.html`(見「會員與權限」)：

```js
LT.register({ section: 'etf', key: 'x', name: '外部網站', href: 'https://...' });       // 側欄直接開新分頁
LT.register({ section: 'stock', key: 'disposition', name: '處置股', desc: '一句話說明' }); // 建置中頁面(沒有 mount)

LT.register({
  section: 'stock',            // 區塊 key(app.js 的 SECTIONS)
  key: 'my-study',             // 網址：stock/my-study
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
- **目錄頁(研究、策略這類「一份一份」的內容)**：用 `LT.catalog`，不要自己寫類別按鈕和下拉選單：

  ```js
  LT.catalog({
    section: 'stock', group: '台股', key: 'tw-research', name: '其他研究', title: '台股其他研究', desc: '一句話說明',
    groups: [{ name: '營收', desc: '分組說明', items: [
      { key: 'rev_pre', name: '營收公告前布局', desc: '卡片上的一句話', tags: '(選填，卡片下方的小字)', run: (el, ctx) => { ... } },
      { key: 'x', name: '還沒做好的', soon: true },
    ] }],
  });
  ```

  項目可以加 `summary`(研究的先講結論精簡版，不寫會隨資料變動的數字)：分組裡有 summary 時改成條列，標題下面直接寫結論。研究內容畫完後，報告開頭的先講結論(`> **先講結論**：…`)如果不在第一個區塊，會自動搬到內容最上方(app.js 的 `hoistConclusion`)。

  `<區塊>/<頁面>` 是分組的卡片列表，`<區塊>/<頁面>/<項目>` 是單一內容(上方的麵包屑可以回到列表，可分享、加書籤)；`run(el, ctx)` 畫內容，`ctx.alive()` 同一般頁面，內容裡還有分頁時呼叫 `ctx.view('分頁名稱')`。後台的熱門主題自動記到「分組 › 項目」。目前用在 ETF研究、台股其他研究、台股策略、美股策略。
- **研究與策略的精簡版**：每份研究、策略的內容最上方用 `LT.brief({ hero, items, chart })` 產生精簡版：先講結論 → 策略說明(`items`：邏輯、進出場、停利停損、持有期間，研究可改成「怎麼比較、資料、期間」，每項一兩句、不用術語；邏輯的小卡佔兩格寬，第三項之後合併成一張) → 績效卡片(`stats`，前 3 張依序是勝率、總報酬、年化報酬；手機只顯示勝率、總報酬、年化報酬、最大回撤，其餘按「顯示更多績效」展開。用 `LTTW.card(…, key = true)` 標記手機要顯示的卡片(`.stat.key`)；沒有標 key 的卡片組，手機只顯示前 4 張) → 累積報酬與回撤圖(容器 id = `chart`，圖例 = `chart + 'Legend'`，由頁面自己畫，通常是主要版本 vs 0050) → 策略的近期明細(`recent`，用 `LT.moreTable(容器, 表頭, 列, 20)` 先顯示最新 20 筆、按鈕展開)。下面才是完整報告；兩者之間由樣式區隔(漸層底色、漸層分隔線)，網頁上不寫說明文字。先講結論由網頁產生時放進 `hero`，否則報告開頭的 `> **先講結論**` 會自動放進來。每天自動更新的策略傳 `updated: '<資料集>'`，精簡版右上角顯示該資料集 `meta.json` 的最近更新時間(月/日 時:分；台股策略 tw_strategy、處置股策略 tw_research、美股策略 sp500)。
- **股票代號連結**：表格裡的台股代號用 `LT.stockLink(代號, 顯示文字)`，點了跳到股票查詢並直接查那一檔，查詢頁有按鈕可以跳回來(目前用在處置股、策略)。
- **後台熱門主題的完整清單**：後台的「最受歡迎的主題」會先列出網站上所有主題(還沒人看過的顯示 0)，來源是側欄的頁面、目錄頁的分組與項目，以及註冊時的 `topics`(頁面裡的分頁、指數、章節等子項目，字串或 `{ name, items }`，名稱要和 `LT.view` 記錄的一樣；目錄頁的項目也可以加 `topics`)。新增分頁或子項目時記得一起加。
- **後台的熱門主題細項**：頁面裡有分頁、下拉選單時，在切換的地方呼叫 `LT.view('分頁名稱', '類別', '研究名稱')`(最多三層，名稱用畫面上看到的文字)，後台就能一層一層看各細項的瀏覽次數。目錄頁會自動記錄；其他頁面目前用在選擇權市場概況(分頁)、大盤漲跌分析與 K棒型態分析(模式 › 指數)、初級統計學(章)，以及目錄頁裡的低波動選股、美股策略(分頁)。
- **頁面裡的分頁**：用 `LT.tabs`，不要自己寫按鈕：`const tabs = LT.tabs({ items: [{ key, name, desc }], remember: 'lt.xxx', view: ctx.view, onChange: key => … })`，模板放 `${tabs.html}`，畫面放好後 `tabs.bind(el)`(套用上次的分頁並呼叫一次 onChange)，程式裡切換用 `tabs.set(key, { scroll: true })`。切換時自動記到後台熱門主題(目錄頁裡傳 `view: ctx.view`)。目前用在選擇權市場概況、低波動選股、美股策略。
- **麵包屑**：每頁上方自動顯示「首頁 › 區塊 › (小組) › 頁面」，每一層都能點；頁面裡還有更深一層時呼叫 `LT.crumbs('名稱')` 補上(目錄頁的單一內容自動補；股票查詢補代號、統計學補章)。
- **網址**：一般網址(不用 #)，例如 `stock/tw-strategy/lowvol`。站內連結一律寫相對網址(`href="stock/query/2330"`、首頁 `href="./"`，不要以 `/` 或 `#/` 開頭)，點了由 app.js 攔下來換頁、不重新載入；頁面讀網址用 `LT.path()`(例如 `['stock', 'query', '2330']`)，程式換頁用 `LT.go('etf/pack/intro')`。舊的 `#/…` 網址(書籤、分享出去的連結)會自動轉成新網址。
  - 部署時 `scripts/build-site.mjs` 依頁面清單產生每頁一份 HTML(例如 `stock/tw-strategy/lowvol.html`，內容同 index.html，只換標題、說明、canonical、og: 分享預覽)，搜尋引擎與 LINE、FB 的預覽才看得到各頁的標題；清單包含側欄頁面、目錄頁的項目，以及註冊時的 `routes`(例如統計學各章：`routes: [{ path: '1', name: '第 1 章 …' }]`)。沒有列出的網址(例如 `stock/query/2330`)由 Cloudflare Pages 回傳 index.html。
  - GitHub Pages 備援站放在 `/little-trader/` 子目錄：部署時把 `<base href="/">` 改成子目錄，並複製一份 `404.html`。
  - 頁面的 key 不要和網站資料夾撞名(`api`、`assets`、`content`、`data`、`modules`)，自動測試會檢查。
- **不列在側欄的頁面**：註冊時加 `hidden: true`(例如後台)，只能用網址開。
- **區塊內分小組**：註冊頁面時加上 `group: '台股'`，側欄與首頁會顯示小組標題(同組頁面要連續註冊)，例如股票區塊的台股、美股。
- **區塊主題**：app.js 換頁時設定 `<html data-sec="區塊">`，`components.css` 的「區塊主題」依此給 `--sec`(主題色)與 `--motif`(頁首右側的主題圖樣，SVG 遮罩)；側欄每個區塊也有 `data-sec`。頁面裡要用區塊色時寫 `var(--sec)`。頁首右側有選單等元件時不顯示圖樣。個別頁面可以換圖樣：app.js 也設定 `<html data-page="頁面 key">`，例如財報是行事曆、ETF研究與台股其他研究是研究報告。
- **無障礙**：次要文字 `--mute` 在暗色、淺色主題對底色與面板都 ≥ 4.5:1(自動測試會檢查)；全站有 `:focus-visible` 焦點框；觸控裝置與手機寬度下，按鈕、連結、輸入框、展開列至少 44px 高；尊重「減少動態效果」。
- **首頁**(`modules/home/home.js`)：開場是網站介紹(線條小圖示)與加權指數近 60 日迷你 K 線(公開的 indices 資料集)；接著是「近期更新」(`NEWS` 陣列，手動維護：只列網站上看得到的大項目，新的放最上面；預設顯示 3 則，展開後最多 10 則，沒有單一頁面可連的不給連結)；再來是各區塊的入口，套用各自的主題色與圖樣；最後的「研究重點」列出目錄頁項目的 `summary`(會員才看得到，不公開的策略不列)。
- **策略頁**：低波動選股、事件型策略(tw-strategy.js 的 eventStrat)、S&P500 季度換股也照研究報告的結構(先講結論 → 研究目的 → 資料處理 → 研究方法 → 四、實證結果與分析 → 五、結論；事件型另有六、延伸：最近的訊號)；先講結論與結論由網頁依回測數字產生。章節標題在面板之間用 `<h2 class="sec-h">`。
- **字型**：用 CSS 變數 `--font-body`(內文，中文優先的 Noto Sans TC)、`--font-display`(標題，Space Grotesk)、`--font-num`(數字)，不要直接寫字型名稱；數字預設等寬(`tabular-nums`)。canvas 圖表的座標字用 IBM Plex Mono。
- **研究報告**：結構見 CLAUDE.md「研究報告」；報告是 Markdown(資料集的 `report`)時，開頭的 `> ` 引言就是先講結論(樣式 `.doc blockquote`)；直接寫在頁面裡的研究(ARKK、單筆 vs 定期定額)用 `<blockquote>` 與 `<h3 class="md-h2">` 照同樣的結構寫。
- **分享研究**：目錄頁的單一內容(研究、策略)在頁首有「分享」按鈕(app.js 的 `share`；登入的會員才有，要密碼的策略沒有)，呼叫 `POST api/share`(`functions/api/share.ts`)產生專屬連結 `/s/<8 碼代碼>`(同一個人分享同一份報告是同一個連結，存在 D1 的 `share_links`)。手機用系統分享選單，電腦複製連結。
  打開連結(`functions/s/[code].ts`)：點開次數 +1(社群網站抓預覽不算)、存 `lt_ref` cookie(30 天)、轉到報告頁；報告在需要登入的區塊，沒登入的人先看到登入提示。登入後看報告時，`api/track` 依 `lt_ref` 記到 `share_views`(誰、看了幾次；分享的人自己不算)。後台「分享紀錄」列出誰分享了哪份報告、點開次數、登入後看的人與新會員(點了連結才第一次登入)。`_routes.json` 已包含 `/s/*`。
- **IG 圖卡**：`node scripts/share/make-share.mjs [研究 key …]`，在本機開網站並截出圖卡；新增研究時在 `scripts/share/ig-topics.mjs` 加一筆。
- **圖表**：用 `LTChart.line` / `LTChart.bars`(選項見 `chart.js` 開頭註解)，顏色用 CSS 變數，主題切換不用重畫。累積報酬圖的縱軸用 `LTChart.line(el, log => ({ … }))`(傳函式)：主圖左上角小標旁有「對數｜一般」切換鈕(預設一般)，設定全站共用(記在瀏覽器)，同一頁的累積報酬圖一起切換；策略與研究頁的報酬回撤圖(`LTTW.navCharts`)都用這個，頁面上不另放縱軸選單。
- **公式**：KaTeX 已全域載入，`katex.renderToString('\\sigma^2')`。

## 自動測試

`npm test`(Node 內建的 node:test，第一次先 `npm install`)，部署前 GitHub Actions 也會跑，沒過就不部署：

- `tests/site.test.mjs`：在 Node 裡載入全部頁面程式(`scripts/site-map.mjs`，假的瀏覽器環境)，檢查都註冊得起來、網址不重複、目錄頁的項目有 `run()`、`topics` 格式；`access.json` 的會員與後台程式都存在且不寫在 index.html、訪客載入的程式只註冊訪客區塊、每個頁面程式都有被載入；`<script>` 都加 defer、沒有 CDN 與外部腳本、沒有殘留的 `#/` 舊網址。
- `tests/build.test.mjs`：在暫存資料夾跑一次 `build-site.mjs`，檢查 `_routes.json`、各頁 HTML 的標題與分享預覽、公開版拿掉會員檔案並改成子目錄。
- `tests/functions.test.mjs`：用 esbuild 把 `functions/` 打包後直接呼叫：別的網站來的請求 403、不回 `Access-Control-Allow-Origin: *`、會員程式與資料集訪客 401(meta.json 公開)、登入後可下載、簽章不對的 cookie 視同訪客、後台程式一般會員不能下載。

新增頁面或改權限時通常不用改測試；新的規則(例如 CLAUDE.md 新增的網站原則)能自動檢查的，就加一個 test。

## 新增資料集

1. 建立 `pipeline/<資料集>/update.py`：用 `common.dataset_dir()` 取得輸出資料夾、`common.write_json()` 寫資料、最後 `common.write_meta(名稱, 來源名稱, 來源網址, 排程說明)`。
2. 複製 `.github/workflows/data-options.yml` 為 `data-<資料集>.yml`，修改名稱、排程(cron 為 UTC，台北時間減 8 小時)與 `dataset:`。
3. (網頁不顯示資料來源與更新時間，不用在網頁登記資料集。)
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

開啟 http://localhost:8000。這樣只有靜態檔、沒有後端，網頁會當作訪客(會員區塊顯示「到主站登入」)，而且只能從首頁點進去(http.server 不認得 `stats/basic/8` 這類網址，在子頁面重新整理會 404)；要測登入、會員區塊與股票查詢，改用 `npm install` 後 `npm run dev`(見「會員與權限」的本機測試)。

## 手動更新資料

GitHub repo → Actions → 選擇「資料 · 指數」「資料 · 即將發行ETF」或「資料 · 選擇權」→ Run workflow。
