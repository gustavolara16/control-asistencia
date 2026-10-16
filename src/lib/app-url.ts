import "server-only";
import { headers } from "next/headers";

// Dirección pública de la app (para armar los QR). En producción se define
// con APP_URL; si no está, se usa la dirección con la que se abrió la página.
export async function obtenerUrlApp(): Promise<string> {
  const configurada = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configurada) return configurada;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (esUrlLocal(`http://${host}`) ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** true si la dirección solo funciona en esta computadora o en la red local. */
export function esUrlLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
}
