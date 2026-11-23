/* 후니의 웹 앱 모음 - Service Worker
 * 정적 페이지만 캐시(네트워크 우선). 라디오/TV 라이브 스트림과 외부 API는 절대 가로채지 않는다.
 */
const CACHE = 'huni-apps-v3';

const PRECACHE = [
  '/',
  '/index.html',
  '/radio.html',
  '/tv.html',
  '/math.html',
  '/english.html',
  '/auction.html',
  '/realestate.html',
  '/rental.html',
  '/play.html',
  '/manifest.webmanifest',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* 캐시해도 되는 정적 파일 확장자만 */
const STATIC = /\.(?:html|css|js|mjs|webmanifest|json|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|txt)(?:\?.*)?$/i;

/* 스트림·미디어는 손대지 않음 */
const MEDIA = /\.(?:m3u8|m3u|ts|mp4|m4s|mp3|m4a|aac|ogg|oga|opus|flac|webm|wav|mpd)(?:\?.*)?$/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 하나가 실패해도 설치는 계속되도록 개별 처리
    await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) 외부 도메인(스트림·API·CDN)은 브라우저에 그대로 맡긴다
  if (url.origin !== self.location.origin) return;

  // 2) 라이브 스트림·미디어, Range 요청은 개입하지 않는다
  if (MEDIA.test(url.pathname) || req.headers.has('range')) return;

  // 3) 서비스 워커 자신은 캐시하지 않는다
  if (url.pathname === '/sw.js') return;

  const isNavigate = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  const isStatic = STATIC.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/');

  if (!isNavigate && !isStatic) return;

  event.respondWith((async () => {
    try {
      // 네트워크 우선
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic' && !fresh.headers.has('range')) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // 오프라인 폴백
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (isNavigate) {
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
