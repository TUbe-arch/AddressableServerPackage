const cacheName = "TCIT-DCIM_NCHC-0.2.3";
const contentToCache = [
    "TemplateData/style.css"
    // 注意：Unity build 檔案不放進 contentToCache
    // .unityweb 是預壓縮格式，SW cache 後回傳會有 double Content-Encoding decode 問題
    // 這些大檔案改由 nginx 的 no-cache + ETag 處理（沒改回 304，有改才重下）
];

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');

    e.waitUntil((async function () {
      const cache = await caches.open(cacheName);
      console.log('[Service Worker] Caching all: app shell and content');
      await cache.addAll(contentToCache);
    })());
});

self.addEventListener('fetch', function (e) {
    const url = e.request.url;

    // .unityweb：預壓縮，SW cache 會造成 double decode 錯誤 → 交給 nginx no-cache+ETag
    if (url.match(/\.unityweb($|\?)/)) return;

    // loader.js：build 入口，必須每次拿最新
    if (url.match(/\.loader\.js($|\?)/)) return;

    // API 請求：POST 無法被 cache，資料需即時
    if (url.includes('/api/')) return;

    e.respondWith((async function () {
      let response = await caches.match(e.request);
      console.log(`[Service Worker] Fetching resource: ${url}`);
      if (response) { return response; }

      response = await fetch(e.request);
      const cache = await caches.open(cacheName);
      console.log(`[Service Worker] Caching new resource: ${url}`);
      cache.put(e.request, response.clone());
      return response;
    })());
});
