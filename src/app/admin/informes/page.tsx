import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { claseBotonPrimario, claseBotonSecundario, claseInput, claseTarjeta } from "@/components/ui/estilos";
import { requireAdmin } from "@/lib/auth";
import { fechaLocal, formatearDuracion, sumarDias } from "@/lib/fechas";
import { esUuid } from "@/lib/formularios";
import { leerPeriodo, type ResumenEmpleado } from "@/lib/informes";
import { cargarInforme } from "@/lib/informes-datos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Informes",
};

export default function InformesPage({ searchParams }: PageProps<"/admin/informes">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      {searchParams.then(({ desde, hasta, local }) => (
        <Informe desde={desde} hasta={hasta} local={local} />
      ))}
    </Suspense>
  );
}

const fechaCorta = (fecha: string) => fecha.split("-").reverse().join("/");

function diferencia(minutos: number): string {
  if (minutos === 0) return "0:00 h";
  return `${minutos > 0 ? "+" : "−"}${formatearDuracion(Math.abs(minutos))}`;
}

async function Informe(props: { desde?: string | string[]; hasta?: string | string[]; local?: string | string[] }) {
  await requireAdmin();
  const ahora = new Date();
  const hoy = fechaLocal(ahora).fecha;
  const { desde, hasta, aviso } = leerPeriodo(props.desde, props.hasta, hoy);
  const localId = esUuid(props.local) ? props.local : null;

  const supabase = await createClient();
  const informe = await cargarInforme(supabase, { desde, hasta, localId, ahora });
  const { resumenes, nombres, locales } = informe;

  const totales = resumenes.reduce(
    (t, r) => ({
      minutosTrabajados: t.minutosTrabajados + r.minutosTrabajados,
      minutosProgramados: t.minutosProgramados + r.minutosProgramados,
      llegadasTarde: t.llegadasTarde + r.llegadasTarde,
      ausencias: t.ausencias + r.ausencias,
    }),
    { minutosTrabajados: 0, minutosProgramados: 0, llegadasTarde: 0, ausencias: 0 },
  );

  const consulta = (otros: Record<string, string>) =>
    new URLSearchParams({ desde, hasta, ...(localId ? { local: localId } : {}), ...otros }).toString();
  const periodo = (d: string, h: string) => `/admin/informes?${new URLSearchParams({ desde: d, hasta: h, ...(localId ? { local: localId } : {}) })}`;
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const finMesAnterior = sumarDias(inicioMes, -1);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Informes</h1>
        <p className="text-sm text-slate-600">
          Del {fechaCorta(desde)} al {fechaCorta(hasta)}
          {localId && ` · ${locales.find((l) => l.id === localId)?.nombre ?? "Local"}`}
        </p>
      </div>

      <div className={`${claseTarjeta} flex flex-col gap-3`}>
        <Form action="/admin/informes" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Desde
            <input type="date" name="desde" defaultValue={desde} max={hoy} required className={claseInput} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Hasta
            <input type="date" name="hasta" defaultValue={hasta} max={hoy} required className={claseInput} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
            Local
            <select name="local" defaultValue={localId ?? ""} className={claseInput}>
              <option value="">Todos los locales</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={claseBotonPrimario}>
            Ver
          </button>
        </Form>
        <div className="flex flex-wrap gap-2">
          <Link href={periodo(inicioMes, hoy)} className={claseBotonSecundario}>
            Este mes
          </Link>
          <Link href={periodo(`${finMesAnterior.slice(0, 8)}01`, finMesAnterior)} className={claseBotonSecundario}>
            Mes anterior
          </Link>
          <Link href={periodo(sumarDias(hoy, -6), hoy)} className={claseBotonSecundario}>
            Últimos 7 días
          </Link>
        </div>
        {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { titulo: "Horas trabajadas", valor: formatearDuracion(totales.minutosTrabajados) },
          { titulo: "Horas según horario", valor: formatearDuracion(totales.minutosProgramados) },
          { titulo: "Llegadas tarde", valor: totales.llegadasTarde },
          { titulo: "Ausencias", valor: totales.ausencias },
        ].map((t) => (
          <div key={t.titulo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">{t.titulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{t.valor}</p>
          </div>
        ))}
      </section>

      <section className={`${claseTarjeta} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Por empleado</h2>
          <div className="flex flex-wrap gap-2">
            {/* Enlaces comunes (no Link): son descargas de archivos. */}
            <a href={`/admin/informes/descargar?${consulta({ tipo: "resumen" })}`} className={claseBotonSecundario}>
              Descargar resumen (Excel)
            </a>
            <a href={`/admin/informes/descargar?${consulta({ tipo: "detalle" })}`} className={claseBotonSecundario}>
              Descargar detalle por día (Excel)
            </a>
          </div>
        </div>
        {resumenes.length === 0 ? (
          <p className="text-sm text-slate-600">No hay turnos ni marcaciones en este período.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Empleado</th>
                  <th className="px-3 py-2 text-right font-medium">Días</th>
                  <th className="px-3 py-2 text-right font-medium">Trabajadas</th>
                  <th className="px-3 py-2 text-right font-medium">Según horario</th>
                  <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                  <th className="px-3 py-2 text-right font-medium">Tarde</th>
                  <th className="px-3 py-2 text-right font-medium">Ausencias</th>
                  <th className="py-2 pl-3 font-medium">Otros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {resumenes.map((r) => (
                  <FilaResumen key={r.perfilId} r={r} nombre={nombres.get(r.perfilId)!} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Se compara con el horario semanal actual de cada empleado. «Según horario» suma los turnos que ya empezaron;
          la diferencia positiva son horas de más. Las marcaciones anuladas no cuentan.
        </p>
      </section>
    </>
  );
}

function FilaResumen({ r, nombre }: { r: ResumenEmpleado; nombre: string }) {
  const otros = [
    r.salidasAnticipadas > 0 && `${r.salidasAnticipadas} salida${r.salidasAnticipadas > 1 ? "s" : ""} antes`,
    r.sinSalida > 0 && `${r.sinSalida} sin marcar salida`,
    r.fueraDeHorario > 0 && `${r.fueraDeHorario} fuera de horario`,
  ].filter(Boolean);
  const dif = r.minutosTrabajados - r.minutosProgramados;
  return (
    <tr>
      <td className="py-2 pr-3">
        <Link href={`/admin/empleados/${r.perfilId}`} className="font-medium text-slate-900 hover:text-brand hover:underline">
          {nombre}
        </Link>
      </td>
      <td className="px-3 py-2 text-right">{r.diasTrabajados}</td>
      <td className="px-3 py-2 text-right">{formatearDuracion(r.minutosTrabajados)}</td>
      <td className="px-3 py-2 text-right text-slate-600">{formatearDuracion(r.minutosProgramados)}</td>
      <td className={`px-3 py-2 text-right ${dif < 0 ? "text-red-700" : dif > 0 ? "text-emerald-700" : "text-slate-600"}`}>
        {diferencia(dif)}
      </td>
      <td className="px-3 py-2 text-right">
        {r.llegadasTarde > 0 ? `${r.llegadasTarde} (${formatearDuracion(r.minutosTarde)})` : "—"}
      </td>
      <td className={`px-3 py-2 text-right ${r.ausencias > 0 ? "font-medium text-red-700" : ""}`}>{r.ausencias || "—"}</td>
      <td className="py-2 pl-3 text-xs text-slate-600">{otros.join(" · ") || "—"}</td>
    </tr>
  );
}
