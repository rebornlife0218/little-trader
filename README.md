# Little Trader 小交易員的研究室

**網站：https://rebornlife0218.github.io/little-trader/**

用公開資料研究台股與全球市場，把研究結果整理成圖表與統計，並收錄統計學教材。

| 區塊 | 內容 |
|---|---|
| 指數 | 全球主要指數的急跌反彈、均線支撐壓力、週期性分析與 K 棒型態統計 |
| ETF | ETF 折溢價說明、即將發行的新 ETF |
| 個股 | 處置股、隔日沖等主題研究(建置中) |
| 選擇權 | 臺指選擇權的隱含波動率、Put/Call 比、T 字報價與未平倉量、Black-Scholes 計算器、24 種策略損益圖 |
| 統計學 | 初級統計學 13 章(公式、R 範例、台股實例、互動模擬)、Seeing Theory |
| 其他 | 常用網站推薦 |

## 運作方式

網站是純靜態網頁(GitHub Pages)，沒有後端伺服器；資料由 GitHub Actions 定時抓取後存成 JSON，網頁在瀏覽器端載入並計算、繪圖。

```
 資料來源                    GitHub Actions(依各資料集排程)                 GitHub Pages
 ───────────                 ──────────────────────────────                 ────────────
 Yahoo Finance ─┐            pipeline/<資料集>/update.py
 臺灣證券交易所 ─┼──抓取──▶  整理成 JSON ＋ meta.json(來源、更新時間)  ──▶  data 分支
 臺灣期貨交易所 ─┤                                                               │
 MoneyDJ ───────┘                                                                ▼
                             main 分支的 web/(網頁程式與教材)  ──────────▶  部署 = web/ ＋ data/
                                                                                 │
                                                                                 ▼
                                                              瀏覽器：依網址載入對應頁面與資料、繪製圖表
```

- **main 分支**：程式與內容。`web/` 是網站本身，`pipeline/` 是資料抓取程式。
- **data 分支**：只放最新一份資料(每個資料集一個資料夾)，各資料集各自排程更新、互不影響，也不會讓 repo 越來越大。
- **部署**：程式推送到 main、或任一資料集更新完成，都會把 `web/` 和 data 分支合併後發佈到 GitHub Pages。

## 專案結構

```
web/                    網站(GitHub Pages 的根目錄)
  index.html            外框：側欄、內容區、頁尾，載入所有模組
  assets/               共用框架(路由、資料載入、圖表)、樣式、第三方套件
  modules/<區塊>/        各區塊的頁面(指數、ETF、個股、選擇權、統計學、其他)
  content/              Markdown 教材(統計學各章)
pipeline/               資料抓取程式，一個資料集一個資料夾
.github/workflows/      排程與部署
docs/                   維護文件
```

維護與擴充方式(新增頁面、資料集、教材編輯)請見 [docs/](docs/)。

COPYRIGHT © Little Trader　內容僅供研究參考，不構成投資建議。
