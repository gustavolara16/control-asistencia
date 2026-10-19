// Avisos a los administradores cuando un empleado marca: a quién avisar y qué
// texto mostrar. No consulta la base de datos (para poder probarlo).
import type { TipoMarcacion } from "@/types/db";
import type { FilaAsistencia } from "./asistencia.ts";
import { formatearDuracion, formatearHora } from "./fechas.ts";

export type EntradasAvisadas = "todas" | "tarde" | "ninguna";

export type PreferenciasAvisos = {
  entradas: EntradasAvisadas;
  salidas: boolean;
  /** null: todos los locales. */
  locales: string[] | null;
};

export const PREFERENCIAS_INICIALES: PreferenciasAvisos = { entradas: "todas", salidas: false, locales: null };

export type MarcacionAvisada = {
  tipo: TipoMarcacion;
  empleado: string;
  local: string;
  localId: string;
  registradaEn: string;
  /** Asistencia del turno al que corresponde la marcación (null si no se pudo calcular). */
  fila: FilaAsistencia | null;
};

export type Aviso = { titulo: string; cuerpo: string; url: string };

/** ¿Es la primera entrada del turno? (Las siguientes son vueltas de un descanso). */
function esPrimeraEntrada(m: MarcacionAvisada): boolean {
  const primera = m.fila?.tramos[0];
  return !primera || Date.parse(primera.entrada) === Date.parse(m.registradaEn);
}

export function debeAvisar(preferencias: PreferenciasAvisos, m: MarcacionAvisada): boolean {
  if (preferencias.locales && !preferencias.locales.includes(m.localId)) return false;
  if (m.tipo === "salida") return preferencias.salidas;
  if (preferencias.entradas === "todas") return true;
  return preferencias.entradas === "tarde" && m.fila?.estado === "tarde" && esPrimeraEntrada(m);
}

export function armarAviso(m: MarcacionAvisada): Aviso {
  const hora = formatearHora(m.registradaEn);
  const fila = m.fila;
  const turno = fila?.turno ? ` (turno ${fila.turno.entrada} a ${fila.turno.salida})` : "";
  const url = "/admin/asistencia";

  if (m.tipo === "entrada") {
    const situacion = !fila
      ? ""
      : !esPrimeraEntrada(m)
        ? " · volvió a entrar"
        : fila.estado === "tarde"
        ? ` · ${fila.minutosTarde} min tarde${turno}`
        : fila.estado === "sin_horario"
          ? " · fuera de su horario"
          : ` · a horario${turno}`;
    return { titulo: `${m.empleado} entró · ${m.local}`, cuerpo: `${hora}${situacion}`, url };
  }

  const tramo = fila?.tramos.find((t) => t.salida && Date.parse(t.salida) === Date.parse(m.registradaEn));
  const detalle = [
    tramo?.minutos != null && `trabajó ${formatearDuracion(tramo.minutos)}`,
    fila && fila.minutosAntes > 0 && `se fue ${fila.minutosAntes} min antes`,
  ].filter(Boolean);
  return {
    titulo: `${m.empleado} salió · ${m.local}`,
    cuerpo: [hora, ...detalle].join(" · "),
    url,
  };
}

/** Busca la fila del turno que incluye la marcación (por la hora exacta de entrada o salida). */
export function filaDeMarcacion(
  filas: FilaAsistencia[],
  perfilId: string,
  tipo: TipoMarcacion,
  registradaEn: string,
): FilaAsistencia | null {
  const instante = Date.parse(registradaEn);
  return (
    filas.find(
      (f) =>
        f.perfilId === perfilId &&
        f.tramos.some((t) => {
          const hora = tipo === "entrada" ? t.entrada : t.salida;
          return hora !== null && Date.parse(hora) === instante;
        }),
    ) ?? null
  );
}

// Servicios de notificaciones de los navegadores (Chrome/Android, Safari/iPhone,
// Firefox, Edge). El servidor solo envía avisos a estas direcciones.
const SERVICIOS_PUSH = [
  "fcm.googleapis.com",
  "push.apple.com",
  "push.services.mozilla.com",
  "notify.windows.com",
];

export function esEndpointPushValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      SERVICIOS_PUSH.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`))
    );
  } catch {
    return false;
  }
}
