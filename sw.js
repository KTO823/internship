// sw.js — 實習助手 Service Worker
// 每次正式發布新版本時，請記得把 CACHE_VERSION 改成新的字串（例如日期），
// 否則使用者的手機會一直吃到舊的快取版本。
const CACHE_VERSION = 'v2-2026-07-13';
const CACHE_NAME = `intern-app-${CACHE_VERSION}`;

// App Shell：離線時也要能開啟的最基本檔案
const APP_SHELL = [
  './',
  './index.html',
  './assets/app.css',
  './assets/app.js',
  './assets/manifest.json',
  './assets/icons/icon192.jpg',
  './assets/icons/icon512.jpg',
  './assets/icons/icon512.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('intern-app-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 不要快取/攔截 Firebase 或其他外部 API 呼叫，這些一律直接走網路，
// 確保登入、雲端同步、匯率等資料永遠是最新的。
function isAppOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!isAppOrigin(url)) return; // 交給瀏覽器直接處理（Firebase、字型 CDN 等）

  // 導覽請求（使用者直接打開 / 重新整理 App）：
  // 優先嘗試網路拿最新版本，離線時退回快取的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', resClone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其他同源靜態資源：快取優先，背景更新（stale-while-revalidate）
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ---- 背景推播：FCM 送來的訊息會以標準 Push 事件送到這裡，
// App 沒開、螢幕鎖著也能收到 ----
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }

  const notification = payload.notification || payload.data || {};
  const title = notification.title || '實習助手提醒';
  const options = {
    body: notification.body || '你有提醒事項到期了',
    icon: './assets/icons/icon192.jpg',
    badge: './assets/icons/icon192.jpg',
    data: { url: (payload.data && payload.data.url) || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 點通知時打開（或切到）App 分頁
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
