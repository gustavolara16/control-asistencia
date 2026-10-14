import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseBotonPrimario, claseTarjeta } from "@/components/ui/estilos";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LocalRow } from "@/types/db";

export const metadata: Metadata = {
  title: "Locales",
};

export default function LocalesPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Locales</h1>
        <Link href="/admin/locales/nuevo" className={claseBotonPrimario}>
          + Nuevo local
        </Link>
      </div>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <ListaLocales />
      </Suspense>
    </>
  );
}

type LocalConEmpleados = LocalRow & { empleado_locales: { count: number }[] };

async function ListaLocales() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locales")
    .select("*, empleado_locales(count)")
    .order("activo", { ascending: false })
    .order("nombre");
  if (error) throw new Error("No se pudieron cargar los locales.");

  const locales = data as LocalConEmpleados[];
  if (locales.length === 0) {
    return (
      <p className={`${claseTarjeta} text-slate-600`}>
        Todavía no cargaste ningún local. Empezá con <strong>+ Nuevo local</strong>.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {locales.map((local) => (
        <li key={local.id}>
          <Link
            href={`/admin/locales/${local.id}`}
            className={`${claseTarjeta} flex flex-col gap-2 transition-colors hover:border-brand`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-slate-900">{local.nombre}</span>
              <EtiquetaEstado activo={local.activo} />
            </div>
            {local.direccion && <span className="text-sm text-slate-600">{local.direccion}</span>}
            <span className="text-sm text-slate-600">
              {local.empleado_locales[0]?.count ?? 0} empleado(s) ·{" "}
              {local.latitud != null ? `radio ${local.radio_metros} m` : "⚠️ sin ubicación cargada"} · tolerancia{" "}
              {local.tolerancia_minutos} min
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
