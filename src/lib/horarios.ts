// Validación del horario semanal. La usan el editor (navegador) y la
// Server Action (servidor), para que las reglas sean las mismas.

export type Turno = {
  localId: string;
  /** 1 = lunes … 7 = domingo */
  diaSemana: number;
  /** "HH:MM" */
  entrada: string;
  salida: string;
};

export const MAXIMO_TURNOS_SEMANA = 28;

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Rango del turno en minutos desde el inicio del día; cruza la medianoche si salida < entrada. */
function rango(turno: Turno): [number, number] {
  const inicio = minutos(turno.entrada);
  let fin = minutos(turno.salida);
  if (fin <= inicio) fin += 24 * 60;
  return [inicio, fin];
}

/** Devuelve un mensaje de error, o null si el horario es válido. */
export function validarHorario(turnos: Turno[], localesPermitidos: Set<string>): string | null {
  if (turnos.length > MAXIMO_TURNOS_SEMANA) {
    return `Como máximo ${MAXIMO_TURNOS_SEMANA} turnos por semana.`;
  }
  for (const t of turnos) {
    if (!Number.isInteger(t.diaSemana) || t.diaSemana < 1 || t.diaSemana > 7) {
      return "Hay un turno con un día inválido.";
    }
    if (!FORMATO_HORA.test(t.entrada) || !FORMATO_HORA.test(t.salida)) {
      return "Completá la hora de entrada y de salida de todos los turnos.";
    }
    if (t.entrada === t.salida) {
      return "La hora de entrada y la de salida no pueden ser iguales.";
    }
    if (!localesPermitidos.has(t.localId)) {
      return "Hay un turno en un local que no está asignado al empleado.";
    }
  }
  for (let dia = 1; dia <= 7; dia++) {
    const delDia = turnos.filter((t) => t.diaSemana === dia).map(rango).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < delDia.length; i++) {
      if (delDia[i][0] < delDia[i - 1][1]) {
        return "Hay turnos que se superponen en el mismo día.";
      }
    }
  }
  return null;
}
