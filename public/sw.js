// Service worker mínimo: muestra una página "Sin conexión" cuando no hay red.
// A propósito NO guarda en caché páginas autenticadas ni datos de asistencia:
// las marcaciones siempre deben pasar por el servidor.
const CACHE_NAME = "offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});

// Avisos para los administradores (por ejemplo, cuando un empleado marca).
// El servidor los envía cifrados; acá solo se muestran.
self.addEventListener("push", (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    // Contenido inesperado: se muestra un aviso genérico.
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "Control de Asistencia", {
      body: aviso.cuerpo || "",
      icon: "/icons/icon-192.png",
      lang: "es",
      data: { url: typeof aviso.url === "string" ? aviso.url : "/panel" },
    }),
  );
});

// Al tocar el aviso se abre la app (solo páginas de este mismo sitio).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/panel", self.location.origin);
  if (destino.origin !== self.location.origin) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) {
        return abierta
          .navigate(destino.href)
          .then((v) => (v ?? abierta).focus())
          .catch(() => self.clients.openWindow(destino.href));
      }
      return self.clients.openWindow(destino.href);
    }),
  );
});
