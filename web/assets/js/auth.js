/* 登入：Google → Firebase → 本站的 session cookie(30 天，HttpOnly)
   不用 Firebase SDK(它會從 Google 載入外部腳本，本站 CSP 只允許同源)，改走三步：
     1. login() 轉到 Google 登入頁(response_type=id_token)，回到網站根目錄時網址的 # 帶著 id_token，再換回登入前的頁面
     2. 用 Firebase REST API(accounts:signInWithIdp)換成 Firebase ID token
     3. POST api/session，後端驗證後發 cookie；之後頁面程式、資料、API 都靠這個 cookie 判斷是不是會員
   設定在 assets/js/firebase-config.js；權限(哪些區塊要登入)由後端 functions/_lib/access.json 決定，經 api/me 傳回 */
const LTAuth = (() => {
  const CFG = window.LT_FIREBASE || {};
  const ready = !!(CFG.apiKey && CFG.clientId);
  const KEY = 'lt.oauth';
  const MAIN_SITE = 'https://little-trader.pages.dev/';
  const FALLBACK_LOCKED = ['etf', 'stock', 'option'];   // 連不到 api/me(例如 GitHub Pages 備援站)時當作訪客
  const redirectUri = () => new URL('./', document.baseURI).href;   // 一律回到網站根目錄(Google 後台登記的網址)，不管從哪一頁登入
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
  const jwtPayload = t => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  let me = null, error = '';

  function login() {
    if (!ready) return;
    const st = { state: hex(16), nonce: hex(16), back: location.pathname + location.search };
    try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    const q = new URLSearchParams({ client_id: CFG.clientId, redirect_uri: redirectUri(), response_type: 'id_token',
                                    scope: 'openid email profile', nonce: st.nonce, state: st.state, prompt: 'select_account' });
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  }

  // Google 轉回來時(#id_token=…&state=…)：馬上把網址換回登入前的頁面，再完成登入
  const pending = (() => {
    const h = location.hash;
    if (!/^#(.*&)?(id_token|error)=/.test(h)) return null;
    const p = new URLSearchParams(h.slice(1));
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch (e) {}
    const back = st && st.back ? (st.back.startsWith('#/') ? st.back.slice(2) : st.back) : './';   // #/… 是改版前存的
    history.replaceState(null, '', back || './');
    if (p.get('error')) return Promise.reject(new Error('Google 登入已取消'));
    const idt = p.get('id_token');
    if (!st || p.get('state') !== st.state || jwtPayload(idt).nonce !== st.nonce) return Promise.reject(new Error('登入驗證失敗，請再試一次'));
    return exchange(idt);
  })();
  if (pending) pending.catch(() => {});   // 錯誤在 load() 裡處理

  async function exchange(googleIdToken) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(CFG.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postBody: `id_token=${googleIdToken}&providerId=google.com`, requestUri: redirectUri(), returnSecureToken: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.idToken) throw new Error('Firebase 登入失敗' + (j.error ? `：${j.error.message}` : ''));
    const s = await fetch('api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: j.idToken }) });
    if (!s.ok) throw new Error(`登入失敗(HTTP ${s.status})`);
  }

  // 目前身分：{ kind: 'member'|'guest', email, admin, memberSections, scripts, api(後端是否可用), loginReady }
  async function load() {
    if (pending) { try { await pending; } catch (e) { error = e.message; } }
    try {
      const r = await fetch('api/me', { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('Content-Type') || '').includes('json')) throw new Error();
      me = { ...(await r.json()), api: true };
    } catch (e) {
      me = { kind: 'guest', email: null, admin: false, memberSections: FALLBACK_LOCKED, scripts: [], api: false, loginReady: false };
    }
    me.canLogin = me.api && me.loginReady && ready;
    return me;
  }

  async function logout() {
    try { await fetch('api/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  }

  return { login, logout, load, MAIN_SITE, get me() { return me; }, get error() { return error; } };
})();
