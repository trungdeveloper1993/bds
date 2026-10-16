/*
 * Service worker tối giản: lưu sẵn giao diện ứng dụng để mở được khi mất mạng.
 * Dữ liệu (dự án, BĐS, khách, ảnh, tài liệu) nằm trong IndexedDB nên luôn có sẵn.
 */
const CACHE = 'bds-app-v1';
const MAX_ENTRIES = 80;
const SHELL = /\/(index\.html|favicon\.svg|manifest\.webmanifest|icon-\d+\.png)?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // Đọc index.html để biết tên file JS/CSS (có mã băm) của phiên bản hiện tại.
        const res = await fetch('./', { cache: 'no-cache' });
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put('./index.html', res);
          const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
          await cache.addAll(['./favicon.svg', './manifest.webmanifest', './icon-192.png', ...assets]);
        }
      } catch {
        // Mất mạng lúc cài: sẽ lưu dần khi dùng.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = (await cache.keys()).filter((k) => !SHELL.test(new URL(k.url).pathname));
  if (keys.length > MAX_ENTRIES) {
    await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Trang chính: ưu tiên mạng để luôn có phiên bản mới, mất mạng thì dùng bản đã lưu.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // File tĩnh (tên có mã băm nên không đổi) và font: lấy từ bộ nhớ đệm trước.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy).then(() => trim(c)));
          }
          return res;
        }),
    ),
  );
});
