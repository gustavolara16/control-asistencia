// El QR de cada local contiene una dirección web de la app con el código del
// local: https://<app>/marcar?qr=<código>. Así se puede escanear tanto con la
// cámara del celular como con el escáner de la app.

const FORMATO_CODIGO = /^[0-9a-f]{64}$/;

export function esCodigoQrValido(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_CODIGO.test(valor);
}

export function urlDeMarcacion(urlApp: string, codigo: string): string {
  return `${urlApp}/marcar?qr=${codigo}`;
}

/** Extrae el código de lo que leyó la cámara (la dirección completa o el código solo). */
export function extraerCodigoQr(texto: string): string | null {
  const limpio = texto.trim();
  if (esCodigoQrValido(limpio)) return limpio;
  try {
    const codigo = new URL(limpio).searchParams.get("qr");
    return esCodigoQrValido(codigo) ? codigo : null;
  } catch {
    return null;
  }
}
