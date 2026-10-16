"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { esUuid, leerEntero, leerTexto, parsearCoordenadas, type EstadoFormulario } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";

type DatosLocal = {
  nombre: string;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  radio_metros: number;
  tolerancia_minutos: number;
};

function leerLocal(formData: FormData): { datos: DatosLocal } | { error: string } {
  const nombre = leerTexto(formData, "nombre");
  const direccion = leerTexto(formData, "direccion");
  const coordenadas = parsearCoordenadas(leerTexto(formData, "coordenadas"));
  const radio = leerEntero(formData, "radio_metros", 10, 2000);
  const tolerancia = leerEntero(formData, "tolerancia_minutos", 0, 120);

  if (!nombre || nombre.length > 80) return { error: "El nombre es obligatorio (máximo 80 caracteres)." };
  if (direccion.length > 200) return { error: "La dirección puede tener como máximo 200 caracteres." };
  if (coordenadas === "invalido") {
    return { error: "Las coordenadas no son válidas. Ejemplo: -34.603722, -58.381592" };
  }
  if (radio === null) return { error: "El radio debe ser un número entre 10 y 2000 metros." };
  if (tolerancia === null) return { error: "La tolerancia debe ser un número entre 0 y 120 minutos." };

  return {
    datos: {
      nombre,
      direccion: direccion || null,
      latitud: coordenadas?.latitud ?? null,
      longitud: coordenadas?.longitud ?? null,
      radio_metros: radio,
      tolerancia_minutos: tolerancia,
    },
  };
}

function mensajeError(code: string | undefined): string {
  return code === "23505" ? "Ya existe un local con ese nombre." : "No se pudo guardar el local. Intentá de nuevo.";
}

export async function crearLocal(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireAdmin();
  const resultado = leerLocal(formData);
  if ("error" in resultado) return resultado;

  const supabase = await createClient();
  const { error } = await supabase.from("locales").insert(resultado.datos);
  if (error) return { error: mensajeError(error.code) };

  redirect("/admin/locales");
}

export async function actualizarLocal(
  localId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!esUuid(localId)) return { error: "Local inválido." };
  const resultado = leerLocal(formData);
  if ("error" in resultado) return resultado;

  const supabase = await createClient();
  const { data, error } = await supabase.from("locales").update(resultado.datos).eq("id", localId).select("id");
  if (error) return { error: mensajeError(error.code) };
  if (!data?.length) return { error: "No se encontró el local." };

  refresh();
  return { ok: "Cambios guardados." };
}

export async function regenerarQrLocal(localId: string): Promise<void> {
  await requireAdmin();
  if (!esUuid(localId)) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerar_qr_local", { p_local_id: localId });
  if (error) throw new Error("No se pudo regenerar el código QR.");

  refresh();
}

export async function cambiarEstadoLocal(localId: string, activo: boolean): Promise<void> {
  await requireAdmin();
  if (!esUuid(localId)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("locales").update({ activo }).eq("id", localId);
  if (error) throw new Error("No se pudo cambiar el estado del local.");

  refresh();
}
