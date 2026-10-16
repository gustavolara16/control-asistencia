import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseTarjeta } from "@/components/ui/estilos";
import { requirePerfil } from "@/lib/auth";
import { fechaLocal, formatearFechaHora, formatearHora, instanteLocal, sumarDias } from "@/lib/fechas";
import { COLUMNAS_SOLICITUD, describirSolicitud, TEXTO_ESTADO, type Solicitud } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";
import type { LocalRow, MarcacionRow } from "@/types/db";
import { FormularioPedido } from "./formulario-pedido";

export const metadata: Metadata = {
  title: "Pedir una corrección",
};

export default function CorreccionesEmpleadoPage() {
  return (
    <>
      <Link href="/empleado" className="text-sm text-brand hover:underline">
        ← Volver
      </Link>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <Correcciones />
      </Suspense>
    </>
  );
}

async function Correcciones() {
  const perfil = await requirePerfil();
  const supabase = await createClient();
  const hoy = fechaLocal(new Date()).fecha;
  const desde = instanteLocal(sumarDias(hoy, -30), "00:00").toISOString();

  // Las políticas RLS garantizan que solo vuelvan los datos de este empleado.
  const [localesRes, marcacionesRes, solicitudesRes] = await Promise.all([
    supabase.from("empleado_locales").select("locales(id, nombre)").eq("perfil_id", perfil.id),
    supabase
      .from("marcaciones")
      .select("id, local_id, tipo, registrada_en")
      .eq("perfil_id", perfil.id)
      .eq("anulada", false)
      .gte("registrada_en", desde)
      .order("registrada_en", { ascending: false })
      .limit(60),
    supabase
      .from("solicitudes_correccion")
      .select(COLUMNAS_SOLICITUD)
      .eq("perfil_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (localesRes.error || marcacionesRes.error || solicitudesRes.error) {
    throw new Error("No se pudieron cargar tus datos.");
  }

  const locales = (localesRes.data as unknown as { locales: Pick<LocalRow, "id" | "nombre"> | null }[])
    .flatMap((fila) => (fila.locales ? [fila.locales] : []))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));
  const marcaciones = marcacionesRes.data as Pick<MarcacionRow, "id" | "local_id" | "tipo" | "registrada_en">[];
  const solicitudes = solicitudesRes.data as unknown as Solicitud[];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pedir una corrección</h1>
        <p className="text-sm text-slate-600">
          Si te olvidaste de marcar o una hora quedó mal, avisale al administrador. Si aprueba el pedido, se corrige tu
          asistencia.
        </p>
      </div>

      <section className={claseTarjeta}>
        {locales.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no tenés un local asignado.</p>
        ) : (
          <FormularioPedido
            hoy={hoy}
            locales={locales.map((l) => ({ id: l.id, texto: l.nombre }))}
            marcaciones={marcaciones.map((m) => ({
              id: String(m.id),
              texto: `${formatearFechaHora(m.registrada_en)} · ${m.tipo === "entrada" ? "Entrada" : "Salida"} · ${nombreLocal.get(m.local_id) ?? "Local"}`,
              fecha: fechaLocal(new Date(m.registrada_en)).fecha,
              hora: formatearHora(m.registrada_en),
            }))}
          />
        )}
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-2 font-semibold text-slate-900">Tus pedidos</h2>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hiciste pedidos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {solicitudes.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-900">{describirSolicitud(s, nombreLocal)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TEXTO_ESTADO[s.estado].clase}`}>
                    {TEXTO_ESTADO[s.estado].texto}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Pedido el {formatearFechaHora(s.created_at)} · {s.motivo}
                </span>
                {s.respuesta && <span className="text-xs text-slate-700">Respuesta: {s.respuesta}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
