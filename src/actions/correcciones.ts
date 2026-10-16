"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { esFechaValida, instanteLocal } from "@/lib/fechas";
import { esUuid, leerTexto, type EstadoFormulario } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";

// Las reglas (solo administradores, motivo obligatorio, hora no futura) se
// validan en la base de datos; acá se revisa el formato para dar mensajes claros.

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function leerMotivo(formData: FormData): string | null {
  const motivo = leerTexto(formData, "motivo");
  return motivo.length >= 5 && motivo.length <= 500 ? motivo : null;
}

function leerInstante(formData: FormData): Date | null {
  const fecha = leerTexto(formData, "fecha");
  const hora = leerTexto(formData, "hora");
  return esFechaValida(fecha) && FORMATO_HORA.test(hora) ? instanteLocal(fecha, hora) : null;
}

function esIdValido(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

const SIN_MOTIVO = "Escribí el motivo de la corrección (al menos 5 caracteres).";

async function ejecutar(nombre: string, args: Record<string, unknown>, ok: string): Promise<EstadoFormulario> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(nombre, args);
  if (error) {
    // P0001: mensajes escritos para el administrador en las funciones de la base.
    if (error.code === "P0001") return { error: error.message };
    console.error(`${nombre}: error inesperado`, error.code, error.message);
    return { error: "No se pudo guardar la corrección. Intentá de nuevo." };
  }
  refresh();
  return { ok };
}

export async function anularMarcacion(
  marcacionId: number,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!esIdValido(marcacionId)) return { error: "Marcación inválida." };
  const motivo = leerMotivo(formData);
  if (!motivo) return { error: SIN_MOTIVO };
  return ejecutar("anular_marcacion", { p_marcacion_id: marcacionId, p_motivo: motivo }, "Marcación anulada.");
}

export async function corregirHoraMarcacion(
  marcacionId: number,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!esIdValido(marcacionId)) return { error: "Marcación inválida." };
  const instante = leerInstante(formData);
  if (!instante) return { error: "Completá la fecha y la hora correctas." };
  const motivo = leerMotivo(formData);
  if (!motivo) return { error: SIN_MOTIVO };
  return ejecutar(
    "corregir_hora_marcacion",
    { p_marcacion_id: marcacionId, p_registrada_en: instante.toISOString(), p_motivo: motivo },
    "Hora corregida.",
  );
}

export async function agregarMarcacion(
  perfilId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!esUuid(perfilId)) return { error: "Empleado inválido." };
  const tipo = leerTexto(formData, "tipo");
  if (tipo !== "entrada" && tipo !== "salida") return { error: "Elegí si es una entrada o una salida." };
  const localId = leerTexto(formData, "local");
  if (!esUuid(localId)) return { error: "Elegí el local." };
  const instante = leerInstante(formData);
  if (!instante) return { error: "Completá la fecha y la hora correctas." };
  const motivo = leerMotivo(formData);
  if (!motivo) return { error: SIN_MOTIVO };
  return ejecutar(
    "agregar_marcacion",
    {
      p_perfil_id: perfilId,
      p_local_id: localId,
      p_tipo: tipo,
      p_registrada_en: instante.toISOString(),
      p_motivo: motivo,
    },
    tipo === "entrada" ? "Entrada agregada." : "Salida agregada.",
  );
}
