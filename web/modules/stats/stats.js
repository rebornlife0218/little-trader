/* 統計學區塊(建置中的頁面只需 name + desc，完成後補上 mount 即可)
   · Seeing Theory：外部互動教材的介紹與連結 */
LT.register({
  section: 'stats', key: 'econometrics', name: '計量',
  desc: '迴歸分析、時間序列與計量經濟方法在金融市場上的應用。',
});

LT.register({
  section: 'stats', key: 'seeing-theory', name: 'Seeing Theory 視覺化機率',
  mount(el) {
    const url = 'https://seeing-theory.brown.edu/basic-probability/index.html';
    const chapters = [
      ['基本機率', 'Basic Probability', '隨機事件、期望值、變異數'],
      ['複合機率', 'Compound Probability', '集合、組合、條件機率'],
      ['機率分配', 'Probability Distributions', '隨機變數、離散與連續分配、中央極限定理'],
      ['頻率學派推論', 'Frequentist Inference', '點估計、信賴區間、自助法(Bootstrap)'],
      ['貝氏推論', 'Bayesian Inference', '貝氏定理、似然函數、先驗與後驗'],
      ['迴歸分析', 'Regression Analysis', '最小平方法、相關係數、變異數分析'],
    ];
    el.innerHTML = `
      <header class="top"><div>
        <h1>Seeing Theory 視覺化機率</h1>
        <p>用互動動畫學機率與統計的免費線上教材</p>
      </div></header>
      <div class="panel">
        <h3>參考連結</h3>
        <a class="linkcard" href="${url}" target="_blank" rel="noopener">
          <div><b>Seeing Theory · Basic Probability</b><small>布朗大學(Brown University)製作的互動式機率統計教材</small><small>${url}</small></div>
          <span class="go">前往 ↗</span>
        </a>
      </div>
      <div class="panel doc">
        <h3>網站介紹</h3>
        <p>Seeing Theory 把抽象的機率與統計觀念做成可以動手操作的視覺化動畫：丟硬幣、擲骰子、抽樣，看著結果一步步累積，就能直觀理解「機率」「期望值」「變異數」是怎麼來的，很適合作為初級統計學的入門教材(英文介面)。</p>
        <h3>課程章節</h3>
        <div class="tablewrap"><table class="stattable">
          <thead><tr><th>章節</th><th>英文名稱</th><th>內容</th></tr></thead>
          <tbody>${chapters.map((c, i) => `<tr><td>${i + 1}. ${c[0]}</td><td>${c[1]}</td><td style="text-align:left;font-family:Inter,sans-serif;">${c[2]}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="note">連結開啟的是第一章「基本機率」，包含隨機事件(Chance Events)、期望值(Expectation)與變異數(Variance)三個小節。</p>
      </div>`;
  },
});
