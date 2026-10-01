// Subir VERSION en cada despliegue que cambie archivos: así el navegador
// instala el service worker nuevo y borra la caché anterior.
const VERSION = "v3";
const CACHE_NAME = `gallos-torres-${VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/db.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/mascota.png",
  "./icons/vacio.png"
];
const FUENTES = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  // cache: "reload" salta la caché HTTP para no precargar una versión vieja.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: siempre intenta traer la versión más nueva; si no hay red,
// recién ahí usa lo último que se guardó en caché. Así las actualizaciones
// de la app llegan solas, sin que el usuario tenga que borrar datos del sitio.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const esPropio = url.origin === self.location.origin;
  const esFuente = FUENTES.includes(url.hostname);
  // Extensiones del navegador, analíticas, etc.: que las maneje el navegador.
  if (!esPropio && !esFuente) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Solo se guardan respuestas buenas (las fuentes llegan "opaque").
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Sin red y sin copia: las pantallas caen en index.html (la app es
        // de una sola página); lo demás falla limpio en vez de devolver HTML.
        if (req.mode === "navigate") return (await caches.match("./index.html")) || Response.error();
        return Response.error();
      })
  );
});
