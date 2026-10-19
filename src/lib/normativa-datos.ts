import "server-only";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import { fechaLocal } from "@/lib/fechas";
import { asistenciaDelPeriodo, type FilaPeriodo } from "@/lib/informes";
import { diasDelMes, sancionPorTardanzas } from "@/lib/normativa";
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

/** Resultado de un mes por empleado, como se guarda en el cierre. */
export type FilaCierre = {
  perfil_id: string;
  tardanzas: number;
  minutos_tarde: number;
  detalle: { fecha: string; minutos: number; local_id: string }[];
  sancion: string | null;
};

export type Cierre = {
  mes: string;
  origen: "automatico" | "manual";
  guardado_por: string | null;
  guardado_en: string;
  filas: FilaCierre[];
};

/** Tardanzas de un mes por empleado (solo empleados, no administradores). */
export async function calcularCierre(supabase: Cliente, mes: string, ahora: Date): Promise<FilaCierre[]> {
  const [tardanzas, perfilesRes] = await Promise.all([
    tardanzasDelMes(supabase, { mes, ahora }),
    supabase.from("perfiles").select("id").eq("rol", "empleado"),
  ]);
  if (perfilesRes.error) throw new Error("No se pudieron cargar los empleados.");
  const empleados = new Set(perfilesRes.data.map((p) => p.id as string));
  return [...tardanzas]
    .filter(([perfilId]) => empleados.has(perfilId))
    .map(([perfilId, filas]) => ({
      perfil_id: perfilId,
      tardanzas: filas.length,
      minutos_tarde: filas.reduce((total, f) => total + f.minutosTarde, 0),
      detalle: filas.map((f) => ({ fecha: f.fecha, minutos: f.minutosTarde, local_id: f.localId })),
      sancion: sancionPorTardanzas(filas.length),
    }));
}

/** Calcula y guarda (o reemplaza) el cierre de un mes. Devuelve cuántos empleados tuvieron tardanzas. */
export async function guardarCierre(
  supabase: Cliente,
  mes: string,
  origen: "automatico" | "manual",
  ahora: Date,
): Promise<number> {
  const filas = await calcularCierre(supabase, mes, ahora);
  const { error } = await supabase.rpc("guardar_cierre_mes", { p_mes: mes, p_filas: filas, p_origen: origen });
  if (error) throw new Error(`No se pudo guardar el cierre (${error.code}).`);
  return filas.length;
}

export async function cargarCierre(supabase: Cliente, mes: string): Promise<Cierre | null> {
  const [cierreRes, filasRes] = await Promise.all([
    supabase.from("cierres_mes").select("mes, origen, guardado_por, guardado_en").eq("mes", mes).maybeSingle(),
    supabase.from("cierres_tardanzas").select("perfil_id, tardanzas, minutos_tarde, detalle, sancion").eq("mes", mes),
  ]);
  if (cierreRes.error || filasRes.error) throw new Error("No se pudo cargar el cierre del mes.");
  if (!cierreRes.data) return null;
  return { ...(cierreRes.data as Omit<Cierre, "filas">), filas: filasRes.data as FilaCierre[] };
}
