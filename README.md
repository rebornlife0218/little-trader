# Little Trader 小交易員的研究室

**網站：https://little-trader.pages.dev/**(備援：https://rebornlife0218.github.io/little-trader/)

用公開資料研究台股與全球市場，把研究結果整理成圖表與統計，並收錄統計學教材。

| 區塊 | 內容 |
|---|---|
| 指數 | 全球主要指數的急跌反彈、均線支撐壓力、週期性分析與 K 棒型態統計；台指期貨(期現貨價差、每月轉倉、結算日曆、三大法人未平倉) |
| ETF | ETF大禮包(ETF 介紹與折溢價；怎麼存 ETF：常存 ETF 績效比較、配息課稅試算、0050 vs 勞退基金；ETF 研究：投資方式(ARKK 研究、單筆 vs 定期定額 vs 逢低買入)、主動式 ETF(A 系列 ETF 跟單))、即將發行的新 ETF |
| 股票 | 台股：處置股(新制說明與處置期間表現)；台股策略回測(低波動選股，CMoney 資料)；隔日沖、波段(建置中)；美股：財報行事曆(盤前/盤後、預估與實際 EPS)、S&P500 季度換股策略回測(使用當時的歷史成分股，含已下市公司) |
| 選擇權 | 臺指選擇權的隱含波動率、P/C ratio、週選與月選結算日曆、T 字報價與未平倉量、Black-Scholes 計算器；24 種策略損益圖 |
| 統計學 | 初級統計學 13 章(公式、R 範例、台股實例、互動模擬) |
| 其他 | 常用網站推薦 |

## 運作方式

網站是純靜態網頁(Cloudflare Pages，GitHub Pages 備援)，沒有後端伺服器；資料由 GitHub Actions 定時抓取後存成 JSON，網頁在瀏覽器端載入並計算、繪圖。台股處置股與台股策略回測的股價來自本機 PostgreSQL(GitHub Actions 連不到)，改由本機排程執行同樣的流程(`pipeline/run_local.py`)。

```
 資料來源                    GitHub Actions(依各資料集排程)                 Cloudflare Pages ＋ GitHub Pages
 ───────────                 ──────────────────────────────                 ────────────
 Yahoo Finance ─┐            pipeline/<資料集>/update.py
 臺灣證券交易所 ─┼──抓取──▶  整理成 JSON ＋ meta.json(來源、更新時間)  ──▶  data 分支
 臺灣期貨交易所 ─┤                                                               │
 MoneyDJ、Nasdaq┘                                                                ▼
                             main 分支的 web/(網頁程式與教材)  ──────────▶  部署 = web/ ＋ data/
                                                                                 │
                                                                                 ▼
                                                              瀏覽器：依網址載入對應頁面與資料、繪製圖表
```

- **main 分支**：程式與內容。`web/` 是網站本身，`pipeline/` 是資料抓取程式。
- **data 分支**：只放最新一份資料(每個資料集一個資料夾)，各資料集各自排程更新、互不影響，也不會讓 repo 越來越大。
- **部署**：程式推送到 main、或任一資料集更新完成，都會把 `web/` 和 data 分支合併後，同時發佈到 Cloudflare Pages 與 GitHub Pages(設定與維護見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)「部署」)。

## 專案結構

```
web/                    網站(部署時的根目錄)
  index.html            外框：側欄、內容區、頁尾，載入所有模組
  assets/               共用框架(路由、資料載入、圖表)、樣式、第三方套件
  modules/<區塊>/        各區塊的頁面(指數、ETF、股票、選擇權、統計學、其他)
  content/              Markdown 教材(統計學各章)
pipeline/               資料抓取程式，一個資料集一個資料夾
.github/workflows/      排程與部署
docs/                   維護文件
```

維護與擴充方式(新增頁面、資料集、教材編輯)請見 [docs/](docs/)。

COPYRIGHT © Little Trader　內容僅供研究參考，不構成投資建議。
