import "server-only";
import type { MarcacionDia, TurnoDia } from "@/lib/asistencia";
import { fechaLocal, instanteLocal, sumarDias } from "@/lib/fechas";
import { HORAS_ENTRADA_ABIERTA } from "@/lib/marcaciones";
import type { createClient } from "@/lib/supabase/server";
import type { LocalRow } from "@/types/db";

type Cliente = Awaited<ReturnType<typeof createClient>>;
const TANDA = 1000;
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
  if (perfilId) turnos = turnos.eq("perfil_id", perfilId);

  // Supabase devuelve como máximo 1000 filas por consulta: se piden por tandas.
  const leerMarcaciones = async () => {
    const todas: MarcacionDia[] = [];
    for (let desdeFila = 0; ; desdeFila += TANDA) {
      let consulta = supabase
        .from("marcaciones")
        .select("perfil_id, local_id, tipo, registrada_en")
        .eq("anulada", false)
        .gte("registrada_en", inicio.toISOString())
        .lt("registrada_en", fin.toISOString());
      if (perfilId) consulta = consulta.eq("perfil_id", perfilId);
      const { data, error } = await consulta.order("registrada_en").order("id").range(desdeFila, desdeFila + TANDA - 1);
      if (error) throw new Error("No se pudo cargar la asistencia.");
      todas.push(...(data as MarcacionDia[]));
      if (data.length < TANDA) return todas;
    }
  };

  let perfiles = supabase.from("perfiles").select("id, created_at");
  if (perfilId) perfiles = perfiles.eq("id", perfilId);

  const [turnosRes, marcaciones, localesRes, perfilesRes] = await Promise.all([
    turnos,
    leerMarcaciones(),
    supabase.from("locales").select("id, nombre, tolerancia_minutos").order("nombre"),
    perfiles,
  ]);
  if (turnosRes.error || localesRes.error || perfilesRes.error) {
    throw new Error("No se pudo cargar la asistencia.");
  }

  const locales = localesRes.data as LocalAsistencia[];
  return {
    turnos: turnosRes.data as TurnoDia[],
    marcaciones,
    locales,
    tolerancias: new Map(locales.map((l) => [l.id, l.tolerancia_minutos])),
    // El horario rige desde el día en que se creó la cuenta del empleado.
    altas: new Map(
      (perfilesRes.data as { id: string; created_at: string }[]).map((p) => [p.id, fechaLocal(new Date(p.created_at)).fecha]),
    ),
    nombreLocal: new Map(locales.map((l) => [l.id, l.nombre])),
  };
}
