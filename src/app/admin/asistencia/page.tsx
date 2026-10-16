import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { DetalleAsistencia, EtiquetasAsistencia } from "@/components/asistencia/fila-asistencia";
import { claseBotonPrimario, claseBotonSecundario, claseInput, claseTarjeta } from "@/components/ui/estilos";
import { calcularAsistencia } from "@/lib/asistencia";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import { requireAdmin } from "@/lib/auth";
import { esFechaValida, fechaLocal, formatearFecha, sumarDias } from "@/lib/fechas";
import { esUuid } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";
import type { PerfilRow } from "@/types/db";

export const metadata: Metadata = {
  title: "Asistencia del día",
};

export default function AsistenciaPage({ searchParams }: PageProps<"/admin/asistencia">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      {searchParams.then(({ fecha, local }) => (
        <AsistenciaDelDia fecha={fecha} local={local} />
      ))}
    </Suspense>
  );
}

async function AsistenciaDelDia(props: { fecha?: string | string[]; local?: string | string[] }) {
  await requireAdmin();
  const ahora = new Date();
  const hoy = fechaLocal(ahora).fecha;
  const fecha = esFechaValida(props.fecha) ? props.fecha : hoy;
  const localId = esUuid(props.local) ? props.local : null;

  const supabase = await createClient();
  const [datos, perfilesRes] = await Promise.all([
    cargarDatosAsistencia(supabase, { desde: fecha, hasta: fecha }),
    supabase.from("perfiles").select("id, nombre_completo").eq("rol", "empleado"),
  ]);
  if (perfilesRes.error) throw new Error("No se pudo cargar la asistencia.");

  const nombres = new Map(
    (perfilesRes.data as Pick<PerfilRow, "id" | "nombre_completo">[]).map((p) => [p.id, p.nombre_completo]),
  );
  const filas = calcularAsistencia({ fecha, ahora, ...datos })
    // Solo empleados (un administrador no tiene horario ni marca).
    .filter((f) => nombres.has(f.perfilId) && (!localId || f.localId === localId))
    .sort((a, b) => nombres.get(a.perfilId)!.localeCompare(nombres.get(b.perfilId)!));

  const personas = (condicion: (f: (typeof filas)[number]) => boolean) =>
    new Set(filas.filter(condicion).map((f) => f.perfilId)).size;
  const tarjetas = [
    { titulo: "Vinieron", valor: personas((f) => f.tramos.length > 0) },
    { titulo: "Trabajando ahora", valor: personas((f) => f.tramos.some((t) => t.situacion === "abierto")) },
    { titulo: "Llegaron tarde", valor: personas((f) => f.estado === "tarde") },
    { titulo: "Faltan o no marcaron", valor: personas((f) => f.estado === "ausente" || f.estado === "sin_marcar") },
  ];

  const enlace = (otraFecha: string) =>
    `/admin/asistencia?fecha=${otraFecha}${localId ? `&local=${localId}` : ""}`;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Asistencia</h1>
        <p className="text-sm text-slate-600 first-letter:uppercase">
          {formatearFecha(fecha)}
          {fecha === hoy && " (hoy)"}
        </p>
      </div>

      <div className={`${claseTarjeta} flex flex-col gap-3`}>
        <Form action="/admin/asistencia" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Día
            <input type="date" name="fecha" defaultValue={fecha} max={hoy} required className={claseInput} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
            Local
            <select name="local" defaultValue={localId ?? ""} className={claseInput}>
              <option value="">Todos los locales</option>
              {datos.locales.map((l) => (
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
          <Link href={enlace(sumarDias(fecha, -1))} className={claseBotonSecundario}>
            ← Día anterior
          </Link>
          {fecha < hoy && (
            <Link href={enlace(sumarDias(fecha, 1))} className={claseBotonSecundario}>
              Día siguiente →
            </Link>
          )}
          {fecha !== hoy && (
            <Link href={enlace(hoy)} className={claseBotonSecundario}>
              Hoy
            </Link>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">{t.titulo}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{t.valor}</p>
          </div>
        ))}
      </section>

      <section className={claseTarjeta}>
        {filas.length === 0 ? (
          <p className="text-sm text-slate-600">Nadie tenía turno ni marcó este día.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {filas.map((fila, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/empleados/${fila.perfilId}`}
                    className="font-medium text-slate-900 hover:text-brand hover:underline"
                  >
                    {nombres.get(fila.perfilId)}
                  </Link>
                  <EtiquetasAsistencia fila={fila} />
                </div>
                <DetalleAsistencia fila={fila} nombreLocal={datos.nombreLocal} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Se compara con el horario semanal actual de cada empleado. La tolerancia para llegar tarde es la de cada
        local.
      </p>
    </>
  );
}
