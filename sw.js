const CACHE_NAME = "gallos-torres-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/db.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intenta traer la versión más nueva; si no hay red,
// recién ahí usa lo último que se guardó en caché. Así las actualizaciones
// de la app llegan solas, sin que el usuario tenga que borrar datos del sitio.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isFonts = event.request.url.includes("fonts.googleapis.com") || event.request.url.includes("fonts.gstatic.com");
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (isFonts ? undefined : caches.match("./index.html"))))
  );
});
