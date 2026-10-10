# 章節內容編輯指南

初級統計學的章節內容可以寫成 **Markdown 檔**(`.md`)，用一般文字編輯器(或直接在 GitHub 網頁上)修改，**不需要懂 JavaScript**。存檔推送後，網站約 1～2 分鐘自動更新。

## 檔案在哪裡

```
content/stats/basic/
  ch01.md                第 1 章 概論及敘述統計學 ← 直接改這個檔案
  img/                   章節用到的圖片(ch01-bar.png …)
  r/ch01-figures.R       產生第 1 章圖片的 R 程式
```

目前第 1 章使用 Markdown；第 2～13 章仍寫在 `modules/stats/basic.js`(各章的 `body`)，可以逐章搬過來(見最後一節)。

## 三種更新方式

### 方式 A：在 GitHub 網頁上直接改(最簡單，免安裝)

1. 打開 https://github.com/rebornlife0218/little-trader/blob/main/content/stats/basic/ch01.md
2. 按右上角鉛筆圖示 ✏️(Edit this file)
3. 修改內容，可切到「Preview」分頁預覽(公式在 GitHub 預覽也看得到)
4. 按「Commit changes…」→ 再按一次「Commit changes」
5. 等 1～2 分鐘，重新整理網站即可看到

上傳圖片：到 `content/stats/basic/img/` 資料夾，按「Add file → Upload files」。

### 方式 B：在電腦上改，再推送

```bash
cd C:\Users\User\little-trader
git pull                          # 先同步最新版本
# 用 VS Code 等編輯器修改 content/stats/basic/ch01.md
git add content
git commit -m "更新第1章"
git push
```

### 方式 C：推送前先在本機預覽

```bash
cd C:\Users\User\little-trader
python -m http.server 8000
```

瀏覽器打開 http://localhost:8000/#/stats/basic/1 ，改完檔案按重新整理就能看到結果(本機若沒有 `data/` 資料，下方的「市場實例」會顯示載入失敗，不影響章節內容)。

## Markdown 語法速查

| 想要的效果 | 寫法 |
|---|---|
| 大節標題(橘色、有底線) | `## 統計學是什麼？` |
| 小節標題 | `### 一、集中趨勢` |
| 粗體 | `**重點**` |
| 項目清單 | 每行開頭 `- ` |
| 編號清單 | 每行開頭 `1. `、`2. ` |
| 橘色提示框 | 段落開頭 `> ` |
| 行內程式碼 | `` `mean(x)` `` |
| 程式碼區塊 | 用 ` ```r ` 開頭、` ``` ` 結尾包起來 |
| 圖片(自動加圖說) | `![圖說文字](img/ch01-bar.png)`，單獨一行 |
| 連結 | `[文字](https://網址)` |
| 換行(表格內) | `<br>` |
| 註解(不會顯示) | `<!-- 這是註解 -->` |

**表格**：

```markdown
| 尺度 | 特性 | 例子 |
|---|---|---|
| 名義尺度 | 只能分類 | 血型 |
| 順序尺度 | 可以排序 | 滿意度 |
```

段落之間要**空一行**，否則會黏在一起。

## 數學公式(LaTeX 語法)

- 行內公式：用一個 `$` 包起來，例如 `$\bar{x} = 79.8$`
- 獨立公式(置中、加框)：用 `$$` 包起來，可以寫成多行

```latex
$$
s^2 = \frac{1}{n-1}\sum_{i=1}^{n}(x_i - \bar{x})^2
$$
```

| 符號 | 寫法 | 符號 | 寫法 |
|---|---|---|---|
| $\bar{x}$ | `\bar{x}` | $\hat{p}$ | `\hat{p}` |
| $\mu,\ \sigma,\ \beta$ | `\mu, \sigma, \beta` | $x_i,\ x^2$ | `x_i, x^2` |
| $x_{(1)}$ | `x_{(1)}`(下標超過一個字要加 `{}`) | $\frac{a}{b}$ | `\frac{a}{b}` |
| $\sqrt{x}$ | `\sqrt{x}` | $\sum_{i=1}^{n}$ | `\sum_{i=1}^{n}` |
| $\le,\ \ge,\ \ne$ | `\le, \ge, \ne` | $\times,\ \div,\ \pm$ | `\times, \div, \pm` |
| $\approx$ | `\approx` | $\infty$ | `\infty` |
| 公式中的中文 | `\text{母體}` | 空白 | `\quad`、`\qquad`、`\ ` |

分段函數：

```latex
$$
M_e =
\begin{cases}
x_{\left(\frac{n+1}{2}\right)}, & n \text{ 為奇數} \\
\dfrac{1}{2}\left[x_{(n/2)} + x_{(n/2+1)}\right], & n \text{ 為偶數}
\end{cases}
$$
```

完整語法可查 KaTeX 文件：https://katex.org/docs/supported.html 。公式寫錯時，網頁上會以紅字顯示原始碼，方便找出錯誤。

要在一般文字中寫「錢字號」本身，請寫成 `\$`(程式碼區塊內的 `$` 不受影響，例如 `birthwt$bwt`)。

## 更新 R 圖片

```bash
cd C:\Users\User\little-trader
"C:\Program Files\R\R-4.4.1\bin\Rscript.exe" content/stats/basic/r/ch01-figures.R content/stats/basic/img
```

想新增圖片：在 R 程式裡照著 `dev("檔名.png"); 畫圖指令; dev.off()` 的格式加一行，執行後在 `.md` 裡用 `![圖說](img/檔名.png)` 插入。

## 其他章節改成 Markdown

1. 新增 `content/stats/basic/ch02.md`(檔名自訂)，寫入內容
2. 打開 `modules/stats/basic.js`，找到該章(例如 `title: '機率'`)，加上 `md: 'ch02',`
3. 有了 `md` 之後，該章的 `body` 就不會再使用，可以刪除

章節名稱、互動模擬(`demo`)、台股市場實例(`live`)仍設定在 `basic.js` 的 `CHAPTERS` 清單裡：

```js
{
  title: '概論及敘述統計學',   // 章節名稱(上方章節按鈕與章名)
  md: 'ch01',                  // 內容檔 content/stats/basic/ch01.md
  live: 'describe',            // 文末的台股市場實例(選填)
},
```
