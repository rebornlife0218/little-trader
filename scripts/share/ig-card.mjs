// IG 圖卡的版面(1080×1350)：5 張照「門面、戳痛點、重點 1、重點 2、邀請卡」，內容在 ig-topics.mjs
// 浮水印只在每張最下面一行(LOGO、網站名稱、第幾張)，不壓到內容
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 文字裡的 **重點** 換成主色
const hl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

const CSS = `
  body{margin:0;background:#000;}
  .card{width:1080px;height:1350px;box-sizing:border-box;padding:110px 92px 0;background:radial-gradient(circle at 85% 8%, rgba(240,185,77,.10), transparent 45%), var(--bg);
        color:var(--text);position:relative;overflow:hidden;font-family:'Microsoft JhengHei','Inter',sans-serif;display:flex;flex-direction:column;}
  .card + .card{margin-top:20px;}
  em{font-style:normal;color:var(--amber);}
  .tag{display:inline-block;align-self:flex-start;font-size:30px;font-weight:700;color:#111;background:var(--amber);padding:8px 22px;border-radius:999px;}
  .hook{font-size:92px;line-height:1.25;font-weight:800;margin:44px 0 36px;letter-spacing:1px;}
  .h{font-size:66px;line-height:1.3;font-weight:800;margin:40px 0 44px;}
  .p{font-size:40px;line-height:1.65;}
  .mute{color:var(--mute);}
  .swipe{margin-top:auto;margin-bottom:170px;font-size:36px;color:var(--amber);font-weight:700;}
  .mascot{position:absolute;right:90px;top:800px;width:280px;height:280px;transform:rotate(8deg);}
  .steps{display:flex;flex-direction:column;gap:28px;}
  .step{display:flex;gap:30px;align-items:center;background:var(--panel);border:1px solid var(--border);border-radius:28px;padding:34px 36px;}
  .step .n{flex:0 0 76px;height:76px;border-radius:50%;background:var(--amber);color:#111;font-size:40px;font-weight:800;display:flex;align-items:center;justify-content:center;}
  .step .t{font-size:40px;line-height:1.5;}
  .step .t b{font-weight:800;}
  .vs{display:grid;gap:30px;}
  .vs .box{border-radius:30px;padding:38px 44px;border:2px solid var(--border);background:var(--panel);}
  .vs .box.bad{border-color:color-mix(in srgb, var(--down) 60%, transparent);}
  .vs .box.good{border-color:color-mix(in srgb, var(--up) 60%, transparent);}
  .vs .lbl{font-size:38px;font-weight:700;}
  .vs .num{font-size:76px;font-weight:800;margin-top:12px;}
  .vs .bad .num{color:var(--down);} .vs .good .num{color:var(--up);}
  .vs .sub{font-size:30px;color:var(--mute);margin-top:8px;}
  .bars{display:flex;flex-direction:column;gap:46px;margin-top:10px;}
  .bar .lbl{display:flex;justify-content:space-between;align-items:baseline;font-size:40px;font-weight:700;margin-bottom:16px;}
  .bar .lbl b{font-size:56px;}
  .bar .track{height:70px;border-radius:18px;background:var(--panel2);overflow:hidden;}
  .bar .fill{height:100%;border-radius:18px;}
  .q{margin-top:56px;font-size:48px;font-weight:800;line-height:1.4;}
  .note{font-size:30px;color:var(--mute);margin-top:30px;line-height:1.5;}
  .cta{margin-top:auto;margin-bottom:160px;padding:44px;border-radius:30px;background:var(--panel);border:2px solid var(--amber);}
  .cta .big{font-size:50px;font-weight:800;color:var(--amber);}
  .cta .p{font-size:38px;margin-top:14px;}
  .foot{position:absolute;left:92px;right:92px;bottom:50px;display:flex;align-items:center;justify-content:space-between;font-size:26px;color:var(--mute);}
  .foot img{width:38px;height:38px;vertical-align:middle;margin-right:10px;}
  .foot b{color:var(--text);font-weight:700;}
  .dots{display:flex;gap:10px;} .dots i{width:14px;height:14px;border-radius:50%;background:var(--border);} .dots i.on{background:var(--amber);}`;

// 重點卡的兩種內容：vs(兩格對比)或 bars(長條比較)
function point(p) {
  if (p.vs) return `<div class="vs">${p.vs.map(b => `<div class="box ${b.good ? 'good' : 'bad'}"><div class="lbl">${hl(b.label)}</div><div class="num">${hl(b.num)}</div>${b.sub ? `<div class="sub">${hl(b.sub)}</div>` : ''}</div>`).join('')}</div>`;
  if (p.bars) {
    const max = Math.max(...p.bars.map(b => b.value));
    return `${p.lead ? `<div class="p" style="font-size:38px;margin:-10px 0 40px;">${hl(p.lead)}</div>` : ''}<div class="bars">${p.bars.map((b, i) =>
      `<div class="bar"><div class="lbl"><span>${hl(b.label)}</span><b>${esc(b.text)}</b></div><div class="track"><div class="fill" style="width:${b.value / max * 100}%;background:${i ? 'var(--blue)' : 'var(--amber)'}"></div></div></div>`).join('')}</div>`;
  }
  return '';
}

export function cardsHtml(t, base = '/') {
  const N = 5;
  const foot = i => `<div class="foot"><span><img src="assets/img/logo.svg" alt=""><b>Little Trader</b> 小交易員的研究室</span>
    <span class="dots">${Array.from({ length: N }, (_, k) => `<i class="${k === i - 1 ? 'on' : ''}"></i>`).join('')}</span></div>`;
  const [p1, p2] = t.points;
  return `<!DOCTYPE html><html lang="zh-Hant" data-theme="dark"><head><meta charset="UTF-8"><base href="${esc(base)}">
  <link rel="stylesheet" href="assets/css/components.css"><style>${CSS}</style></head><body>
  <section class="card">
    <span class="tag">${esc(t.cover.tag)}</span>
    <div class="hook">${hl(t.cover.hook)}</div>
    <img class="mascot" src="assets/img/logo.svg" alt="">
    <div class="p mute">${hl(t.cover.sub)}</div>
    <div class="swipe">往左滑 →</div>
    ${foot(1)}
  </section>
  <section class="card">
    <span class="tag">你是不是也這樣？</span>
    <div class="h">${hl(t.pain.title)}</div>
    <div class="steps">${t.pain.items.map(([icon, text]) => `<div class="step"><div class="n">${icon}</div><div class="t">${hl(text)}</div></div>`).join('')}</div>
    ${foot(2)}
  </section>
  ${[p1, p2].map((p, k) => `<section class="card">
    <span class="tag">重點 ${k + 1}</span>
    <div class="h">${hl(p.title)}</div>
    ${point(p)}
    ${p.q ? `<div class="q">${hl(p.q)}</div>` : ''}
    ${p.note ? `<div class="note">${hl(p.note)}</div>` : ''}
    ${foot(k + 3)}
  </section>`).join('')}
  <section class="card">
    <span class="tag">覺得有用嗎？</span>
    <div class="h">按個<em>收藏</em> ⭐<br>${hl(t.save)}</div>
    <div class="p">也分享給${hl(t.share)} 👀</div>
    <div class="cta">
      <div class="big">${hl(t.cta)}</div>
      <div class="p">完整研究在 <b>Little Trader</b><br>連結在個人檔案 🔗</div>
      <div class="p mute" style="font-size:28px;">歷史回測不代表未來，內容僅供研究參考，不構成投資建議</div>
    </div>
    ${foot(5)}
  </section></body></html>`;
}
