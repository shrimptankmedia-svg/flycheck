// App shell is network-first with a cache fallback for offline; data (forecast,
// Kp, METAR) is always fetched live and the app keeps its own last-good copy in localStorage.
const SHELL = "flycheck-shell-v4";
const FILES = [
  "./", "index.html", "style.css", "core.js", "app.js", "manifest.webmanifest",
  "data/aerodromes.json", "data/airspace.json", "icons/icon-180.png", "icons/icon-192.png", "icons/mark.png",
  "illus/mini.png", "illus/air.png", "illus/mavic.png", "illus/avata.png", "illus/phantom.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" so the precache skips the HTTP cache and gets the files just deployed.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/data/aviation.json")) return;
  // Network first so new deploys show up, cache as fallback for offline.
  // cache: "no-cache" revalidates with the server instead of taking a heuristically fresh HTTP-cache copy.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((r) => {
      if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(SHELL).then((c) => c.put(e.request, copy))); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === "navigate" ? caches.match("./") : undefined)))
  );
});
