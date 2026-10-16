// Zona horaria del negocio. Las fechas se guardan en UTC y se convierten acá.
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const partesFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const DIAS_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const NOMBRES_DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Fecha local del negocio: { fecha: "AAAA-MM-DD", diaSemana: 1 (lunes) … 7 (domingo) }. */
export function fechaLocal(instante: Date) {
  const partes = Object.fromEntries(partesFecha.formatToParts(instante).map((p) => [p.type, p.value]));
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    diaSemana: DIAS_ISO[partes.weekday],
  };
}

/** Desplazamiento de la zona horaria en un instante, p. ej. "-03:00". */
function desplazamiento(instante: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, timeZoneName: "longOffset" })
      .formatToParts(instante)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00"
  );
}

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** true si es una fecha "AAAA-MM-DD" que existe en el calendario. */
export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== "string" || !FORMATO_FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(fecha);
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día de la semana de una fecha "AAAA-MM-DD": 1 (lunes) … 7 (domingo). */
export function diaSemanaDe(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay() || 7;
}

/** Instante (UTC) que corresponde a la fecha y hora ("HH:MM") locales del negocio. */
export function instanteLocal(fecha: string, hora: string): Date {
  const offset = desplazamiento(new Date(`${fecha}T12:00:00Z`));
  return new Date(`${fecha}T${hora.slice(0, 5)}:00${offset}`);
}

/** Instante (UTC) en que empieza el día local del negocio que contiene `instante`. */
export function inicioDelDia(instante: Date): Date {
  return instanteLocal(fechaLocal(instante).fecha, "00:00");
}

const formatoHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatoFechaHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatearHora(iso: string): string {
  return formatoHora.format(new Date(iso));
}

export function formatearFechaHora(iso: string): string {
  return formatoFechaHora.format(new Date(iso));
}

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "2026-10-16" → "viernes, 16 de octubre" */
export function formatearFecha(fecha: string): string {
  return formatoFecha.format(instanteLocal(fecha, "12:00"));
}

/** 485 → "8:05 h" */
export function formatearDuracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} h`;
}

/** "09:00:00" → "09:00" */
export function horaCorta(hora: string): string {
  return hora.slice(0, 5);
}
