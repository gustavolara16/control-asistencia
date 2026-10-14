import type { Metadata } from "next";
import Link from "next/link";
import { crearLocal } from "@/actions/locales";
import { SoloAdmin } from "@/components/solo-admin";
import { claseTarjeta } from "@/components/ui/estilos";
import { LocalForm } from "../local-form";

export const metadata: Metadata = {
  title: "Nuevo local",
};

export default function NuevoLocalPage() {
  return (
    <>
      <div>
        <Link href="/admin/locales" className="text-sm text-brand hover:underline">
          ← Volver a locales
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Nuevo local</h1>
      </div>
      <SoloAdmin>
        <section className={`${claseTarjeta} max-w-2xl`}>
          <LocalForm accion={crearLocal} textoBoton="Crear local" />
        </section>
      </SoloAdmin>
    </>
  );
}
