"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { esEndpointPushValido, type EntradasAvisadas } from "@/lib/avisos";
import { avisosConfigurados, enviarAvisos } from "@/lib/avisos-envio";
import { esUuid, type EstadoFormulario } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; error: string };

const esClave = (valor: unknown, max: number): valor is string =>
  typeof valor === "string" && valor.length > 0 && valor.length <= max && /^[A-Za-z0-9_-]+=*$/.test(valor);

/** Guarda el celular o computadora donde el administrador activó los avisos. */
export async function guardarSuscripcion(suscripcion: unknown, dispositivo: unknown): Promise<Resultado> {
  const perfil = await requireAdmin();
  const s = suscripcion as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || !esEndpointPushValido(s.endpoint) || !esClave(s.keys?.p256dh, 200) || !esClave(s.keys?.auth, 100)) {
    return { ok: false, error: "Este navegador entregó datos de notificación no válidos." };
  }

  const supabase = await createClient();
  // Si ya estaba (por ejemplo, el navegador renovó sus claves), se reemplaza.
  await supabase.from("suscripciones_push").delete().eq("endpoint", s.endpoint);
  const { error } = await supabase.from("suscripciones_push").insert({
    perfil_id: perfil.id,
    endpoint: s.endpoint,
    p256dh: s.keys!.p256dh,
    auth: s.keys!.auth,
    dispositivo: typeof dispositivo === "string" ? dispositivo.slice(0, 100) : "",
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Este dispositivo ya tiene los avisos activados con otra cuenta de administrador." };
    }
    console.error("guardarSuscripcion", error.code, error.message);
    return { ok: false, error: "No se pudieron activar los avisos. Intentá de nuevo." };
  }
  refresh();
  return { ok: true };
}

/** Deja de enviar avisos a un dispositivo (por su dirección o por su número). */
export async function quitarSuscripcion(cual: { endpoint: string } | { id: number }): Promise<Resultado> {
  await requireAdmin();
  const supabase = await createClient();
  const consulta = supabase.from("suscripciones_push").delete();
  const { error } =
    "id" in cual
      ? await consulta.eq("id", Number.isSafeInteger(cual.id) ? cual.id : -1)
      : await consulta.eq("endpoint", String(cual.endpoint));
  if (error) {
    console.error("quitarSuscripcion", error.code, error.message);
    return { ok: false, error: "No se pudieron desactivar los avisos." };
  }
  refresh();
  return { ok: true };
}

export async function guardarPreferenciasAvisos(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const perfil = await requireAdmin();
  const entradas = formData.get("entradas");
  if (entradas !== "todas" && entradas !== "tarde" && entradas !== "ninguna") return { error: "Elegí qué entradas avisar." };
  const salidas = formData.get("salidas") === "si";
  const elegidos = [...new Set(formData.getAll("local").filter(esUuid))];
  if (elegidos.length === 0) return { error: "Elegí al menos un local." };

  const supabase = await createClient();
  const { data: locales, error: errorLocales } = await supabase.from("locales").select("id");
  if (errorLocales) return { error: "No se pudieron guardar los cambios." };
  const existentes = new Set(locales.map((l) => l.id as string));
  const validos = elegidos.filter((id) => existentes.has(id));
  if (validos.length === 0) return { error: "Elegí al menos un local." };
  // Con todos marcados se guarda "todos", así también se incluyen los locales nuevos.
  const cambios = {
    entradas: entradas as EntradasAvisadas,
    salidas,
    locales: validos.length === existentes.size ? null : validos,
  };

  const { data: actual } = await supabase.from("preferencias_avisos").select("perfil_id").eq("perfil_id", perfil.id).maybeSingle();
  const { error } = actual
    ? await supabase.from("preferencias_avisos").update(cambios).eq("perfil_id", perfil.id)
    : await supabase.from("preferencias_avisos").insert({ perfil_id: perfil.id, ...cambios });
  if (error) {
    console.error("guardarPreferenciasAvisos", error.code, error.message);
    return { error: "No se pudieron guardar los cambios." };
  }
  refresh();
  return { ok: "Listo, se guardaron tus preferencias." };
}

/** Manda un aviso de prueba a todos los dispositivos del administrador. */
export async function enviarAvisoPrueba(): Promise<{ ok: string } | { error: string }> {
  await requireAdmin();
  if (!avisosConfigurados()) return { error: "Los avisos todavía no están configurados en el servidor." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("suscripciones_push").select("id, perfil_id, endpoint, p256dh, auth");
  if (error) return { error: "No se pudo enviar la prueba." };
  if (data.length === 0) return { error: "Primero activá los avisos en este dispositivo." };

  const enviados = await enviarAvisos(supabase, data, {
    titulo: "Aviso de prueba",
    cuerpo: "Así te van a llegar los avisos cuando tus empleados marquen.",
    url: "/admin/avisos",
  });
  return enviados > 0
    ? { ok: `Listo: se envió a ${enviados} dispositivo${enviados > 1 ? "s" : ""}. Debería llegarte en unos segundos.` }
    : { error: "No se pudo enviar a ningún dispositivo. Desactivá y volvé a activar los avisos." };
}
