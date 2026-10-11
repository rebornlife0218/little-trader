/* 股票 · 台股(建置中的頁面只需 name + desc，完成後補上 mount 即可) */
LT.register({
  section: 'stock', group: '台股', key: 'disposition', name: '處置股',
  desc: '因成交異常被交易所列為處置的股票：處置期間、處置措施(如分盤撮合、預收款券)與處置後走勢。',
});
LT.register({
  section: 'stock', group: '台股', key: 'daytrade-overnight', name: '隔日沖',
  desc: '今日買進、隔日賣出的短線交易：隔日沖券商分點進出與個股隔日表現。',
});
LT.register({
  section: 'stock', group: '台股', key: 'swing', name: '波段',
  desc: '持有數天到數週的波段交易：趨勢與型態的進出場訊號、持有期間報酬與勝率統計。',
});
