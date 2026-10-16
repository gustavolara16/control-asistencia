import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { actualizarLocal, cambiarEstadoLocal } from "@/actions/locales";
import { claseBotonPeligro, claseBotonPrimario, claseBotonSecundario, claseTarjeta } from "@/components/ui/estilos";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { requireAdmin } from "@/lib/auth";
import { esUuid } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_LOCAL, type LocalRow } from "@/types/db";
import { LocalForm } from "../local-form";

export const metadata: Metadata = {
  title: "Editar local",
};

export default function EditarLocalPage({ params }: PageProps<"/admin/locales/[id]">) {
  return (
    <>
      <Link href="/admin/locales" className="text-sm text-brand hover:underline">
        ← Volver a locales
      </Link>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        {params.then(({ id }) => (
          <EditarLocal id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function EditarLocal({ id }: { id: string }) {
  await requireAdmin();
  if (!esUuid(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.from("locales").select(COLUMNAS_LOCAL).eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar el local.");
  if (!data) notFound();
  const local = data as LocalRow;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{local.nombre}</h1>
        <EtiquetaEstado activo={local.activo} />
        <Link href={`/admin/locales/${local.id}/qr`} className={`${claseBotonSecundario} ml-auto`}>
          Código QR para marcar
        </Link>
      </div>

      <section className={`${claseTarjeta} max-w-2xl`}>
        <LocalForm accion={actualizarLocal.bind(null, local.id)} local={local} textoBoton="Guardar cambios" />
      </section>

      <section className={`${claseTarjeta} flex max-w-2xl flex-col gap-3`}>
        <h2 className="font-semibold text-slate-900">Estado del local</h2>
        <p className="text-sm text-slate-600">
          {local.activo
            ? "Si lo desactivás, los empleados no podrán marcar en este local. El historial se conserva."
            : "El local está desactivado: no se puede marcar en él. Podés volver a activarlo cuando quieras."}
        </p>
        <form action={cambiarEstadoLocal.bind(null, local.id, !local.activo)}>
          <button type="submit" className={local.activo ? claseBotonPeligro : claseBotonPrimario}>
            {local.activo ? "Desactivar local" : "Activar local"}
          </button>
        </form>
      </section>
    </>
  );
}
