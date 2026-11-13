// Hachi Life Portal — service worker (network first, cache fallback ＋ プッシュ通知)
const CACHE = 'hachi-portal-v2';

// --- プッシュ通知（Firebase Cloud Messaging）。通知の表示とタップ時の画面オープンはSDKが行う ---
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyA8SU4Fe6RsOFUjLSzeerkuuqqOxbBTE3s",
    authDomain: "hachi-portal.firebaseapp.com",
    projectId: "hachi-portal",
    storageBucket: "hachi-portal.firebasestorage.app",
    messagingSenderId: "950289266003",
    appId: "1:950289266003:web:844e30a7d7fccfb829dda6"
  });
  if (firebase.messaging.isSupported && firebase.messaging.isSupported()) firebase.messaging();
} catch (e) { /* 通知が使えない環境でもキャッシュ機能は動かす */ }

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Firebase等はスルー
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
