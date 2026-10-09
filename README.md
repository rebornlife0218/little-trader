# Little Trader

指數、個股與市場研究網站。COPYRIGHT © Trader逸

網站：https://rebornlife0218.github.io/little-trader/

## 結構

```
index.html                 網站外框(左側欄 + 內容 + 頁尾)
assets/css/components.css  共用元件樣式(面板、按鈕、表格、分頁…)
assets/css/layout.css      版型(側欄、手機版選單)
assets/js/app.js           框架：側欄區塊、頁面註冊與路由
modules/indices/           指數區塊：跌深反彈量能分析、K棒型態分析
scripts/update_data.py     用 yfinance 下載指數資料 → data/
.github/workflows/         排程：台北時間週一~週五 05:30、15:30 更新資料並部署
```

`data/` 不進版控，每次部署時由 GitHub Actions 重新下載。

## 新增研究內容

1. 在 `modules/<區塊>/` 新增一個 JS 檔，例如 `modules/stock/my-study.js`：

   ```js
   LT.register({
     section: 'stock',          // 'index' | 'stock' | 'other'
     key: 'my-study',           // 網址：#/stock/my-study
     name: '我的研究',           // 側欄顯示名稱
     mount(el) {                // el 是內容區，把畫面畫進去
       el.innerHTML = `<div class="panel"><h3>我的研究</h3>…</div>`;
     },
     unmount() {},              // (選用) 離開頁面時清理
   });
   ```

2. 在 `index.html` 的「研究模組」處加上 `<script src="modules/stock/my-study.js"></script>`。
3. 要新增側欄區塊，編輯 `assets/js/app.js` 的 `SECTIONS`。
4. 需要新資料：在 `scripts/` 加下載程式，並在 workflow 的「下載最新指數資料」步驟後加一行執行它，輸出到 `data/`。

## 本機預覽

```
python scripts/update_data.py
python -m http.server 8000
```
開啟 http://localhost:8000

## 手動更新

GitHub repo → Actions → 「Little Trader 更新資料並部署」→ Run workflow。
