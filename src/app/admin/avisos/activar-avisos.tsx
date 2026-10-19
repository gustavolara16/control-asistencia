"use client";

import { useEffect, useState, useTransition } from "react";
import { enviarAvisoPrueba, guardarSuscripcion, quitarSuscripcion } from "@/actions/avisos";
import { claseBotonPeligro, claseBotonPrimario, claseBotonSecundario } from "@/components/ui/estilos";

type Situacion =
  | "cargando"
  | "desarrollo" // los avisos necesitan el service worker, que solo se activa en la app publicada
  | "instalar-iphone" // en iPhone solo funcionan con la app instalada en la pantalla de inicio
  | "no-soportado"
  | "bloqueado"
  | "inactivo"
  | "activo";

/** Clave pública VAPID (base64url) → bytes, como la pide el navegador. */
function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  const sistema = /iPhone|iPad|iPod/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "Mac"
          : "Otro";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return [sistema, navegador].filter(Boolean).join(" · ");
}

async function registro(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export function ActivarAvisos({ clavePublica }: { clavePublica: string }) {
  const [situacion, setSituacion] = useState<Situacion>("cargando");
  const [mensaje, setMensaje] = useState<{ ok?: string; error?: string }>({});
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    let cancelado = false;
    async function revisar(): Promise<Situacion> {
      if (process.env.NODE_ENV !== "production") return "desarrollo";
      const soportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!soportado) {
        const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const instalada = window.matchMedia("(display-mode: standalone)").matches;
        return iphone && !instalada ? "instalar-iphone" : "no-soportado";
      }
      if (Notification.permission === "denied") return "bloqueado";
      const suscripcion = await (await registro()).pushManager.getSubscription();
      if (!suscripcion) return "inactivo";
      // Se vuelve a guardar por si el navegador renovó sus claves.
      const r = await guardarSuscripcion(suscripcion.toJSON(), nombreDispositivo());
      return r.ok ? "activo" : "inactivo";
    }
    revisar()
      .then((s) => !cancelado && setSituacion(s))
      .catch(() => !cancelado && setSituacion("no-soportado"));
    return () => {
      cancelado = true;
    };
  }, []);

  const activar = () =>
    iniciar(async () => {
      setMensaje({});
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setSituacion(permiso === "denied" ? "bloqueado" : "inactivo");
          return;
        }
        const reg = await registro();
        const suscripcion =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clavePublica) }));
        const r = await guardarSuscripcion(suscripcion.toJSON(), nombreDispositivo());
        if (!r.ok) {
          setMensaje({ error: r.error });
          return;
        }
        setSituacion("activo");
        setMensaje({ ok: "¡Listo! Los avisos quedaron activados en este dispositivo." });
      } catch {
        setMensaje({ error: "No se pudieron activar los avisos en este navegador. Intentá de nuevo." });
      }
    });

  const desactivar = () =>
    iniciar(async () => {
      setMensaje({});
      const suscripcion = await (await registro()).pushManager.getSubscription();
      if (suscripcion) {
        const r = await quitarSuscripcion({ endpoint: suscripcion.endpoint });
        if (!r.ok) {
          setMensaje({ error: r.error });
          return;
        }
        await suscripcion.unsubscribe();
      }
      setSituacion("inactivo");
      setMensaje({ ok: "Los avisos quedaron desactivados en este dispositivo." });
    });

  const probar = () =>
    iniciar(async () => {
      setMensaje({});
      const r = await enviarAvisoPrueba();
      setMensaje("ok" in r ? { ok: r.ok } : { error: r.error });
    });

  return (
    <div className="flex flex-col gap-3">
      {situacion === "cargando" && <p className="text-sm text-slate-500">Revisando este dispositivo…</p>}

      {situacion === "desarrollo" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Los avisos solo funcionan en la app publicada (control-asistencia-locales.netlify.app), no en esta copia de prueba.
        </p>
      )}

      {situacion === "instalar-iphone" && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">En iPhone, primero instalá la app:</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>
              Tocá el botón <strong>Compartir</strong> de Safari (el cuadrado con la flecha).
            </li>
            <li>
              Elegí <strong>Agregar a inicio</strong>.
            </li>
            <li>Abrí la app desde el ícono nuevo, entrá a Avisos y activalos.</li>
          </ol>
        </div>
      )}

      {situacion === "no-soportado" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Este navegador no permite notificaciones. Probá con Chrome en Android o en la computadora, o con la app instalada
          en iPhone.
        </p>
      )}

      {situacion === "bloqueado" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Las notificaciones están bloqueadas para esta app. Habilitalas en la configuración del navegador o del celular
          (Notificaciones → Control de Asistencia → Permitir) y volvé a abrir esta página.
        </p>
      )}

      {situacion === "inactivo" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-700">Los avisos están apagados en este dispositivo.</p>
          <button type="button" onClick={activar} disabled={ocupado} className={`${claseBotonPrimario} self-start`}>
            {ocupado ? "Activando…" : "Activar avisos en este dispositivo"}
          </button>
        </div>
      )}

      {situacion === "activo" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-emerald-800">✓ Los avisos están activados en este dispositivo.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={probar} disabled={ocupado} className={claseBotonSecundario}>
              Enviar un aviso de prueba
            </button>
            <button type="button" onClick={desactivar} disabled={ocupado} className={claseBotonPeligro}>
              Desactivar en este dispositivo
            </button>
          </div>
        </div>
      )}

      {mensaje.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {mensaje.error}
        </p>
      )}
      {mensaje.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {mensaje.ok}
        </p>
      )}
    </div>
  );
}
