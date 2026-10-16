"use server";

import { requirePerfil } from "@/lib/auth";
import { esCodigoQrValido } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import type { TipoMarcacion } from "@/types/db";

export type Ubicacion = {
  latitud: number;
  longitud: number;
  precision: number;
};

export type ResultadoMarcacion =
  | { ok: true; tipo: TipoMarcacion; registradaEn: string; local: string }
  | { ok: false; error: string };

export async function marcar(
  codigoQr: string,
  tipo: TipoMarcacion,
  ubicacion: Ubicacion | null,
): Promise<ResultadoMarcacion> {
  await requirePerfil();

  if (!esCodigoQrValido(codigoQr)) return { ok: false, error: "El código QR no es válido." };
  if (tipo !== "entrada" && tipo !== "salida") return { ok: false, error: "Tipo de marcación inválido." };

  const valida =
    ubicacion !== null &&
    [ubicacion.latitud, ubicacion.longitud, ubicacion.precision].every((n) => typeof n === "number" && Number.isFinite(n));

  // Todas las reglas (QR, local, distancia, alternancia, hora) se validan en la
  // base de datos. La app solo informa la ubicación que dio el celular.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_marcacion", {
    p_qr_token: codigoQr,
    p_tipo: tipo,
    p_latitud: valida ? ubicacion.latitud : null,
    p_longitud: valida ? ubicacion.longitud : null,
    p_precision_metros: valida ? ubicacion.precision : null,
  });

  if (error) {
    // P0001: mensajes escritos para el empleado en registrar_marcacion.
    if (error.code === "P0001") return { ok: false, error: error.message };
    console.error("marcar: error inesperado", error.code, error.message);
    return { ok: false, error: "No se pudo registrar la marcación. Intentá de nuevo." };
  }

  const r = data as { tipo: TipoMarcacion; registrada_en: string; local: string };
  return { ok: true, tipo: r.tipo, registradaEn: r.registrada_en, local: r.local };
}
