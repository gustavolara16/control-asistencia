import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseTarjeta } from "@/components/ui/estilos";
import { requireAdmin } from "@/lib/auth";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LocalRow } from "@/types/db";
import { AvisoClaveSecreta } from "../aviso-clave-secreta";
import { NuevoEmpleadoForm } from "./nuevo-empleado-form";

export const metadata: Metadata = {
  title: "Nuevo empleado",
};

export default function NuevoEmpleadoPage() {
  return (
    <>
      <div>
        <Link href="/admin/empleados" className="text-sm text-brand hover:underline">
          ← Volver a empleados
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Nuevo empleado</h1>
      </div>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <Formulario />
      </Suspense>
    </>
  );
}

async function Formulario() {
  await requireAdmin();
  if (!isAdminClientConfigured()) return <AvisoClaveSecreta />;

  const supabase = await createClient();
  const { data, error } = await supabase.from("locales").select("id, nombre, activo").eq("activo", true).order("nombre");
  if (error) throw new Error("No se pudieron cargar los locales.");

  return (
    <section className={`${claseTarjeta} max-w-2xl`}>
      <NuevoEmpleadoForm locales={data as Pick<LocalRow, "id" | "nombre" | "activo">[]} />
    </section>
  );
}
