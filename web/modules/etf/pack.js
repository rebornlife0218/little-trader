/* ETF · ETF大禮包(目錄頁 LT.catalog，網址 etf/pack/<子主題>)：ETF介紹(intro.js)、怎麼存ETF(save.js)、即將發行ETF(etf.js)
   子主題的畫面函式放在 LTETF.pages；舊網址 etf/intro、etf/save、etf/upcoming 轉到這裡，etf/pack/<研究>(更早的 ETF大禮包)轉到 ETF研究 */
(() => {
  const ITEMS = [
    { key: 'intro', name: 'ETF介紹', desc: '是什麼、種類、成本、配息、折溢價' },
    { key: 'save', name: '怎麼存ETF', desc: '常存 ETF 比較、配息怎麼繳稅、0050 vs 勞退基金' },
    { key: 'upcoming', name: '即將發行ETF', desc: '募集中與送件申請中的新 ETF' },
  ];
  LT.catalog({
    section: 'etf', key: 'pack', name: 'ETF大禮包',
    desc: '認識 ETF、怎麼存 ETF，以及即將發行的新 ETF',
    groups: [{ name: '', items: ITEMS.map(x => ({ ...x, run: (el, ctx) => LTETF.pages[x.key].run(el, ctx) })) }],
    redirect: k => /^[\w-]+$/.test(k) ? `etf/research/${k}` : '',
  });
  ITEMS.forEach(x => LT.register({ section: 'etf', key: x.key, name: x.name, hidden: true, redirect: true,
    mount() { LT.go(`etf/pack/${x.key}`, { replace: true }); } }));
})();
