import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseTarjeta } from "@/components/ui/estilos";
import { requireAdmin } from "@/lib/auth";
import { fechaLocal, formatearFechaHora } from "@/lib/fechas";
import { COLUMNAS_SOLICITUD, describirSolicitud, TEXTO_ESTADO, type Solicitud } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";
import type { LocalRow, PerfilRow } from "@/types/db";
import { ResolverPedido } from "./resolver-pedido";

export const metadata: Metadata = {
  title: "Pedidos de corrección",
};

export default function CorreccionesPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Pedidos />
    </Suspense>
  );
}

async function Pedidos() {
  await requireAdmin();
  const supabase = await createClient();
  const [pendientesRes, resueltosRes, perfilesRes, localesRes] = await Promise.all([
    supabase
      .from("solicitudes_correccion")
      .select(COLUMNAS_SOLICITUD)
      .eq("estado", "pendiente")
      .order("created_at")
      .limit(200),
    supabase
      .from("solicitudes_correccion")
      .select(COLUMNAS_SOLICITUD)
      .neq("estado", "pendiente")
      .order("revisada_en", { ascending: false })
      .limit(30),
    supabase.from("perfiles").select("id, nombre_completo, rol, activo").order("nombre_completo"),
    supabase.from("locales").select("id, nombre"),
  ]);
  if (pendientesRes.error || resueltosRes.error || perfilesRes.error || localesRes.error) {
    throw new Error("No se pudieron cargar los pedidos.");
  }

  const pendientes = pendientesRes.data as unknown as Solicitud[];
  const resueltos = resueltosRes.data as unknown as Solicitud[];
  const perfiles = perfilesRes.data as Pick<PerfilRow, "id" | "nombre_completo" | "rol" | "activo">[];
  const nombre = new Map(perfiles.map((p) => [p.id, p.nombre_completo]));
  const empleados = perfiles.filter((p) => p.rol === "empleado");
  const nombreLocal = new Map((localesRes.data as Pick<LocalRow, "id" | "nombre">[]).map((l) => [l.id, l.nombre]));

  // Día de la marcación afectada (para revisar el contexto antes de decidir).
  const enlaceDia = (s: Solicitud) =>
    `/admin/empleados/${s.perfil_id}/marcaciones?fecha=${fechaLocal(new Date(s.marcaciones?.registrada_en ?? s.fecha_hora_propuesta)).fecha}`;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pedidos de corrección</h1>
        <p className="text-sm text-slate-600">
          Corregí marcaciones vos mismo o revisá los pedidos de los empleados. Nada se borra: todo queda registrado en el
          historial con su motivo.
        </p>
      </div>

      <section className={claseTarjeta}>
        <h2 className="mb-1 font-semibold text-slate-900">Anular o corregir una marcación</h2>
        <p className="mb-3 text-sm text-slate-600">
          Elegí el empleado: vas a ver sus marcaciones del día, con las opciones <strong>Anular</strong>,{" "}
          <strong>Corregir hora</strong> y <strong>Agregar una marcación que faltó</strong>.
        </p>
        {empleados.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hay empleados.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {empleados.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/admin/empleados/${e.id}/marcaciones`}
                  className={`inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium transition-colors hover:border-brand hover:text-brand ${
                    e.activo ? "border-slate-300 text-slate-800" : "border-slate-200 text-slate-400"
                  }`}
                >
                  {e.nombre_completo}
                  {!e.activo && " (inactivo)"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-3 font-semibold text-slate-900">Pedidos pendientes ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-slate-600">No hay pedidos pendientes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {pendientes.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{nombre.get(s.perfil_id) ?? "Empleado"}</span>
                  <span className="text-xs text-slate-500">Pedido el {formatearFechaHora(s.created_at)}</span>
                </div>
                <p className="text-sm text-slate-900">{describirSolicitud(s, nombreLocal)}</p>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{s.motivo}”</p>
                <Link href={enlaceDia(s)} className="self-start text-xs font-medium text-brand hover:underline">
                  Ver las marcaciones de ese día
                </Link>
                <ResolverPedido solicitudId={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-3 font-semibold text-slate-900">Resueltos recientemente</h2>
        {resueltos.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no se resolvió ningún pedido.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {resueltos.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-900">
                    <strong className="font-medium">{nombre.get(s.perfil_id) ?? "Empleado"}</strong> ·{" "}
                    {describirSolicitud(s, nombreLocal)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TEXTO_ESTADO[s.estado].clase}`}>
                    {TEXTO_ESTADO[s.estado].texto}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Motivo: {s.motivo}
                  {s.respuesta && ` · Respuesta: ${s.respuesta}`}
                  {s.revisada_en && ` · ${formatearFechaHora(s.revisada_en)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
