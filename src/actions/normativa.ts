"use server";

import { refresh } from "next/cache";
import { requireAdmin, requirePerfil } from "@/lib/auth";
import { fechaLocal } from "@/lib/fechas";
import type { EstadoFormulario } from "@/lib/formularios";
import { esMesValido, nombreDelMes } from "@/lib/normativa";
import { guardarCierre } from "@/lib/normativa-datos";
import { createClient } from "@/lib/supabase/server";

export async function guardarNormativa(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireAdmin();
  const valor = formData.get("texto");
  const texto = typeof valor === "string" ? valor.replace(/\r\n/g, "\n").trim() : "";
  if (!texto) return { error: "Escribí el texto de la normativa." };
  if (texto.length > 60000) return { error: "El texto es demasiado largo (máximo 60.000 caracteres)." };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("normativa").select("texto").maybeSingle();
  if (actual?.texto === texto) return { ok: "No hubo cambios." };
  // La versión, la fecha y el autor los registra la base.
  const { error } = actual
    ? await supabase.from("normativa").update({ texto }).eq("id", 1)
    : await supabase.from("normativa").insert({ texto });
  if (error) {
    console.error("guardarNormativa", error.code, error.message);
    return { error: "No se pudo guardar la normativa." };
  }
  refresh();
  return { ok: "Normativa publicada. Los empleados van a ver un aviso para leerla." };
}

export async function confirmarLecturaNormativa(): Promise<{ error?: string }> {
  await requirePerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_lectura_normativa");
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("confirmarLecturaNormativa", error.code, error.message);
    return { error: "No se pudo registrar. Intentá de nuevo." };
  }
  refresh();
  return {};
}

/** Guarda (o vuelve a guardar) el cierre de un mes ya terminado. */
export async function guardarCierreMes(mes: string): Promise<{ ok?: string; error?: string }> {
  await requireAdmin();
  const ahora = new Date();
  if (!esMesValido(mes) || mes >= fechaLocal(ahora).fecha.slice(0, 7)) {
    return { error: "Solo se puede guardar un mes que ya terminó." };
  }
  try {
    await guardarCierre(await createClient(), mes, "manual", ahora);
  } catch (error) {
    console.error("guardarCierreMes", error instanceof Error ? error.message : error);
    return { error: "No se pudo guardar el cierre. Intentá de nuevo." };
  }
  refresh();
  return { ok: `Listo, se guardó el cierre de ${nombreDelMes(mes)}.` };
}
