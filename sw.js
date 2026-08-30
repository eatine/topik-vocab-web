// Service Worker：TOPIK 词汇系统 v7
// v7：升级缓存名强制所有旧 SW 客户端失效 + 重载，确保 v30.9 扁平化词卡生效
// 注意：v7 不再在 activate 中自动 client.navigate，避免反复重载；改由 HTML ?v=xxx 触发
const CACHE_NAME = 'topik-vocab-v7';
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

// 激活：清理所有旧缓存 + 接管客户端（不强制重载）
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      // 立即控制所有客户端（但不重载，等用户下次手动刷新）
      .then(() => self.clients.claim())
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