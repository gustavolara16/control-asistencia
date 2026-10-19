import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TardanzasDelMesEmpleado } from "@/components/normativa/tardanzas-del-mes";
import { TextoNormativa } from "@/components/normativa/texto-normativa";
import { claseTarjeta } from "@/components/ui/estilos";
import { requirePerfil } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/fechas";
import { cargarNormativa } from "@/lib/normativa-datos";
import { createClient } from "@/lib/supabase/server";
import { ConfirmarLectura } from "./confirmar-lectura";

export const metadata: Metadata = {
  title: "Normativa",
};

export default function NormativaEmpleadoPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <NormativaEmpleado />
    </Suspense>
  );
}

async function NormativaEmpleado() {
  const perfil = await requirePerfil();
  const supabase = await createClient();
  const normativa = await cargarNormativa(supabase);
  const lectura = normativa
    ? (
        await supabase
          .from("normativa_lecturas")
          .select("leida_en")
          .eq("perfil_id", perfil.id)
          .eq("version", normativa.version)
          .maybeSingle()
      ).data
    : null;

  return (
    <>
      <div>
        <Link href="/empleado" className="text-sm font-medium text-brand hover:underline">
          ← Volver
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Normativa</h1>
        <p className="text-sm text-slate-600">Reglas de asistencia y puntualidad de la empresa.</p>
      </div>

      <Suspense fallback={null}>
        <TardanzasDelMesEmpleado perfilId={perfil.id} siempre />
      </Suspense>

      {!normativa ? (
        <p className={`${claseTarjeta} text-sm text-slate-600`}>Todavía no se publicó la normativa.</p>
      ) : (
        <>
          <section className={claseTarjeta}>
            <TextoNormativa texto={normativa.texto} />
            <p className="mt-4 text-xs text-slate-500">Última actualización: {formatearFechaHora(normativa.updated_at)}</p>
          </section>
          {lectura ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              ✓ Confirmaste que la leíste el {formatearFechaHora(lectura.leida_en)}.
            </p>
          ) : (
            <ConfirmarLectura />
          )}
        </>
      )}
    </>
  );
}
