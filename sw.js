// Service Worker：TOPIK 词汇系统 v5
// 核心修复：HTML 永远从网络拉取（绕过所有缓存），其他资源用缓存兜底
// 这样 PWA 桌面 app 无论旧版本多陈旧，打开主页永远拿到 GitHub 最新版本
const CACHE_NAME = 'topik-vocab-v5';
const ASSETS = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
  // 注意：index.html 不放入缓存，因为 HTML 永远从网络获取
];

// 安装：立即激活（不等旧的标签页关闭）
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 激活：清理所有旧缓存 + 立即控制所有客户端
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
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
          // 成功：直接返回网络最新版（不缓存 HTML）
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
        // 离线回退
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
