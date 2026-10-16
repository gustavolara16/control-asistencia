// Informes de asistencia por período: resumen por empleado y exportación a
// CSV (se abre directamente con Excel). Sin acceso a la base, para poder probarlo.
import { calcularAsistencia, minutosTrabajados, type FilaAsistencia, type MarcacionDia, type TurnoDia } from "./asistencia.ts";
import { esFechaValida, sumarDias } from "./fechas.ts";

/** Período más largo que se puede consultar de una vez. */
export const DIAS_MAXIMOS_INFORME = 93;

export type FilaPeriodo = FilaAsistencia & { fecha: string };

/** Asistencia de todos los días entre `desde` y `hasta` (inclusive), en orden. */
export function asistenciaDelPeriodo({
  desde,
  hasta,
  ...datos
}: {
  desde: string;
  hasta: string;
  ahora: Date;
  turnos: TurnoDia[];
  marcaciones: MarcacionDia[];
  tolerancias: Map<string, number>;
  altas?: Map<string, string>;
}): FilaPeriodo[] {
  const filas: FilaPeriodo[] = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    for (const fila of calcularAsistencia({ fecha, ...datos })) filas.push({ ...fila, fecha });
  }
  return filas;
}

/** Duración de un turno "HH:MM"–"HH:MM" en minutos (cruza la medianoche si termina antes). */
export function minutosDelTurno(turno: { entrada: string; salida: string }): number {
  const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const duracion = minutos(turno.salida) - minutos(turno.entrada);
  return duracion > 0 ? duracion : duracion + 24 * 60;
}

export type ResumenEmpleado = {
  perfilId: string;
  /** Días distintos en los que marcó al menos una entrada. */
  diasTrabajados: number;
  minutosTrabajados: number;
  /** Minutos de los turnos asignados que ya empezaron (los pendientes no cuentan). */
  minutosProgramados: number;
  turnos: number;
  llegadasTarde: number;
  minutosTarde: number;
  ausencias: number;
  salidasAnticipadas: number;
  sinSalida: number;
  fueraDeHorario: number;
};

export function resumirPorEmpleado(filas: FilaPeriodo[]): ResumenEmpleado[] {
  const resumenes = new Map<string, ResumenEmpleado & { dias: Set<string> }>();
  for (const f of filas) {
    let r = resumenes.get(f.perfilId);
    if (!r) {
      r = {
        perfilId: f.perfilId,
        diasTrabajados: 0,
        minutosTrabajados: 0,
        minutosProgramados: 0,
        turnos: 0,
        llegadasTarde: 0,
        minutosTarde: 0,
        ausencias: 0,
        salidasAnticipadas: 0,
        sinSalida: 0,
        fueraDeHorario: 0,
        dias: new Set(),
      };
      resumenes.set(f.perfilId, r);
    }
    if (f.tramos.length > 0) r.dias.add(f.fecha);
    r.minutosTrabajados += minutosTrabajados(f.tramos);
    if (f.turno && f.estado !== "pendiente") {
      r.turnos += 1;
      r.minutosProgramados += minutosDelTurno(f.turno);
    }
    if (f.estado === "tarde") {
      r.llegadasTarde += 1;
      r.minutosTarde += f.minutosTarde;
    }
    if (f.estado === "ausente") r.ausencias += 1;
    if (f.estado === "sin_horario") r.fueraDeHorario += 1;
    if (f.minutosAntes > 0) r.salidasAnticipadas += 1;
    r.sinSalida += f.tramos.filter((t) => t.situacion === "sin_salida").length;
  }
  return [...resumenes.values()].map(({ dias, ...r }) => ({ ...r, diasTrabajados: dias.size }));
}

/** Minutos → horas con coma decimal, como las escribe Excel en español: 465 → "7,75". */
export function horasDecimales(minutos: number): string {
  return (minutos / 60).toFixed(2).replace(".", ",");
}

/**
 * CSV separado por ";" con BOM UTF-8: Excel en español lo abre con acentos y
 * columnas bien separadas. Neutraliza celdas que Excel interpretaría como
 * fórmulas (=, +, -, @) para evitar inyección de fórmulas.
 */
export function generarCsv(filas: (string | number | null | undefined)[][]): string {
  const celda = (valor: string | number | null | undefined) => {
    if (valor === null || valor === undefined) return "";
    let texto = String(valor);
    const esNumero = /^-?\d+(,\d+)?$/.test(texto);
    if (!esNumero && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
    return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return "﻿" + filas.map((fila) => fila.map(celda).join(";")).join("\r\n") + "\r\n";
}

/** Estado de una fila en palabras (para las planillas). */
export const TEXTO_ESTADO_ASISTENCIA: Record<FilaAsistencia["estado"], string> = {
  a_horario: "A horario",
  tarde: "Tarde",
  pendiente: "Todavía no entra",
  sin_marcar: "No marcó la entrada",
  ausente: "Ausente",
  sin_horario: "Fuera de horario",
};

/**
 * Período pedido ("AAAA-MM-DD"). Por defecto, desde el 1 del mes hasta hoy;
 * nunca termina después de hoy ni abarca más de DIAS_MAXIMOS_INFORME días.
 */
export function leerPeriodo(desde: unknown, hasta: unknown, hoy: string): { desde: string; hasta: string; aviso?: string } {
  const fin = esFechaValida(hasta) && hasta <= hoy ? hasta : hoy;
  const inicio = esFechaValida(desde) ? desde : `${fin.slice(0, 8)}01`;
  if (inicio > fin) {
    return { desde: fin, hasta: fin, aviso: "La fecha «desde» era posterior a «hasta»: se muestra un solo día." };
  }
  const dias = Math.round((Date.parse(fin) - Date.parse(inicio)) / 86_400_000) + 1;
  if (dias > DIAS_MAXIMOS_INFORME) {
    return {
      desde: sumarDias(fin, -(DIAS_MAXIMOS_INFORME - 1)),
      hasta: fin,
      aviso: `Como máximo ${DIAS_MAXIMOS_INFORME} días por informe: se muestran los últimos ${DIAS_MAXIMOS_INFORME}.`,
    };
  }
  return { desde: inicio, hasta: fin };
}
