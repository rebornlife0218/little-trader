# Little Trader

指數、ETF、個股、統計學與市場研究網站。COPYRIGHT © Trader逸

網站：https://rebornlife0218.github.io/little-trader/

## 架構

每個研究區塊由「前端模組」與「資料集」組成，各自維護、各自排程，互不影響。

```
index.html                     網站外框(左側欄 + 內容 + 頁尾)，在此載入各模組
assets/css/                    共用樣式(components.css 元件、layout.css 版型)
assets/js/app.js               框架：側欄區塊、頁面註冊、路由、資料集載入工具
assets/img/logo.svg            吉祥物 LOGO「小K」

modules/<模組>/                前端模組(顯示畫面)
  indices/indices.js           指數：跌深反彈量能分析、K棒型態分析
  etf/etf.js                   ETF：ETF折溢價(外部連結)、即將發行ETF

scripts/<資料集>/update.py     資料集更新程式 → 輸出到 data/<資料集>/
  indices/                     Yahoo Finance 全球 10 大指數
  etf_upcoming/                MoneyDJ 新基金一覽表(只取名稱含 ETF 者)
scripts/common.py              共用：輸出資料夾、寫 meta.json
scripts/publish_data.sh        把某個資料集發佈到 data 分支

.github/workflows/
  data-indices.yml             指數資料：台北 週一~五 05:30、15:30
  data-etf.yml                 即將發行ETF：台北 週一~五 08:30、17:30
  deploy.yml                   部署網站(main 程式 + data 分支資料)
```

### 資料怎麼流動

1. 各資料集的 workflow 依自己的排程執行 `scripts/<資料集>/update.py`，產生 `data/<資料集>/`。
2. `publish_data.sh` 只替換 data 分支裡**該資料集**的資料夾，其他資料集不動。data 分支永遠只有一個 commit，repo 不會越來越大。
3. 接著呼叫 `deploy.yml`，把 main 的程式與 data 分支的資料一起部署到 GitHub Pages。
4. 推送程式到 main 也會自動部署(沿用 data 分支現有資料)。

每個資料集一定有 `meta.json`(更新時間、資料來源、排程、version)，網頁用 `LT.sourceLine(meta)` 在頁面上方顯示「資料來源 · 更新時間 · 排程」。

## 新增研究內容

### 只是頁面(或外部連結)

在 `modules/<區塊>/` 新增 JS，於 `index.html` 的「研究模組」處加上 `<script>`：

```js
LT.register({ section: 'etf', key: 'premium', name: 'ETF折溢價', href: 'https://...' }); // 外部連結

LT.register({
  section: 'stock',            // 'index' | 'etf' | 'stock' | 'stats' | 'other'(定義在 app.js 的 SECTIONS)
  key: 'my-study',             // 網址：#/stock/my-study
  name: '我的研究',             // 側欄顯示名稱
  async mount(el, ctx) {       // el 是內容區；ctx.alive() 為 false 代表使用者已切到別頁
    const { meta, data } = await LT.loadJSON('my_dataset', 'items.json');
    if (!ctx.alive()) return;
    el.innerHTML = `<header class="top"><div><h1>我的研究</h1>${LT.sourceLine(meta)}</div></header>…`;
  },
});
```

新增側欄區塊：編輯 `assets/js/app.js` 的 `SECTIONS`。

### 需要新的資料集

1. 建立 `scripts/<資料集>/update.py`：用 `common.dataset_dir()` 取得輸出資料夾、`common.write_json()` 寫資料、最後 `common.write_meta(名稱, 來源名稱, 來源網址, 排程說明)`。
2. 複製 `.github/workflows/data-etf.yml` 改名，修改排程(cron 為 UTC，台北時間減 8 小時)、執行的腳本與 `publish_data.sh <資料集>`。
3. 有新的 Python 套件就加到 `requirements.txt`。

## 本機預覽

```
pip install -r requirements.txt
python scripts/indices/update.py
python scripts/etf_upcoming/update.py
python -m http.server 8000
```
開啟 http://localhost:8000(`data/` 不進版控)

## 手動更新

GitHub repo → Actions → 選擇「資料 · 指數」或「資料 · 即將發行ETF」→ Run workflow。
