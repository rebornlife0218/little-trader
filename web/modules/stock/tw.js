/* 股票 · 台股(建置中的頁面只需 name + desc，完成後補上 mount 即可；處置股在 disposition.js) */
LT.register({
  section: 'stock', group: '台股', key: 'daytrade-overnight', name: '隔日沖',
  desc: '今日買進、隔日賣出的短線交易：隔日沖券商分點進出與個股隔日表現。',
});
LT.register({
  section: 'stock', group: '台股', key: 'swing', name: '波段',
  desc: '持有數天到數週的波段交易：趨勢與型態的進出場訊號、持有期間報酬與勝率統計。',
});
LT.register({
  section: 'stock', group: '台股', key: 'tw-strategy', name: '策略',
  desc: '台股的選股與進出場策略回測：最上方選擇策略，與大盤買進持有比較報酬與風險。',
});
