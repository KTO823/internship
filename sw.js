// sw.js — 實習助手 Service Worker
// 每次正式發布新版本時，請記得把 CACHE_VERSION 改成新的字串（例如日期），
// 否則使用者的手機會一直吃到舊的快取版本。
const CACHE_VERSION = 'v1-2026-07-13';
const CACHE_NAME = `intern-app-${CACHE_VERSION}`;

// App Shell：離線時也要能開啟的最基本檔案
const APP_SHELL = [
  './',
  './index.html',
  './assets/app.css',
  './assets/app.js',
  './assets/manifest.json',
  './assets/icons/icon-192.JPG',
  './assets/icons/icon-512.JPG',
  './assets/icons/icon-512.JPG',
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
