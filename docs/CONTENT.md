# 章節內容編輯指南

初級統計學的章節內容可以寫成 **Markdown 檔**(`.md`)，用一般文字編輯器(或直接在 GitHub 網頁上)修改，**不需要懂 JavaScript**。存檔推送後，網站約 1～2 分鐘自動更新。

## 檔案在哪裡

```
web/content/stats/basic/
  ch01.md                第 1 章  概論及敘述統計學
  ch02.md                第 2 章  機率
  ch03.md                第 3 章  隨機變數
  ch04.md                第 4 章  多元隨機變數
  ch05.md                第 5 章  常見機率模型
  ch06.md                第 6 章  抽樣方法與抽樣分配
  ch07.md                第 7 章  點估計
  ch08.md                第 8 章  區間估計
  ch09.md                第 9 章  假說檢定
  ch10.md                第 10 章 變異數分析
  ch11.md                第 11 章 線性迴歸
  ch12.md                第 12 章 卡方檢定
  ch13.md                第 13 章 其他
  img/                   章節用到的圖片(ch01-bar.png …)
  r/ch01-figures.R       產生第 1 章圖片的 R 程式
```

13 章全部都是 Markdown 檔，要改哪一章就打開對應的 `chNN.md`。章節名稱、互動模擬、台股市場實例則設定在 `web/modules/stats/basic.js`(見最後一節)。

## 三種更新方式

### 方式 A：在 GitHub 網頁上直接改(最簡單，免安裝)

1. 打開 https://github.com/rebornlife0218/little-trader/tree/main/content/stats/basic ，點選要改的章節(例如 `ch01.md`)
2. 按右上角鉛筆圖示 ✏️(Edit this file)
3. 修改內容，可切到「Preview」分頁預覽(公式在 GitHub 預覽也看得到)
4. 按「Commit changes…」→ 再按一次「Commit changes」
5. 等 1～2 分鐘，重新整理網站即可看到

上傳圖片：到 `web/content/stats/basic/img/` 資料夾，按「Add file → Upload files」。

### 方式 B：在電腦上改，再推送

```bash
cd C:\Users\User\little-trader
git pull                          # 先同步最新版本
# 用 VS Code 等編輯器修改 web/content/stats/basic/ch01.md
git add web/content
git commit -m "更新第1章"
git push
```

### 方式 C：推送前先在本機預覽

```bash
cd C:\Users\User\little-trader
python -m http.server 8000 -d web
```

瀏覽器打開 http://localhost:8000/#/stats/basic/1 (最後的數字是章節編號)，改完檔案按重新整理就能看到結果(本機若沒有先執行資料程式(見 docs/ARCHITECTURE.md)，下方的「市場實例」會顯示載入失敗，不影響章節內容)。

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
| 文氏圖 | `[[venn 種類\|標題\|說明]]`(見下方) |

**表格**：

```markdown
| 尺度 | 特性 | 例子 |
|---|---|---|
| 名義尺度 | 只能分類 | 血型 |
| 順序尺度 | 可以排序 | 滿意度 |
```

段落之間要**空一行**，否則會黏在一起。

**文氏圖**(第 2 章使用)：一行一張，連續幾行會排成一列。種類有 `inter` 交集、`union` 聯集、`comp` 補集、`diff` 差集、`disjoint` 互斥，標題與說明可以放公式：

```markdown
[[venn inter|交集 $A \cap B$|A 與 B 同時發生]]
[[venn union|聯集 $A \cup B$|A 或 B 至少一個發生]]
```

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
"C:\Program Files\R\R-4.4.1\bin\Rscript.exe" web/content/stats/basic/r/ch01-figures.R web/content/stats/basic/img
```

想新增圖片：在 R 程式裡照著 `dev("檔名.png"); 畫圖指令; dev.off()` 的格式加一行，執行後在 `.md` 裡用 `![圖說](img/檔名.png)` 插入。

## 章節名稱、互動模擬與市場實例

這些不是文字內容，設定在 `web/modules/stats/basic.js` 的 `CHAPTERS` 清單裡，一章一行：

```js
{
  title: '機率',                                  // 章節名稱(上方章節按鈕與章名)
  md: 'ch02',                                     // 內容檔 web/content/stats/basic/ch02.md
  st: ['basic-probability', 'Basic Probability'], // 右上角 Seeing Theory 連結(選填，不要就寫 null)
  demo: ['dice', 'coin'],                         // 文末互動模擬(選填)
  live: 'describe',                               // 文末台股市場實例(選填)
},
```

- **改章名**：改 `title` 即可。
- **新增一章**：新增 `web/content/stats/basic/ch14.md`，再在 `CHAPTERS` 最後加上 `{ title: '新章名', md: 'ch14' },`。
- 章節的順序就是 `CHAPTERS` 清單的順序。
