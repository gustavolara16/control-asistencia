// Cálculo de la asistencia de un día: compara el horario de cada empleado con
// sus marcaciones. No consulta la base de datos (recibe los datos ya cargados)
// para poder probarlo; lo usan la pantalla de asistencia y los historiales.
import type { TipoMarcacion } from "@/types/db";
import { diaSemanaDe, fechaLocal, instanteLocal, sumarDias } from "./fechas.ts";
import { HORAS_ENTRADA_ABIERTA } from "./marcaciones.ts";

const MINUTO = 60 * 1000;
const LIMITE_ENTRADA_ABIERTA = HORAS_ENTRADA_ABIERTA * 60 * MINUTO;
// Una entrada cuenta para un turno si se marcó hasta 3 h antes de que empiece.
const VENTANA_ANTES_DEL_TURNO = 3 * 60 * MINUTO;

export type MarcacionDia = {
  perfil_id: string;
  local_id: string;
  tipo: TipoMarcacion;
  registrada_en: string;
};

export type TurnoDia = {
  perfil_id: string;
  local_id: string;
  dia_semana: number;
  hora_entrada: string;
  hora_salida: string;
};

export type Tramo = {
  localId: string;
  entrada: string;
  salida: string | null;
  /** cerrado: tiene salida · abierto: está trabajando ahora · sin_salida: no marcó la salida */
  situacion: "cerrado" | "abierto" | "sin_salida";
  /** Minutos trabajados (hasta ahora si está abierto; null si falta la salida). */
  minutos: number | null;
};

export type EstadoAsistencia =
  | "a_horario" // marcó la entrada dentro de la tolerancia
  | "tarde" // marcó la entrada después de la tolerancia
  | "pendiente" // todavía no llegó la hora de entrar
  | "sin_marcar" // el turno está en curso y no marcó la entrada
  | "ausente" // el turno terminó y no marcó la entrada
  | "sin_horario"; // marcó fuera de los turnos asignados

export type FilaAsistencia = {
  perfilId: string;
  localId: string;
  /** Turno asignado ("HH:MM"), o null si trabajó sin turno. */
  turno: { entrada: string; salida: string } | null;
  tramos: Tramo[];
  estado: EstadoAsistencia;
  minutosTarde: number;
  /** Minutos que se fue antes del fin del turno (más allá de la tolerancia). */
  minutosAntes: number;
};

/** Agrupa las marcaciones de UN empleado en tramos entrada → salida. */
export function armarTramos(marcaciones: MarcacionDia[], ahora: Date): Tramo[] {
  const ordenadas = [...marcaciones].sort((a, b) => Date.parse(a.registrada_en) - Date.parse(b.registrada_en));
  const tramos: Tramo[] = [];
  let actual: Tramo | null = null;

  for (const m of ordenadas) {
    if (m.tipo === "entrada") {
      if (actual) tramos.push(actual);
      actual = { localId: m.local_id, entrada: m.registrada_en, salida: null, situacion: "sin_salida", minutos: null };
    } else if (actual) {
      const duracion = Date.parse(m.registrada_en) - Date.parse(actual.entrada);
      if (duracion < LIMITE_ENTRADA_ABIERTA) {
        actual.salida = m.registrada_en;
        actual.situacion = "cerrado";
        actual.minutos = Math.floor(duracion / MINUTO);
      }
      tramos.push(actual);
      actual = null;
    }
    // Una salida sin entrada previa corresponde a una entrada anterior al
    // período consultado: se ignora.
  }

  if (actual) {
    const transcurrido = ahora.getTime() - Date.parse(actual.entrada);
    if (transcurrido < LIMITE_ENTRADA_ABIERTA) {
      actual.situacion = "abierto";
      actual.minutos = Math.max(0, Math.floor(transcurrido / MINUTO));
    }
    tramos.push(actual);
  }
  return tramos;
}

export function minutosTrabajados(tramos: Tramo[]): number {
  return tramos.reduce((total, t) => total + (t.minutos ?? 0), 0);
}

type TurnoCalculado = { localId: string; entrada: string; salida: string; inicio: number; fin: number };

/**
 * Asistencia de un día ("AAAA-MM-DD") para todos los empleados recibidos.
 * - `turnos`: horario semanal (se usan los del día de la semana de `fecha`).
 * - `marcaciones`: no anuladas, desde el inicio de `fecha` hasta al menos
 *   18 h después de su fin (para encontrar las salidas de turnos nocturnos).
 * - `tolerancias`: minutos de tolerancia por local.
 */
export function calcularAsistencia({
  fecha,
  ahora,
  turnos,
  marcaciones,
  tolerancias,
}: {
  fecha: string;
  ahora: Date;
  turnos: TurnoDia[];
  marcaciones: MarcacionDia[];
  tolerancias: Map<string, number>;
}): FilaAsistencia[] {
  const diaSemana = diaSemanaDe(fecha);
  const perfiles = new Set([
    ...turnos.filter((t) => t.dia_semana === diaSemana).map((t) => t.perfil_id),
    ...marcaciones.map((m) => m.perfil_id),
  ]);

  const filas: (FilaAsistencia & { orden: number })[] = [];
  for (const perfilId of perfiles) {
    const turnosDelDia: TurnoCalculado[] = turnos
      .filter((t) => t.perfil_id === perfilId && t.dia_semana === diaSemana)
      .map((t) => {
        const entrada = t.hora_entrada.slice(0, 5);
        const salida = t.hora_salida.slice(0, 5);
        const diaSalida = salida <= entrada ? sumarDias(fecha, 1) : fecha;
        return {
          localId: t.local_id,
          entrada,
          salida,
          inicio: instanteLocal(fecha, entrada).getTime(),
          fin: instanteLocal(diaSalida, salida).getTime(),
        };
      })
      .sort((a, b) => a.inicio - b.inicio);

    // Tramos que empezaron en este día (los de días anteriores se ven en su día).
    const tramos = armarTramos(
      marcaciones.filter((m) => m.perfil_id === perfilId),
      ahora,
    ).filter((t) => fechaLocal(new Date(t.entrada)).fecha === fecha);

    const tramosPorTurno = new Map<TurnoCalculado, Tramo[]>();
    for (const tramo of tramos) {
      const inicioTramo = Date.parse(tramo.entrada);
      const candidatos = turnosDelDia.filter(
        (t) => t.localId === tramo.localId && inicioTramo >= t.inicio - VENTANA_ANTES_DEL_TURNO && inicioTramo < t.fin,
      );
      // Primero un turno libre (el de inicio más cercano); si no hay, el
      // mismo turno (salió y volvió a entrar durante el turno).
      const libres = candidatos.filter((t) => !tramosPorTurno.has(t));
      const elegido = (libres.length > 0 ? libres : candidatos).sort(
        (a, b) => Math.abs(inicioTramo - a.inicio) - Math.abs(inicioTramo - b.inicio),
      )[0];

      if (elegido) {
        tramosPorTurno.set(elegido, [...(tramosPorTurno.get(elegido) ?? []), tramo]);
      } else {
        filas.push({
          perfilId,
          localId: tramo.localId,
          turno: null,
          tramos: [tramo],
          estado: "sin_horario",
          minutosTarde: 0,
          minutosAntes: 0,
          orden: inicioTramo,
        });
      }
    }

    for (const turno of turnosDelDia) {
      const tolerancia = (tolerancias.get(turno.localId) ?? 0) * MINUTO;
      const asignados = tramosPorTurno.get(turno) ?? [];
      const fila: FilaAsistencia & { orden: number } = {
        perfilId,
        localId: turno.localId,
        turno: { entrada: turno.entrada, salida: turno.salida },
        tramos: asignados,
        estado: "a_horario",
        minutosTarde: 0,
        minutosAntes: 0,
        orden: turno.inicio,
      };

      if (asignados.length === 0) {
        fila.estado =
          ahora.getTime() < turno.inicio + tolerancia + MINUTO
            ? "pendiente"
            : ahora.getTime() < turno.fin
              ? "sin_marcar"
              : "ausente";
      } else {
        const tarde = Math.floor((Date.parse(asignados[0].entrada) - turno.inicio) / MINUTO);
        if (tarde * MINUTO > tolerancia) {
          fila.estado = "tarde";
          fila.minutosTarde = tarde;
        }
        const ultimo = asignados[asignados.length - 1];
        if (ultimo.salida) {
          const antes = Math.floor((turno.fin - Date.parse(ultimo.salida)) / MINUTO);
          if (antes * MINUTO > tolerancia) fila.minutosAntes = antes;
        }
      }
      filas.push(fila);
    }
  }

  filas.sort((a, b) => a.orden - b.orden);
  return filas.map(({ perfilId, localId, turno, tramos, estado, minutosTarde, minutosAntes }) => ({
    perfilId,
    localId,
    turno,
    tramos,
    estado,
    minutosTarde,
    minutosAntes,
  }));
}

export type DiaHistorial = { fecha: string; filas: FilaAsistencia[] };

/** Asistencia día por día entre `desde` y `hasta` (inclusive), del más reciente al más antiguo; omite los días vacíos. */
export function historialPorDias({
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
}): DiaHistorial[] {
  const dias: DiaHistorial[] = [];
  for (let fecha = hasta; fecha >= desde; fecha = sumarDias(fecha, -1)) {
    const filas = calcularAsistencia({ fecha, ...datos });
    if (filas.length > 0) dias.push({ fecha, filas });
  }
  return dias;
}
