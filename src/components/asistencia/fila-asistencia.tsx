import { minutosTrabajados, type EstadoAsistencia, type FilaAsistencia } from "@/lib/asistencia";
import { formatearDuracion, formatearHora } from "@/lib/fechas";

const ROJO = "bg-red-50 text-red-700";
const AMARILLO = "bg-amber-50 text-amber-800";

function textoMinutos(minutos: number): string {
  return minutos < 60 ? `${minutos} min` : formatearDuracion(minutos);
}

function etiquetaEstado(fila: FilaAsistencia): { texto: string; clase: string } {
  const etiquetas: Record<EstadoAsistencia, { texto: string; clase: string }> = {
    a_horario: { texto: "A horario", clase: "bg-emerald-50 text-emerald-700" },
    tarde: { texto: `Tarde ${textoMinutos(fila.minutosTarde)}`, clase: AMARILLO },
    pendiente: { texto: "Todavía no entra", clase: "bg-slate-100 text-slate-600" },
    sin_marcar: { texto: "No marcó la entrada", clase: ROJO },
    ausente: { texto: "Ausente", clase: ROJO },
    sin_horario: { texto: "Fuera de su horario", clase: "bg-sky-50 text-sky-700" },
  };
  return etiquetas[fila.estado];
}

export function EtiquetasAsistencia({ fila }: { fila: FilaAsistencia }) {
  const etiquetas = [etiquetaEstado(fila)];
  if (fila.tramos.some((t) => t.situacion === "abierto")) {
    etiquetas.push({ texto: "Trabajando ahora", clase: "bg-blue-50 text-blue-700" });
  }
  if (fila.tramos.some((t) => t.situacion === "sin_salida")) {
    etiquetas.push({ texto: "No marcó la salida", clase: AMARILLO });
  }
  if (fila.minutosAntes > 0) {
    etiquetas.push({ texto: `Se fue ${textoMinutos(fila.minutosAntes)} antes`, clase: AMARILLO });
  }
  return (
    <span className="flex flex-wrap gap-1">
      {etiquetas.map((e) => (
        <span key={e.texto} className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${e.clase}`}>
          {e.texto}
        </span>
      ))}
    </span>
  );
}

/** Turno, horas de entrada y salida, y horas trabajadas de una fila. */
export function DetalleAsistencia({ fila, nombreLocal }: { fila: FilaAsistencia; nombreLocal: Map<string, string> }) {
  const enCurso = fila.tramos.some((t) => t.situacion === "abierto");
  return (
    <div className="flex flex-col gap-0.5 text-sm text-slate-600">
      <span>
        {nombreLocal.get(fila.localId) ?? "Local"} ·{" "}
        {fila.turno ? `Turno ${fila.turno.entrada} a ${fila.turno.salida}` : "Sin turno asignado"}
      </span>
      {fila.tramos.length > 0 && (
        <span className="tabular-nums text-slate-900">
          {fila.tramos.map((t, i) => (
            <span key={t.entrada}>
              {i > 0 && " · "}
              Entró {formatearHora(t.entrada)}, {t.salida
                ? `salió ${formatearHora(t.salida)}`
                : t.situacion === "abierto"
                  ? "sigue trabajando"
                  : "sin salida"}
            </span>
          ))}
          {" · "}
          <strong>{formatearDuracion(minutosTrabajados(fila.tramos))}</strong>
          {enCurso && " hasta ahora"}
        </span>
      )}
    </div>
  );
}
