import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { inicioDelDia } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Administración",
};

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <ResumenAdmin />
    </Suspense>
  );
}

async function ResumenAdmin() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const hoy = inicioDelDia(new Date()).toISOString();

  const [locales, empleados, marcacionesHoy, solicitudesPendientes] = await Promise.all([
    supabase.from("locales").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase
      .from("perfiles")
      .select("*", { count: "exact", head: true })
      .eq("rol", "empleado")
      .eq("activo", true),
    supabase
      .from("marcaciones")
      .select("*", { count: "exact", head: true })
      .eq("anulada", false)
      .gte("registrada_en", hoy),
    supabase
      .from("solicitudes_correccion")
      .select("*", { count: "exact", head: true })
      .eq("estado", "pendiente"),
  ]);

  const error = locales.error ?? empleados.error ?? marcacionesHoy.error ?? solicitudesPendientes.error;
  if (error) {
    throw new Error("No se pudo cargar el resumen.");
  }

  const tarjetas = [
    { titulo: "Locales activos", valor: locales.count ?? 0 },
    { titulo: "Empleados activos", valor: empleados.count ?? 0 },
    { titulo: "Marcaciones de hoy", valor: marcacionesHoy.count ?? 0 },
    { titulo: "Correcciones pendientes", valor: solicitudesPendientes.count ?? 0 },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hola, {admin.nombreCompleto}</h1>
        <p className="text-sm text-slate-600">Resumen de todos los locales.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">{t.titulo}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{t.valor}</p>
          </div>
        ))}
      </section>

      {(locales.count ?? 0) === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Primer paso: cargá tus locales en{" "}
          <Link href="/admin/locales/nuevo" className="font-medium underline">
            Locales → Nuevo local
          </Link>
          .
        </p>
      ) : (
        (empleados.count ?? 0) === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Siguiente paso: dá de alta a tu personal en{" "}
            <Link href="/admin/empleados/nuevo" className="font-medium underline">
              Empleados → Nuevo empleado
            </Link>
            .
          </p>
        )
      )}
    </>
  );
}
