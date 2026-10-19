import "server-only";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import { fechaLocal } from "@/lib/fechas";
import { asistenciaDelPeriodo, type FilaPeriodo } from "@/lib/informes";
import { diasDelMes } from "@/lib/normativa";
import type { createClient } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof createClient>>;

export type Normativa = { texto: string; version: number; updated_at: string };

export async function cargarNormativa(supabase: Cliente): Promise<Normativa | null> {
  const { data, error } = await supabase.from("normativa").select("texto, version, updated_at").maybeSingle();
  if (error) throw new Error("No se pudo cargar la normativa.");
  return data as Normativa | null;
}

/**
 * Llegadas tarde de un mes ("AAAA-MM") por empleado, hasta hoy. Las políticas
 * RLS limitan los datos: un empleado solo recibe las suyas.
 */
export async function tardanzasDelMes(
  supabase: Cliente,
  { mes, perfilId, ahora }: { mes: string; perfilId?: string; ahora: Date },
): Promise<Map<string, FilaPeriodo[]>> {
  const hoy = fechaLocal(ahora).fecha;
  const { desde, hasta: finDeMes } = diasDelMes(mes);
  const hasta = finDeMes < hoy ? finDeMes : hoy;
  const porEmpleado = new Map<string, FilaPeriodo[]>();
  if (desde > hasta) return porEmpleado;

  const datos = await cargarDatosAsistencia(supabase, { desde, hasta, perfilId });
  for (const fila of asistenciaDelPeriodo({ desde, hasta, ahora, ...datos })) {
    if (fila.estado !== "tarde" || (perfilId && fila.perfilId !== perfilId)) continue;
    porEmpleado.set(fila.perfilId, [...(porEmpleado.get(fila.perfilId) ?? []), fila]);
  }
  return porEmpleado;
}
