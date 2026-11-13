// ===== Hachi Life Portal — 通知（プッシュ＋メール） =====
// config.js の PUSH_VAPID_KEY / NOTIFY_URL が空のあいだは何もしない
(function(){
  const IS_STAFF = /staff\.html/.test(location.pathname) || /\/portal\/?$/.test(location.pathname);
  const T = IS_STAFF
    ? {on:'Turn on notifications', sub:'Get alerts for new messages and schedule changes', ok:'Notifications are on', ng:'Notifications are blocked. Please allow them in your phone settings.', ios:'Add this app to your Home Screen to receive notifications', btn:'Turn on', later:'Later'}
    : {on:'通知をオンにする', sub:'新しいメッセージや予定のお知らせを受け取れます', ok:'通知をオンにしました', ng:'通知がブロックされています。端末の設定で許可してください。', ios:'ホーム画面に追加すると通知を受け取れます', btn:'オンにする', later:'あとで'};
  const say = m => { try{ toast(m) }catch(e){} };

  // 送信側：書き込みのあとに呼ぶ。失敗しても本体の動作は止めない
  window.hlNotify = async function(type, id){
    try{
      if(typeof NOTIFY_URL==='undefined' || !NOTIFY_URL || !auth.currentUser || !id) return;
      const idToken = await auth.currentUser.getIdToken();
      fetch(NOTIFY_URL, {method:'POST', mode:'no-cors', keepalive:true, body:JSON.stringify({idToken, type, id})}).catch(()=>{});
    }catch(e){ console.warn('notify', e) }
  };

  if(typeof PUSH_VAPID_KEY==='undefined' || !PUSH_VAPID_KEY) return;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let swReg = null, msg = null, bar = null;

  function loadSdk(){
    return new Promise((res, rej)=>{
      if(firebase.messaging) return res();
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function saveToken(u){
    await loadSdk();
    if(!msg){ msg = firebase.messaging(); msg.onMessage(p=>{ const n=(p&&p.notification)||{}; say((n.title?n.title+'：':'')+(n.body||'')) }) }
    swReg = swReg || await navigator.serviceWorker.register('sw.js');
    const token = await msg.getToken({vapidKey:PUSH_VAPID_KEY, serviceWorkerRegistration:swReg});
    if(!token) return;
    await db.collection('pushTokens').doc(u.uid).set({tokens:firebase.firestore.FieldValue.arrayUnion(token), at:TS()}, {merge:true});
  }
  function showBar(text, withBtn, u){
    if(bar) bar.remove();
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:9999;background:#2A2015;color:#F4EBD8;border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13px;line-height:1.45;max-width:560px;margin:0 auto';
    const tx = document.createElement('div'); tx.style.cssText='flex:1;min-width:0';
    tx.innerHTML = '<b style="display:block;font-size:14px"></b><span style="opacity:.8"></span>';
    tx.querySelector('b').textContent = '🔔 ' + text[0]; tx.querySelector('span').textContent = text[1]||'';
    bar.appendChild(tx);
    if(withBtn){
      const b = document.createElement('button'); b.textContent = T.btn;
      b.style.cssText = 'border:0;background:#E8A33D;color:#231A0F;font-weight:900;border-radius:999px;padding:9px 14px;font-size:13px;white-space:nowrap;cursor:pointer';
      b.onclick = async()=>{
        try{
          const p = await Notification.requestPermission();
          if(p==='granted'){ await saveToken(u); say(T.ok); bar.remove() }
          else { say(T.ng); bar.remove() }
        }catch(e){ console.warn('push', e); bar.remove() }
      };
      bar.appendChild(b);
    }
    const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', T.later);
    x.style.cssText = 'border:0;background:none;color:#BFAF93;font-size:20px;line-height:1;padding:4px 6px;cursor:pointer';
    x.onclick = ()=>{ try{ localStorage.setItem('hlPushLater', String(Date.now())) }catch(e){} bar.remove() };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }
  function snoozed(){ try{ return Date.now() - (+localStorage.getItem('hlPushLater')||0) < 3*864e5 }catch(e){ return false } }

  auth.onAuthStateChanged(async u=>{
    if(!u){ if(bar) bar.remove(); return }
    try{
      if(!('serviceWorker' in navigator)) return;
      if(!('Notification' in window) || !('PushManager' in window)){
        if(iOS && !standalone && !snoozed()) showBar([T.ios, ''], false, u);
        return;
      }
      if(Notification.permission==='granted'){ await saveToken(u) }
      else if(Notification.permission==='default' && !snoozed()){ showBar([T.on, T.sub], true, u) }
    }catch(e){ console.warn('push', e) }
  });
})();
