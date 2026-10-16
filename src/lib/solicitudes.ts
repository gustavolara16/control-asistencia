import { formatearFechaHora } from "@/lib/fechas";
import type { MarcacionRow, SolicitudRow } from "@/types/db";

/** Columnas de un pedido, con la marcación a corregir (si la hay). */
export const COLUMNAS_SOLICITUD =
  "id, perfil_id, marcacion_id, local_id, tipo, fecha_hora_propuesta, motivo, estado, respuesta, created_at, revisada_en, marcaciones(tipo, registrada_en, local_id)";

export type Solicitud = Pick<
  SolicitudRow,
  | "id"
  | "perfil_id"
  | "marcacion_id"
  | "local_id"
  | "tipo"
  | "fecha_hora_propuesta"
  | "motivo"
  | "estado"
  | "respuesta"
  | "created_at"
  | "revisada_en"
> & {
  marcaciones: Pick<MarcacionRow, "tipo" | "registrada_en" | "local_id"> | null;
};

const nombreTipo = (tipo: string | null | undefined) => (tipo === "salida" ? "salida" : "entrada");

/** "Cambiar la entrada del vie 16/10 11:43 (Fabrica) a vie 16/10 11:00" */
export function describirSolicitud(s: Solicitud, nombreLocal: Map<string, string>): string {
  const propuesta = formatearFechaHora(s.fecha_hora_propuesta);
  if (s.marcacion_id !== null) {
    const m = s.marcaciones;
    if (!m) return `Cambiar la hora de una marcación a ${propuesta}`;
    const local = nombreLocal.get(m.local_id);
    return `Cambiar la ${nombreTipo(m.tipo)} del ${formatearFechaHora(m.registrada_en)}${local ? ` (${local})` : ""} a ${propuesta}`;
  }
  const local = s.local_id ? nombreLocal.get(s.local_id) : undefined;
  return `Agregar una ${nombreTipo(s.tipo)} el ${propuesta}${local ? ` en ${local}` : ""}`;
}

export const TEXTO_ESTADO: Record<SolicitudRow["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-50 text-amber-800" },
  aprobada: { texto: "Aprobado", clase: "bg-emerald-50 text-emerald-700" },
  rechazada: { texto: "Rechazado", clase: "bg-red-50 text-red-700" },
};
