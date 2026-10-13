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

/** Instante (UTC) en que empieza el día local del negocio que contiene `instante`. */
export function inicioDelDia(instante: Date): Date {
  const { fecha } = fechaLocal(instante);
  // Desplazamiento de la zona en ese momento, p. ej. "GMT-03:00".
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, timeZoneName: "longOffset" })
      .formatToParts(instante)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return new Date(`${fecha}T00:00:00${offset}`);
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

/** "09:00:00" → "09:00" */
export function horaCorta(hora: string): string {
  return hora.slice(0, 5);
}
