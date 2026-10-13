"use client";

import { useEffect } from "react";

// Registra el service worker solo en producción para no interferir con el
// desarrollo (recarga en caliente y caché del navegador).
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("No se pudo registrar el service worker", error));
  }, []);

  return null;
}
