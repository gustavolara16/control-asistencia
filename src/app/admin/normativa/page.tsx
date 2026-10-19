import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TextoNormativa } from "@/components/normativa/texto-normativa";
import { claseBotonSecundario, claseTarjeta } from "@/components/ui/estilos";
import { requireAdmin } from "@/lib/auth";
import { fechaLocal, formatearFechaHora } from "@/lib/fechas";
import { ESCALA_TARDANZAS, esMesValido, nombreDelMes, sancionPorTardanzas, sumarMeses } from "@/lib/normativa";
import { cargarNormativa, tardanzasDelMes } from "@/lib/normativa-datos";
import { createClient } from "@/lib/supabase/server";
import type { PerfilRow } from "@/types/db";
import { EditarNormativa } from "./editar-normativa";

export const metadata: Metadata = {
  title: "Normativa",
};

export default function NormativaAdminPage({ searchParams }: PageProps<"/admin/normativa">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      {searchParams.then(({ mes }) => (
        <NormativaAdmin mes={mes} />
      ))}
    </Suspense>
  );
}

const fechaCorta = (fecha: string) => fecha.slice(5).split("-").reverse().join("/");

async function NormativaAdmin(props: { mes?: string | string[] }) {
  await requireAdmin();
  const ahora = new Date();
  const mesActual = fechaLocal(ahora).fecha.slice(0, 7);
  const mes = esMesValido(props.mes) && props.mes <= mesActual ? props.mes : mesActual;

  const supabase = await createClient();
  const [normativa, tardanzas, perfilesRes] = await Promise.all([
    cargarNormativa(supabase),
    tardanzasDelMes(supabase, { mes, ahora }),
    supabase.from("perfiles").select("id, nombre_completo, activo").eq("rol", "empleado").order("nombre_completo"),
  ]);
  if (perfilesRes.error) throw new Error("No se pudieron cargar los empleados.");
  const empleados = perfilesRes.data as Pick<PerfilRow, "id" | "nombre_completo" | "activo">[];

  const lecturasRes = normativa
    ? await supabase.from("normativa_lecturas").select("perfil_id, leida_en").eq("version", normativa.version)
    : null;
  if (lecturasRes?.error) throw new Error("No se pudieron cargar las lecturas.");
  const leidas = new Map((lecturasRes?.data ?? []).map((l) => [l.perfil_id as string, l.leida_en as string]));
  const activos = empleados.filter((e) => e.activo);
  const pendientes = activos.filter((e) => !leidas.has(e.id));

  const conTardanzas = empleados
    .map((e) => ({ ...e, tardanzas: tardanzas.get(e.id) ?? [] }))
    .filter((e) => e.tardanzas.length > 0)
    .sort((a, b) => b.tardanzas.length - a.tardanzas.length || a.nombre_completo.localeCompare(b.nombre_completo));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Normativa</h1>
        <p className="text-sm text-slate-600">
          Las reglas que ven los empleados y las llegadas tarde del mes con la sanción que corresponde (Art. 32).
        </p>
      </div>

      <section className={`${claseTarjeta} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Llegadas tarde de {nombreDelMes(mes)}</h2>
          <div className="flex gap-2">
            <Link href={`/admin/normativa?mes=${sumarMeses(mes, -1)}`} className={claseBotonSecundario}>
              ← Anterior
            </Link>
            {mes < mesActual && (
              <Link href={`/admin/normativa?mes=${sumarMeses(mes, 1)}`} className={claseBotonSecundario}>
                Siguiente →
              </Link>
            )}
          </div>
        </div>
        {conTardanzas.length === 0 ? (
          <p className="text-sm text-slate-600">Nadie llegó tarde en este mes.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Empleado</th>
                  <th className="px-3 py-2 text-right font-medium">Tardanzas</th>
                  <th className="px-3 py-2 font-medium">Días (minutos tarde)</th>
                  <th className="py-2 pl-3 font-medium">Corresponde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conTardanzas.map((e) => {
                  const sancion = sancionPorTardanzas(e.tardanzas.length);
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="py-2 pr-3 font-medium text-slate-900">{e.nombre_completo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.tardanzas.length}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {e.tardanzas.map((t) => (
                            <Link
                              key={`${t.fecha}-${t.localId}`}
                              href={`/admin/empleados/${e.id}/marcaciones?fecha=${t.fecha}`}
                              className="whitespace-nowrap text-brand hover:underline"
                            >
                              {fechaCorta(t.fecha)} ({t.minutosTarde} min)
                            </Link>
                          ))}
                        </span>
                      </td>
                      <td className={`py-2 pl-3 ${sancion ? "font-medium text-red-700" : "text-slate-500"}`}>
                        {sancion ?? "Todavía nada (1 tardanza)"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Escala: {ESCALA_TARDANZAS.map((e) => `${e.desde}${e.desde === 5 ? " o más" : ""} → ${e.sancion.toLowerCase()}`).join(" · ")}.
          Se cuentan las llegadas después de la hora de entrada del turno (con la tolerancia del local). Si una
          tardanza estuvo justificada, revisala desde el día (enlace) antes de aplicar la sanción.
        </p>
      </section>

      {normativa && (
        <section className={`${claseTarjeta} flex flex-col gap-2`}>
          <h2 className="font-semibold text-slate-900">
            Quiénes la leyeron ({leidas.size} de {activos.length})
          </h2>
          {pendientes.length === 0 ? (
            <p className="text-sm text-emerald-800">✓ Todos los empleados activos confirmaron la lectura.</p>
          ) : (
            <p className="text-sm text-slate-700">
              <span className="font-medium">Falta que confirmen:</span> {pendientes.map((e) => e.nombre_completo).join(", ")}
            </p>
          )}
          {leidas.size > 0 && (
            <p className="text-xs text-slate-500">
              Leyeron:{" "}
              {empleados
                .filter((e) => leidas.has(e.id))
                .map((e) => `${e.nombre_completo} (${formatearFechaHora(leidas.get(e.id)!)})`)
                .join(" · ")}
            </p>
          )}
        </section>
      )}

      <section className={`${claseTarjeta} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Texto de la normativa</h2>
          {normativa && (
            <span className="text-xs text-slate-500">
              Versión {normativa.version} · {formatearFechaHora(normativa.updated_at)}
            </span>
          )}
        </div>
        {normativa ? (
          <TextoNormativa texto={normativa.texto} />
        ) : (
          <p className="text-sm text-slate-600">Todavía no se publicó. Escribila abajo.</p>
        )}
        <details className="rounded-lg border border-slate-200 [&[open]]:bg-slate-50" open={!normativa}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand">Editar el texto</summary>
          <div className="px-3 pb-3">
            <EditarNormativa texto={normativa?.texto ?? ""} />
          </div>
        </details>
      </section>
    </>
  );
}
