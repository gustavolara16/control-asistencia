import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseBotonPrimario, claseTarjeta } from "@/components/ui/estilos";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { requireAdmin } from "@/lib/auth";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PerfilRow } from "@/types/db";
import { AvisoClaveSecreta } from "./aviso-clave-secreta";

export const metadata: Metadata = {
  title: "Empleados",
};

export default function EmpleadosPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Empleados</h1>
        <Link href="/admin/empleados/nuevo" className={claseBotonPrimario}>
          + Nuevo empleado
        </Link>
      </div>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <ListaEmpleados />
      </Suspense>
    </>
  );
}

type EmpleadoConLocales = Pick<PerfilRow, "id" | "nombre_completo" | "usuario" | "activo"> & {
  empleado_locales: { locales: { nombre: string } | null }[];
};

async function ListaEmpleados() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, usuario, activo, empleado_locales(locales(nombre))")
    .eq("rol", "empleado")
    .order("activo", { ascending: false })
    .order("nombre_completo");
  if (error) throw new Error("No se pudieron cargar los empleados.");

  const empleados = data as unknown as EmpleadoConLocales[];

  return (
    <>
      {!isAdminClientConfigured() && <AvisoClaveSecreta />}
      {empleados.length === 0 ? (
        <p className={`${claseTarjeta} text-slate-600`}>
          Todavía no hay empleados. Creá el primero con <strong>+ Nuevo empleado</strong>.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {empleados.map((empleado) => {
            const locales = empleado.empleado_locales.flatMap((el) => (el.locales ? [el.locales.nombre] : []));
            return (
              <li key={empleado.id}>
                <Link
                  href={`/admin/empleados/${empleado.id}`}
                  className={`${claseTarjeta} flex flex-col gap-1 transition-colors hover:border-brand`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{empleado.nombre_completo}</span>
                    <EtiquetaEstado activo={empleado.activo} />
                  </div>
                  <span className="text-sm text-slate-600">
                    Usuario: <span className="font-mono">{empleado.usuario ?? "—"}</span>
                  </span>
                  <span className="text-sm text-slate-600">
                    {locales.length > 0 ? locales.sort().join(", ") : "⚠️ sin local asignado"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
