/* ETF · ETF大禮包 › ETF介紹(etf/pack/intro，目錄頁在 pack.js)：ETF 是什麼、種類、怎麼追蹤指數、成本、配息與總報酬、折溢價(靜態內容，共用函式在 lib.js) */
(() => {
  const { esc } = LTETF;
  const PREMIUM_REFS = [
    { name: '臺灣證券交易所 · ETF 盤中預估淨值與折溢價', desc: '各檔國內 ETF 的市價、預估淨值與折溢價率，盤中即時揭露',
      url: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant' },
  ];
  LTETF.pages.intro = {
    run(el) {
      el.innerHTML = `
        <div class="pk-pane" data-pane="intro">
          <div class="panel doc">
            <h3>什麼是 ETF</h3>
            <p><b>ETF</b>(Exchange Traded Fund，指數股票型基金)是把一籃子股票或債券包成一檔基金，在證券交易所掛牌，可以像股票一樣隨時買賣。</p>
            <ul>
              <li><b>分散風險</b>：一次買進很多檔股票，單一公司出問題的影響較小。</li>
              <li><b>成本低</b>：被動追蹤指數，管理費通常比主動型基金低；交易稅也比個股低(下方說明)。</li>
              <li><b>透明</b>：持股與淨值每天公布，盤中也有預估淨值。</li>
              <li><b>門檻低</b>：可以零股或定期定額買進，小額也能開始。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>ETF 的種類與分類</h3>
            <div class="doc">
              <p>台股 ETF 可以從三個角度分類：<b>管理方式</b>(被動或主動)、<b>投資標的</b>(股票、債券、期貨、槓桿反向、股債平衡)、<b>成分證券在國內或國外</b>。證券代號的第六碼(尾碼)就能看出前兩項；股票型再依指數的選股規則分成市值型、高股息、主題／產業等：</p>
            </div>
            <div class="tablewrap"><table class="stattable pk-kind">
              <thead><tr><th>管理方式</th><th>類型</th><th>代號尾碼(台幣 / 外幣)</th><th>例子</th><th>特色與要注意</th></tr></thead>
              <tbody>
                <tr><td rowspan="8" class="pk-mgmt">被動式<br><small class="mute">追蹤指數</small></td><td class="pk-type">股票型｜市值型</td><td>全數字 / K</td><td class="pk-ex">0050、006208</td><td class="pk-note">依市值挑選大型股，跟著大盤走，最適合長期持有、定期定額；台股權值集中在少數大型股(如台積電)，產業集中度高</td></tr>
                <tr><td class="pk-type">股票型｜高股息</td><td>全數字</td><td class="pk-ex">0056、00878、00713、00919、00929、00918、00939、00940</td><td class="pk-note">挑選殖利率高的股票，配息較多、部分月配或季配；配息不等於多賺(見下方「配息與總報酬」)，選股規則、換股頻率各檔差異大</td></tr>
                <tr><td class="pk-type">股票型｜主題、產業、因子</td><td>全數字 / K</td><td class="pk-ex">半導體、AI、ESG、低波動；00625K(國外成分)</td><td class="pk-note">集中投資某個產業、題材或因子；題材熱門時容易追高，產業集中、波動大(見「怎麼存ETF」的 ARKK 研究)</td></tr>
                <tr><td class="pk-type">債券型</td><td>B / C</td><td class="pk-ex">00679B；00687C</td><td class="pk-note">價格波動通常比股票小，與股市的相關性較低，可用來平衡資產；利率上升時債券價格下跌，長天期債券波動並不小。交易稅目前為 0(見下方「持有 ETF 的成本」)</td></tr>
                <tr><td class="pk-type">槓桿型</td><td>L</td><td class="pk-ex">00631L(台灣50正2)</td><td class="pk-note" rowspan="2">追蹤指數單日漲跌的 2 倍或反向，適合短線操作；每日重新平衡，長期持有的報酬不等於指數的 2 倍或 −1 倍，盤整時會耗損</td></tr>
                <tr><td class="pk-type">反向型</td><td>R</td><td class="pk-ex">00632R(台灣50反1)</td></tr>
                <tr><td class="pk-type">期貨型</td><td>U</td><td class="pk-ex">00635U</td><td class="pk-note">用期貨追蹤商品或指數；有轉倉成本，期貨價格與現貨會有價差</td></tr>
                <tr><td class="pk-type">平衡型(股債多資產)</td><td>T</td><td class="pk-ex">00980T</td><td class="pk-note">同時持有股票、債券等多種資產</td></tr>
                <tr><td rowspan="2" class="pk-mgmt">主動式<br><small class="mute">經理人選股</small></td><td class="pk-type">股票型</td><td>A</td><td class="pk-ex">00981A</td><td class="pk-note" rowspan="2">經理人主動選股或選債、目標是打敗指數；費用通常較高，持股會揭露但可能隨時調整(見「ETF研究」的主動式 ETF 跟單)</td></tr>
                <tr><td class="pk-type">債券型</td><td>D</td><td class="pk-ex">00980D</td></tr>
              </tbody>
            </table></div>
            <div class="doc" style="margin-top:12px;">
              <ul>
                <li><b>被動式 vs 主動式</b>：被動式 ETF 依指數規則持股，費用較低；主動式 ETF 由經理人選股、目標是打敗指數，費用通常較高。</li>
                <li><b>國內成分 vs 國外成分</b>：尾碼看不出來，要看追蹤的指數或投資範圍。國外成分 ETF(例如美國股票、美國公債)多了<b>匯率風險</b>與時差，淨值以國外收盤計算，台股盤中的價格比較容易出現折溢價。</li>
                <li><b>風險由低到高</b>(證交所投資人教育的排列)：一般台股 ETF → 海外股債 ETF(跨市場、匯率) → 期貨 ETF(期現貨價差、轉倉風險) → 槓桿/反向 ETF(長期報酬偏離倍數，限制較多)。期貨與槓反 ETF 屬於需要簽署風險預告書的商品。</li>
              </ul>
              <p class="mute" style="font-size:12px;">資料來源：<a href="https://www.twse.com.tw/zh/products/securities/etf/products/li.html" target="_blank" rel="noopener">臺灣證券交易所 · 槓桿型及反向型ETF</a>；尾碼分類整理自<a href="https://tw.stock.yahoo.com/news/00980a%E3%80%8100980d%E3%80%8100980t%E4%B8%8D%E4%B8%80%E6%A8%A3%EF%BC%9F%E7%9C%8B%E6%87%8213%E7%A8%AEetf%E5%B0%BE%E7%A2%BC-%E5%BF%AB%E9%80%9F%E8%BE%A8%E8%AD%98%E6%8A%95%E8%B3%87%E9%A1%9E%E5%9E%8B-034928443.html" target="_blank" rel="noopener">Yahoo股市(2025-08-07，依證交所分類)</a>。新類型持續推出，以證交所公告為準。</p>
            </div>
          </div>
          <div class="panel doc">
            <h3>被動型 ETF 怎麼追蹤指數</h3>
            <p>被動型 ETF 的目標是讓報酬盡量貼近指數，常見的做法有三種：</p>
            <div class="tablewrap"><table class="stattable pk-kind">
              <thead><tr><th>方法</th><th>做法</th><th>適用</th><th>優缺點</th></tr></thead>
              <tbody>
                <tr><td>完全複製法</td><td style="text-align:left">依指數權重買進<b>全部</b>成分股</td><td style="text-align:left">成分股少、流動性好的指數，例如 0050 追蹤的臺灣 50 指數</td><td style="text-align:left">追蹤誤差最小、最透明；成分股很多或流動性差時成本高</td></tr>
                <tr><td>抽樣(最佳化)複製法</td><td style="text-align:left">只買具代表性的<b>部分</b>成分，讓產業、市值、存續期間等特徵與指數相近</td><td style="text-align:left">成分數量很多的指數，例如全球股票、債券指數</td><td style="text-align:left">交易成本較低；與指數的差距較大</td></tr>
                <tr><td>合成複製法</td><td style="text-align:left">用<b>期貨</b>或交換契約取得指數報酬，不直接持有成分</td><td style="text-align:left">期貨 ETF(商品、指數期貨)、槓桿與反向 ETF</td><td style="text-align:left">可以做到槓桿、反向或投資商品；有期貨轉倉成本、交易對手風險，期貨價格與現貨會有價差</td></tr>
              </tbody>
            </table></div>
            <ul>
              <li><b>指數怎麼決定權重</b>：市值加權(最常見，大公司權重高，例如臺灣 50 指數)、等權重、股利率加權(高股息指數常用)、因子或規則加權(低波動、品質)，並常設單一成分股的權重上限。ETF 的特性其實是由它追蹤的<b>指數規則</b>決定的。</li>
              <li><b>定期調整</b>：指數會定期審核成分股(例如每季或每半年)，ETF 跟著換股；換股頻率越高、週轉率越大，交易成本越高。</li>
              <li><b>追蹤誤差與追蹤差距</b>：追蹤差距是一段期間 ETF 報酬與指數報酬的差(主要來自費用)；追蹤誤差是兩者每日報酬差異的標準差(衡量貼得穩不穩)。</li>
              <li><b>實物申購買回</b>：參與券商可以用一籃子成分股向投信換 ETF，或反過來，市價偏離淨值時就有套利空間，所以大型 ETF 的折溢價通常很小。</li>
            </ul>
          </div>
          <div class="panel doc">
            <h3>持有 ETF 的成本</h3>
            <ul>
              <li><b>內扣費用</b>：經理費、保管費等直接從基金資產扣除，反映在淨值裡，不會另外收費。費用率每年差 0.3%，存 20 年後的差距就很明顯，同樣追蹤臺灣 50 指數的 0050 與 006208 就常被拿來比較費用。</li>
              <li><b>交易成本</b>：買賣時的券商手續費(上限 0.1425%，通常有折扣)；賣出時的證券交易稅，股票型 ETF 為 0.1%，比個股的 0.3% 低。<b>債券型 ETF</b>(被動式，尾碼 B、C)目前停徵證券交易稅，交易稅為 0；但<b>主動式債券 ETF</b>(尾碼 D)不適用停徵，賣出時仍要繳 0.1%。</li>
              <li><b>追蹤誤差</b>：ETF 的報酬與指數的差距，來自費用、現金部位、換股時點等，越小越好。</li>
            </ul>
          </div>
          <div class="panel doc">
            <h3>配息與總報酬</h3>
            <p>ETF 配息時，<b>淨值會同時扣掉配出去的金額</b>(除息)，所以配息本身不是額外賺到的錢，而是把基金裡的錢拿一部分給你。真正的報酬要看<b>總報酬</b>(股價漲跌 + 配息)：</p>
            <div class="formula">總報酬 ＝ 價格報酬 ＋ 配息報酬　　(配息再投入時，用「還原股價」計算)</div>
            <ul>
              <li><b>填息</b>：除息後股價漲回除息前的價格。沒有填息時，拿到的配息被股價下跌抵銷。</li>
              <li>配息在台灣可能要繳二代健保補充保費與所得稅；長期累積資產時，把配息再投入才能發揮複利。</li>
              <li>比較 ETF 績效時，一定要用總報酬比較，只看股價會低估高股息 ETF，只看殖利率則會忽略股價下跌。</li>
            </ul>
          </div>
          <div class="panel">
            <h3>ETF 折溢價</h3>
            ${PREMIUM_REFS.map(r => `<a class="linkcard" href="${r.url}" target="_blank" rel="noopener">
              <div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${esc(r.url)}</small></div><span class="go">前往 ↗</span></a>`).join('')}
            <div class="doc" style="margin-top:12px;">
              <p>ETF 在交易所買賣的價格(市價)由買賣雙方決定，不一定等於它實際持有資產的價值(淨值)。兩者的差距就是折溢價：</p>
              <div class="formula">折溢價率 ＝ (市價 − 淨值) ÷ 淨值</div>
              <ul>
                <li><b>溢價(正值)</b>：市價高於淨值，買進等於用比實際價值更貴的價格買。熱門 ETF 搶購時容易出現。</li>
                <li><b>折價(負值)</b>：市價低於淨值，賣出等於用比實際價值更便宜的價格賣。市場恐慌或流動性差時容易出現。</li>
              </ul>
              <p>盤中看的是「預估淨值」，由投信依成分股即時報價推算。折溢價過大時，日後價格可能向淨值靠攏，追高溢價的 ETF 要特別留意這個風險。</p>
            </div>
          </div>
        </div>`;
    },
  };
})();
