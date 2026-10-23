/* Firebase 與 Google 登入的設定(都是公開資訊，不是密碼)：
   apiKey、projectId：Firebase 主控台 › 專案設定 › 一般
   clientId：Firebase 主控台 › Authentication › Sign-in method › Google › 網頁 SDK 設定 › 網路用戶端 ID
   留空時登入功能停用(網站照常以訪客身分運作) */
window.LT_FIREBASE = {
  apiKey: '',
  projectId: '',
  clientId: '',
};
