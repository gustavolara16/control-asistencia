// Estado que devuelven las Server Actions de los formularios.
export type EstadoFormulario = {
  error?: string;
  ok?: string;
};

export const estadoInicial: EstadoFormulario = {};

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_UUID.test(valor);
}

export function leerTexto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Entero dentro de [min, max], o null si no es válido. */
export function leerEntero(formData: FormData, campo: string, min: number, max: number): number | null {
  const texto = leerTexto(formData, campo);
  if (!/^-?\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return numero >= min && numero <= max ? numero : null;
}

/**
 * Coordenadas en el formato que copia Google Maps: "-34.603722, -58.381592".
 * Devuelve null si el texto está vacío y "invalido" si no se entiende.
 */
export function parsearCoordenadas(texto: string): { latitud: number; longitud: number } | null | "invalido" {
  if (!texto.trim()) return null;
  const partes = texto.split(/[,;\s]+/).filter(Boolean).map(Number);
  if (partes.length !== 2 || partes.some((n) => !Number.isFinite(n))) return "invalido";
  const [latitud, longitud] = partes;
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return "invalido";
  return { latitud, longitud };
}
