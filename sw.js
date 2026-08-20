// Service Worker：TOPIK 词汇系统 v6
// 关键增强：激活时强制刷新所有客户端，确保 v15+ 的 dueWords 修正生效
// 这解决"用户刷新页面但 SW 还跑老 HTML"的难题
const CACHE_NAME = 'topik-vocab-v6';
const ASSETS = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// 安装：立即激活
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 激活：清理所有旧缓存 + 强制刷新所有打开的标签页/PWA
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      // 立即控制所有客户端
      .then(() => self.clients.claim())
      // 强制让所有打开此 PWA 的客户端立即重新加载（确保看到新 HTML）
      .then(() => self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          try { client.navigate(client.url); } catch(e) {}
        });
      }))
  );
});

// 请求：HTML 永远从网络（避免缓存）；其他资源缓存优先
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.url.includes('/api/')) return;

  // 关键修复：navigation（HTML 页面）永远从网络获取，绕过缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          // 成功：直接返回网络最新版
          return response;
        })
        .catch(() => {
          // 网络失败（离线）：用缓存的 HTML 兜底
          return caches.match('./index.html').then((cached) => {
            if (cached) return cached;
            return new Response('<h1>离线模式</h1><p>请连接网络后访问</p>', { headers: { 'Content-Type': 'text/html' } });
          });
        })
    );
    return;
  }

  // 其他资源（图片、manifest、JS）：缓存优先 + 网络更新
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 后台更新缓存
        fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});