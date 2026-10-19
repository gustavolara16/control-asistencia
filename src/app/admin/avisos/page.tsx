import type { Metadata } from "next";
import { Suspense } from "react";
import { claseTarjeta } from "@/components/ui/estilos";
import { requireAdmin } from "@/lib/auth";
import { PREFERENCIAS_INICIALES, type PreferenciasAvisos } from "@/lib/avisos";
import { avisosConfigurados, clavePublicaAvisos } from "@/lib/avisos-envio";
import { formatearFechaHora } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import { ActivarAvisos } from "./activar-avisos";
import { FormularioPreferencias } from "./formulario-preferencias";
import { QuitarDispositivo } from "./quitar-dispositivo";

export const metadata: Metadata = {
  title: "Avisos",
};

export default function AvisosPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Avisos />
    </Suspense>
  );
}

async function Avisos() {
  const perfil = await requireAdmin();
  const supabase = await createClient();
  const [preferenciasRes, localesRes, dispositivosRes] = await Promise.all([
    supabase.from("preferencias_avisos").select("entradas, salidas, locales").eq("perfil_id", perfil.id).maybeSingle(),
    supabase.from("locales").select("id, nombre").order("nombre"),
    supabase.from("suscripciones_push").select("id, dispositivo, created_at").eq("perfil_id", perfil.id).order("created_at"),
  ]);
  if (preferenciasRes.error || localesRes.error || dispositivosRes.error) {
    throw new Error("No se pudieron cargar los avisos.");
  }
  const preferencias = (preferenciasRes.data as PreferenciasAvisos | null) ?? PREFERENCIAS_INICIALES;
  const clavePublica = clavePublicaAvisos();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Avisos</h1>
        <p className="text-sm text-slate-600">
          Recibí una notificación en tu celular cada vez que un empleado marca. Llegan aunque tengas la app cerrada.
        </p>
      </div>

      <section className={claseTarjeta}>
        <h2 className="mb-3 font-semibold text-slate-900">Este dispositivo</h2>
        {clavePublica && avisosConfigurados() ? (
          <ActivarAvisos clavePublica={clavePublica} />
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Falta configurar las claves de los avisos en el servidor (VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY).
          </p>
        )}
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-1 font-semibold text-slate-900">Qué querés que te avise</h2>
        <p className="mb-4 text-sm text-slate-600">Vale para todos tus dispositivos.</p>
        <FormularioPreferencias preferencias={preferencias} locales={localesRes.data} />
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-3 font-semibold text-slate-900">Dispositivos con avisos activados</h2>
        {dispositivosRes.data.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no activaste los avisos en ningún dispositivo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {dispositivosRes.data.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-slate-900">
                  {d.dispositivo || "Dispositivo"}
                  <span className="text-xs text-slate-500"> · desde el {formatearFechaHora(d.created_at)}</span>
                </span>
                <QuitarDispositivo id={d.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
