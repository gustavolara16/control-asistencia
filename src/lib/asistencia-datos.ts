import "server-only";
import type { MarcacionDia, TurnoDia } from "@/lib/asistencia";
import { instanteLocal, sumarDias } from "@/lib/fechas";
import { HORAS_ENTRADA_ABIERTA } from "@/lib/marcaciones";
import type { createClient } from "@/lib/supabase/server";
import type { LocalRow } from "@/types/db";

type Cliente = Awaited<ReturnType<typeof createClient>>;
export type LocalAsistencia = Pick<LocalRow, "id" | "nombre" | "tolerancia_minutos">;

/**
 * Carga horarios, marcaciones no anuladas y locales para calcular la
 * asistencia entre `desde` y `hasta` ("AAAA-MM-DD", inclusive). Las políticas
 * RLS limitan los datos: el empleado solo recibe los suyos.
 */
export async function cargarDatosAsistencia(
  supabase: Cliente,
  { desde, hasta, perfilId }: { desde: string; hasta: string; perfilId?: string },
) {
  const inicio = instanteLocal(desde, "00:00");
  // Hasta 18 h después del último día, para encontrar las salidas de los turnos nocturnos.
  const fin = new Date(instanteLocal(sumarDias(hasta, 1), "00:00").getTime() + HORAS_ENTRADA_ABIERTA * 3600 * 1000);

  let turnos = supabase.from("horarios").select("perfil_id, local_id, dia_semana, hora_entrada, hora_salida");
  let marcaciones = supabase
    .from("marcaciones")
    .select("perfil_id, local_id, tipo, registrada_en")
    .eq("anulada", false)
    .gte("registrada_en", inicio.toISOString())
    .lt("registrada_en", fin.toISOString());
  if (perfilId) {
    turnos = turnos.eq("perfil_id", perfilId);
    marcaciones = marcaciones.eq("perfil_id", perfilId);
  }

  const [turnosRes, marcacionesRes, localesRes] = await Promise.all([
    turnos,
    marcaciones.order("registrada_en"),
    supabase.from("locales").select("id, nombre, tolerancia_minutos").order("nombre"),
  ]);
  if (turnosRes.error || marcacionesRes.error || localesRes.error) {
    throw new Error("No se pudo cargar la asistencia.");
  }

  const locales = localesRes.data as LocalAsistencia[];
  return {
    turnos: turnosRes.data as TurnoDia[],
    marcaciones: marcacionesRes.data as MarcacionDia[],
    locales,
    tolerancias: new Map(locales.map((l) => [l.id, l.tolerancia_minutos])),
    nombreLocal: new Map(locales.map((l) => [l.id, l.nombre])),
  };
}
