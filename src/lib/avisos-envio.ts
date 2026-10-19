import "server-only";
import webpush, { WebPushError } from "web-push";
import { calcularAsistencia, type FilaAsistencia } from "@/lib/asistencia";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import {
  armarAviso,
  debeAvisar,
  esEndpointPushValido,
  filaDeMarcacion,
  PREFERENCIAS_INICIALES,
  type Aviso,
  type PreferenciasAvisos,
} from "@/lib/avisos";
import { fechaLocal, sumarDias } from "@/lib/fechas";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import type { TipoMarcacion } from "@/types/db";

type Cliente = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;
type Suscripcion = { id: number; perfil_id: string; endpoint: string; p256dh: string; auth: string };

// La clave pública se entrega al navegador al activar los avisos; la privada
// firma los envíos y nunca sale del servidor.
export function clavePublicaAvisos(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function avisosConfigurados(): boolean {
  return Boolean(clavePublicaAvisos() && process.env.VAPID_PRIVATE_KEY?.trim() && isAdminClientConfigured());
}

/** Envía un aviso a cada suscripción y borra las que el navegador dio de baja. */
export async function enviarAvisos(supabase: Cliente, suscripciones: Suscripcion[], aviso: Aviso): Promise<number> {
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const publica = clavePublicaAvisos();
  if (!privada || !publica) return 0;

  // Dirección del responsable que piden los servicios de notificaciones.
  const sitio = (process.env.APP_URL || process.env.URL || "").trim().replace(/\/+$/, "");
  const opciones = {
    vapidDetails: { subject: sitio.startsWith("https://") ? sitio : "https://localhost", publicKey: publica, privateKey: privada },
    TTL: 6 * 60 * 60, // si el celular está apagado, el aviso se descarta a las 6 h
    urgency: "high" as const,
    timeout: 5000,
  };
  const contenido = JSON.stringify(aviso);
  const vencidas: number[] = [];
  let enviados = 0;

  await Promise.all(
    suscripciones
      .filter((s) => esEndpointPushValido(s.endpoint))
      .map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, contenido, opciones);
          enviados++;
        } catch (error) {
          if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
            vencidas.push(s.id);
          } else {
            console.error("avisos: no se pudo enviar", error instanceof WebPushError ? error.statusCode : String(error));
          }
        }
      }),
  );
  if (vencidas.length > 0) await supabase.from("suscripciones_push").delete().in("id", vencidas);
  return enviados;
}

/**
 * Avisa a los administradores que un empleado marcó. Se llama después de
 * registrar la marcación: si algo falla acá, la marcación ya quedó guardada.
 * `supabase` es el cliente del empleado (para calcular si llegó tarde con sus
 * propios datos); las suscripciones de los administradores se leen con la
 * clave secreta, en el servidor.
 */
export async function avisarMarcacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  m: { perfilId: string; empleado: string; tipo: TipoMarcacion; registradaEn: string; local: string },
): Promise<void> {
  if (!avisosConfigurados()) return;
  const admin = createAdminClient();

  const { data: subs, error } = await admin
    .from("suscripciones_push")
    .select("id, perfil_id, endpoint, p256dh, auth, perfiles!inner(rol, activo)")
    .eq("perfiles.rol", "admin")
    .eq("perfiles.activo", true)
    .neq("perfil_id", m.perfilId);
  if (error) throw new Error(`no se pudieron leer las suscripciones (${error.code})`);
  const suscripciones = subs as unknown as Suscripcion[];
  if (suscripciones.length === 0) return;

  const prefsRes = await admin
    .from("preferencias_avisos")
    .select("perfil_id, entradas, salidas, locales")
    .in("perfil_id", [...new Set(suscripciones.map((s) => s.perfil_id))]);
  if (prefsRes.error) throw new Error(`no se pudieron leer las preferencias (${prefsRes.error.code})`);
  const preferencias = new Map(
    (prefsRes.data as (PreferenciasAvisos & { perfil_id: string })[]).map((p) => [p.perfil_id, p]),
  );

  // Turno al que corresponde la marcación (puede ser de ayer, si es nocturno).
  const fecha = fechaLocal(new Date(m.registradaEn)).fecha;
  const datos = await cargarDatosAsistencia(supabase, { desde: sumarDias(fecha, -1), hasta: fecha, perfilId: m.perfilId });
  const ahora = new Date();
  const filas: FilaAsistencia[] = [fecha, sumarDias(fecha, -1)].flatMap((f) => calcularAsistencia({ fecha: f, ahora, ...datos }));
  const fila = filaDeMarcacion(filas, m.perfilId, m.tipo, m.registradaEn);
  const marcacion = datos.marcaciones.find(
    (x) => x.tipo === m.tipo && Date.parse(x.registrada_en) === Date.parse(m.registradaEn),
  );

  const avisada = { ...m, localId: marcacion?.local_id ?? fila?.localId ?? "", fila };
  const destinatarios = suscripciones.filter((s) => debeAvisar(preferencias.get(s.perfil_id) ?? PREFERENCIAS_INICIALES, avisada));
  if (destinatarios.length > 0) await enviarAvisos(admin, destinatarios, armarAviso(avisada));
}
