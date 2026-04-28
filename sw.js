// IVAI Coach – Service Worker v1.0
// Offline-first med background sync för molnbackup

const CACHE_NAME = "ivai-v1";
const SYNC_TAG = "ivai-cloud-sync";

// Filer att cacha för offline-användning
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Rajdhani:wght@400;600;700&display=swap"
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cacha lokala assets; skippa externa fonts om de misslyckas
      return cache.addAll(STATIC_ASSETS.filter(u => u.startsWith("/"))).then(() => {
        return self.skipWaiting();
      });
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH – Offline-first strategi ──────────────────────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API-anrop (Anthropic, Google Drive) – aldrig cacheade
  if (url.hostname.includes("anthropic.com") ||
      url.hostname.includes("googleapis.com") ||
      url.hostname.includes("google.com")) {
    return; // låt browser hantera normalt
  }

  // App-filer: cache-first, fallback till nätverk
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response && response.status === 200 && e.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback för navigation
        if (e.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

// ── BACKGROUND SYNC – köar backup när offline ───────────
self.addEventListener("sync", (e) => {
  if (e.tag === SYNC_TAG) {
    e.waitUntil(processPendingUploads());
  }
});

async function processPendingUploads() {
  // Skickar meddelande till klienten att trigga cloud-sync
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach(client => {
    client.postMessage({ type: "TRIGGER_CLOUD_SYNC" });
  });
}

// ── PUSH NOTIFICATIONS (framtida) ───────────────────────
self.addEventListener("push", (e) => {
  if (e.data) {
    const data = e.data.json();
    e.waitUntil(
      self.registration.showNotification("IVAI Coach", {
        body: data.message || "Backup slutförd",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "ivai-notification"
      })
    );
  }
});

// ── MESSAGE HANDLER ──────────────────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "REQUEST_SYNC") {
    self.registration.sync?.register(SYNC_TAG).catch(() => {
      // Background Sync ej stödd – trigga direkt
      processPendingUploads();
    });
  }
  if (e.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
