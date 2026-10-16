"use server";

import { refresh } from "next/cache";
import { requireAdmin, requirePerfil } from "@/lib/auth";
import { esFechaValida, instanteLocal } from "@/lib/fechas";
import { esUuid, leerTexto, type EstadoFormulario } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";

// Las reglas (solo marcaciones y locales propios, hora no futura, como máximo
// 31 días atrás, sin pedidos duplicados) se validan en la base de datos.

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function pedirCorreccion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const perfil = await requirePerfil();
  if (perfil.rol !== "empleado") return { error: "Solo los empleados pueden pedir correcciones." };

  const fecha = leerTexto(formData, "fecha");
  const hora = leerTexto(formData, "hora");
  if (!esFechaValida(fecha) || !FORMATO_HORA.test(hora)) return { error: "Completá el día y la hora correctos." };
  const motivo = leerTexto(formData, "motivo");
  if (motivo.length < 5 || motivo.length > 500) {
    return { error: "Contá brevemente qué pasó (al menos 5 caracteres)." };
  }

  const pedido: Record<string, unknown> = {
    perfil_id: perfil.id,
    fecha_hora_propuesta: instanteLocal(fecha, hora).toISOString(),
    motivo,
  };
  if (leerTexto(formData, "clase") === "hora") {
    const marcacionId = Number(leerTexto(formData, "marcacion"));
    if (!Number.isSafeInteger(marcacionId) || marcacionId <= 0) return { error: "Elegí la marcación a corregir." };
    pedido.marcacion_id = marcacionId;
  } else {
    const tipo = leerTexto(formData, "tipo");
    if (tipo !== "entrada" && tipo !== "salida") return { error: "Elegí si faltó la entrada o la salida." };
    const localId = leerTexto(formData, "local");
    if (!esUuid(localId)) return { error: "Elegí el local." };
    pedido.tipo = tipo;
    pedido.local_id = localId;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("solicitudes_correccion").insert(pedido);
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    if (error.code === "42501") return { error: "No podés pedir ese cambio." };
    console.error("pedirCorreccion: error inesperado", error.code, error.message);
    return { error: "No se pudo enviar el pedido. Intentá de nuevo." };
  }
  refresh();
  return { ok: "Pedido enviado. Te avisamos acá cuando el administrador lo revise." };
}

export async function resolverSolicitud(
  solicitudId: number,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!Number.isSafeInteger(solicitudId) || solicitudId <= 0) return { error: "Pedido inválido." };
  const decision = leerTexto(formData, "decision");
  if (decision !== "aprobar" && decision !== "rechazar") return { error: "Elegí aprobar o rechazar." };
  const respuesta = leerTexto(formData, "respuesta");

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_solicitud", {
    p_solicitud_id: solicitudId,
    p_aprobar: decision === "aprobar",
    p_respuesta: respuesta || null,
  });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("resolverSolicitud: error inesperado", error.code, error.message);
    return { error: "No se pudo guardar. Intentá de nuevo." };
  }
  refresh();
  return { ok: decision === "aprobar" ? "Pedido aprobado y corrección aplicada." : "Pedido rechazado." };
}
