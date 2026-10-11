# 架構與維護指南

給維護者看的細節。網站簡介見根目錄 [README.md](../README.md)，統計學教材的編輯方式見 [CONTENT.md](CONTENT.md)。

## 目錄

```
web/                                網站(部署時整個資料夾就是網站根目錄)
  index.html                        外框，在此依序載入框架與各模組的 <script defer>(平行下載、依序執行)
  assets/
    js/app.js                       框架：側欄區塊 SECTIONS、資料集清單 DATASETS、頁面註冊、路由、資料載入
    js/chart.js                     共用 SVG 圖表 LTChart.line / LTChart.bars(跟隨主題與寬度、滑鼠提示)
    css/components.css、layout.css  色彩變數(暗色/淺色)與元件樣式、版型
    vendor/                         第三方套件(放在本站以符合 CSP)：marked(Markdown)、KaTeX(公式)
    img/logo.svg                    吉祥物「小K」
  modules/
    home/home.js                    首頁：各區塊入口、各資料集更新狀態
    indices/indices.js              指數：大盤漲跌分析、K棒型態
    indices/futures.js              指數：台指期貨(轉倉、結算日曆；用到 option/lib.js)
    etf/pack.js                     ETF：ETF大禮包(ETF介紹、怎麼存ETF)
    etf/etf.js                      ETF：即將發行ETF
    stock/disposition.js            股票 · 台股：處置股(新制說明、處置期間表現；資料集 disposition)
    stock/tw.js                     股票 · 台股：隔日沖、波段、策略(建置中)
    stock/earnings.js               股票 · 美股：財報行事曆
    stock/us-strategy.js            股票 · 美股：S&P500 季度換股策略回測(最上方選總覽或單一策略；資料集 sp500)
    option/lib.js                   選擇權共用：Black-Scholes、Greeks、策略定義 STRATEGIES、資料載入、結算日曆
    option/calculator.js            Black-Scholes 計算器元件(在市場概況的分頁裡顯示)
    option/market.js                選擇權市場概況(市場指標、T 字報價與未平倉、Black-Scholes 計算器三個分頁)
    option/strategy.js              策略損益圖
    stats/basic.js                  初級統計學(章節設定、互動模擬、台股實例；內容在 content/)
    stats/stats.js                  計量(建置中)、Seeing Theory
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
  etf_compare/update.py             0050 vs 勞退基金(勞動基金運用局、Yahoo Finance)
  disposition/update.py             台股處置股(證交所、櫃買中心公告；股價 Yahoo、櫃買指數用櫃買中心)
  sp500/update.py                   S&P500 季度換股回測：歷史成分股(fja05680/sp500)、Yahoo Finance、Tiingo(已下市公司)

.github/workflows/
  _dataset.yml                      共用流程：update.py → publish_data.sh → deploy
  data-<資料集>.yml                  各資料集的排程，只呼叫 _dataset.yml
  deploy.yml                        組合 web/ 與 data 分支 → GitHub Pages
```

## 資料怎麼流動

1. `data-<資料集>.yml` 依排程觸發 `_dataset.yml`。
2. 執行 `pipeline/<資料集>/update.py`，輸出到 `web/data/<資料集>/`，一定包含 `meta.json`(更新時間、來源、排程、version)。
3. `publish_data.sh` 只替換 data 分支裡該資料集的資料夾。data 分支永遠只有一個 commit。
4. 呼叫 `deploy.yml`：`web/` ＋ data 分支 → `_site/` → GitHub Pages。推送到 main 也會觸發部署(沿用 data 分支現有資料)。

網頁端用 `LT.loadJSON(資料集, 檔名)` 載入資料，網址帶 `meta.version`，資料沒更新前瀏覽器直接用快取。每頁用到的資料集會自動列在頁尾 COPYRIGHT 下方(「資料來源 · 更新時間 · 排程」，換頁時更新；首頁列出全部資料集)，頁面不用自己顯示。

## 資料集

| 資料集 | 來源 | 排程(台北) | 主要檔案 |
|---|---|---|---|
| indices | Yahoo Finance、臺灣證券交易所 | 週一~五 05:30、15:30 | 每個指數一個 JSON(`d/o/h/l/c/v` 陣列)；另有 `TAIEX_TR.json`(發行量加權股價報酬指數，含股息，2003 起，`d/c`；不列在指數頁，給 ETF大禮包的長期回測) |
| etf_upcoming | MoneyDJ 新基金一覽表 | 週一~五 08:30、17:30 | `upcoming.json` |
| etf_compare | 勞動基金運用局、Yahoo Finance、臺灣證券交易所(除權除息計算結果表) | 週一~五 09:00 | `compare.json`(每月：勞退基金報酬、0050 價格與總報酬)、`etfs.json`(常存 ETF 與 ARKK 的每日收盤、股利再投入還原股價、每股配息；台股 ETF 的配息用證交所官方資料，Yahoo 缺 2013 年以前的配息) |
| earnings | Nasdaq Earnings Calendar | 每天 07:30、20:00 | `earnings.json`(上週、本週、下週每天的公司、盤前/盤後、預估與實際 EPS、驚喜幅度) |
| disposition | 臺灣證券交易所、櫃買中心 處置有價證券；Yahoo Finance | 週一~五 19:00 | `events.json`(2025 年起每個處置事件：期間、新制/舊制、第一天開收、處置前 5 日、處置期間、出關後 5 日與同期大盤報酬；加權與櫃買指數近 200 天) |
| sp500 | fja05680/sp500 歷史成分股、Yahoo Finance、Tiingo | 週六 09:00 | `backtest.json`(四種策略、全部成分股等權重、SPY 的每日淨值(未扣成本)；每季的成分股數、可取得股價數、換手率、無風險利率、持股) |
| options | 臺灣期貨交易所 期貨、選擇權每日交易行情、三大法人 | 週一~五 06:00、16:00 | `history.json`(每日 30 天 IV、P/C 比)、`chain.json`(最新 T 字報價)、`futures.json`(台指期近月走勢、三大法人淨未平倉、各月份契約) |

增量更新：證交所與期交所一次只能查一個月，所以 indices 與 options 都用 `common.load_published()` 讀回 data 分支上的舊檔，只補最近的資料；沒有舊檔時才完整回補(options 回補 1 年)。

sp500 的特殊處理：
- 已下市、被併購公司的股價 Yahoo 沒有，改用 Tiingo(需要 API 金鑰：本機放在 `~/.tiingo_key`，GitHub Actions 用 Secret `TIINGO_API_KEY`；`data-sp500.yml` 要 `secrets: inherit`)。Tiingo 的原始股價只快取在本機 `~/.cache/little-trader/tiingo/`，**不發佈**(授權不允許轉載)，data 分支只放回測結果。
- 完整重算(從 2000 年)只在本機執行：`python pipeline/sp500/update.py --full`(加 `--offline` 只用快取)；免費方案每小時 50 次請求，第一次下載約 3～4 小時。
- 每週的增量更新讀回已發佈的結果，從倒數第 3 季重算並接上，最近的成分股 Yahoo 幾乎都有，偶爾才需向 Tiingo 查幾檔。
- Yahoo 的代號可能已被別家公司沿用(例如 EP 原為 El Paso，現在是 Empire Petroleum)：成分股期間每日成交金額中位數低於 200 萬美元就視為沿用，改找 Tiingo。

## 新增頁面

在 `web/modules/<區塊>/` 新增 JS，並在 `web/index.html` 的「研究模組」處加上 `<script defer src="...">`(一律加 defer，網頁才會平行下載、不會卡住畫面)：

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

- **新增側欄區塊**：在 `app.js` 的 `SECTIONS` 加一筆(`desc` 會顯示在首頁)。
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

開啟 http://localhost:8000

## 手動更新資料

GitHub repo → Actions → 選擇「資料 · 指數」「資料 · 即將發行ETF」或「資料 · 選擇權」→ Run workflow。
