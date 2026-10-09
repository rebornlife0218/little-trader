/* 個股區塊(建置中的頁面只需 name + desc，完成後補上 mount 即可) */
LT.register({
  section: 'stock', key: 'disposition', name: '處置股',
  desc: '因成交異常被交易所列為處置的股票：處置期間、處置措施(如分盤撮合、預收款券)與處置後走勢。',
});
LT.register({
  section: 'stock', key: 'daytrade-overnight', name: '隔日沖',
  desc: '今日買進、隔日賣出的短線交易：隔日沖券商分點進出與個股隔日表現。',
});
