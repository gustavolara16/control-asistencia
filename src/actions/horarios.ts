"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { esUuid, type EstadoFormulario } from "@/lib/formularios";
import { validarHorario, type Turno } from "@/lib/horarios";
import { createClient } from "@/lib/supabase/server";

export async function guardarHorario(perfilId: string, turnos: Turno[]): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!esUuid(perfilId) || !Array.isArray(turnos)) return { error: "Datos inválidos." };

  // Los datos llegan del navegador: se vuelven a validar acá.
  const limpios: Turno[] = turnos.map((t) => ({
    localId: String(t?.localId ?? ""),
    diaSemana: Number(t?.diaSemana),
    entrada: String(t?.entrada ?? ""),
    salida: String(t?.salida ?? ""),
  }));

  const supabase = await createClient();
  const { data: asignaciones, error: errorLectura } = await supabase
    .from("empleado_locales")
    .select("local_id")
    .eq("perfil_id", perfilId);
  if (errorLectura) return { error: "No se pudieron leer los locales del empleado." };

  const error = validarHorario(limpios, new Set((asignaciones ?? []).map((a) => a.local_id as string)));
  if (error) return { error };

  const { error: errorGuardado } = await supabase.rpc("reemplazar_horarios", {
    p_perfil_id: perfilId,
    p_turnos: limpios.map((t) => ({
      local_id: t.localId,
      dia_semana: t.diaSemana,
      hora_entrada: t.entrada,
      hora_salida: t.salida,
    })),
  });
  if (errorGuardado) return { error: "No se pudo guardar el horario." };

  refresh();
  return { ok: "Horario guardado." };
}
