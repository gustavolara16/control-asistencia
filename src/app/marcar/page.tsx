import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requirePerfil } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/fechas";
import { esEntradaAbierta } from "@/lib/marcaciones";
import { esCodigoQrValido } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import type { TipoMarcacion } from "@/types/db";
import { EscanerQr } from "./escaner-qr";
import { PanelMarcar } from "./panel-marcar";

export const metadata: Metadata = {
  title: "Marcar",
};

export default function MarcarPage({ searchParams }: PageProps<"/marcar">) {
  return (
    <>
      <AppHeader titulo="Marcar" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
        <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
          {searchParams.then(({ qr }) => (
            <Contenido qr={typeof qr === "string" ? qr : null} />
          ))}
        </Suspense>
        <Link href="/empleado" className="text-center text-sm text-brand hover:underline">
          Volver al inicio
        </Link>
      </main>
    </>
  );
}

type UltimaMarcacion = {
  tipo: TipoMarcacion;
  registrada_en: string;
  locales: { nombre: string } | null;
};

async function Contenido({ qr }: { qr: string | null }) {
  const perfil = await requirePerfil();

  if (!esCodigoQrValido(qr)) {
    return <EscanerQr />;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("marcaciones")
    .select("tipo, registrada_en, locales(nombre)")
    .eq("perfil_id", perfil.id)
    .eq("anulada", false)
    .order("registrada_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultima = data as unknown as UltimaMarcacion | null;
  const entradaAbierta = esEntradaAbierta(ultima);

  const estado = ultima
    ? `Tu última marca: ${ultima.tipo === "entrada" ? "entrada" : "salida"} el ${formatearFechaHora(ultima.registrada_en)}${
        ultima.locales ? ` en ${ultima.locales.nombre}` : ""
      }.`
    : "Todavía no registraste marcaciones.";

  return (
    <PanelMarcar
      codigoQr={qr}
      nombre={perfil.nombreCompleto}
      tipoSugerido={entradaAbierta ? "salida" : "entrada"}
      estado={estado}
    />
  );
}
