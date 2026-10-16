import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { agregarMarcacion, anularMarcacion, corregirHoraMarcacion } from "@/actions/correcciones";
import { claseBotonPrimario, claseBotonSecundario, claseInput, claseTarjeta } from "@/components/ui/estilos";
import { FormularioAccion } from "@/components/ui/formulario-accion";
import { requireAdmin } from "@/lib/auth";
import {
  esFechaValida,
  fechaLocal,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
  instanteLocal,
  sumarDias,
} from "@/lib/fechas";
import { esUuid } from "@/lib/formularios";
import { createClient } from "@/lib/supabase/server";
import type { LocalRow, MarcacionRow, PerfilRow, TipoMarcacion } from "@/types/db";

export const metadata: Metadata = {
  title: "Marcaciones del empleado",
};

type Marcacion = Pick<MarcacionRow, "id" | "local_id" | "tipo" | "registrada_en" | "anulada" | "origen"> & {
  nota: string | null;
  distancia_metros: number | null;
};

type DatosMarcacion = { tipo?: TipoMarcacion; registrada_en?: string; anulada?: boolean };

type RegistroAuditoria = {
  id: number;
  registro_id: string;
  accion: "INSERT" | "UPDATE" | "DELETE";
  datos_anteriores: DatosMarcacion | null;
  datos_nuevos: DatosMarcacion | null;
  realizado_por: string | null;
  realizado_en: string;
  motivo: string | null;
};

export default function MarcacionesEmpleadoPage({ params, searchParams }: PageProps<"/admin/empleados/[id]/marcaciones">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      {Promise.all([params, searchParams]).then(([{ id }, { fecha }]) => (
        <MarcacionesDelDia id={id} fecha={fecha} />
      ))}
    </Suspense>
  );
}

const nombreTipo = (tipo: TipoMarcacion | undefined) => (tipo === "salida" ? "salida" : "entrada");

/** Describe un cambio de la auditoría en palabras. */
function describirCambio(r: RegistroAuditoria): string {
  const antes = r.datos_anteriores ?? {};
  const despues = r.datos_nuevos ?? {};
  if (r.accion === "INSERT") {
    return `Agregó una ${nombreTipo(despues.tipo)} a las ${formatearFechaHora(despues.registrada_en!)}`;
  }
  const cambios: string[] = [];
  if (!antes.anulada && despues.anulada) {
    cambios.push(`Anuló la ${nombreTipo(antes.tipo)} de las ${formatearFechaHora(antes.registrada_en!)}`);
  }
  if (antes.registrada_en && despues.registrada_en && Date.parse(antes.registrada_en) !== Date.parse(despues.registrada_en)) {
    cambios.push(
      `Cambió la hora de la ${nombreTipo(antes.tipo)}: ${formatearFechaHora(antes.registrada_en)} → ${formatearFechaHora(despues.registrada_en)}`,
    );
  }
  return cambios.join(" · ") || "Modificó la marcación";
}

async function MarcacionesDelDia({ id, fecha: fechaPedida }: { id: string; fecha?: string | string[] }) {
  await requireAdmin();
  if (!esUuid(id)) notFound();
  const hoy = fechaLocal(new Date()).fecha;
  const fecha = esFechaValida(fechaPedida) && fechaPedida <= hoy ? fechaPedida : hoy;

  const supabase = await createClient();
  const [perfilRes, localesRes, asignadosRes, marcacionesRes] = await Promise.all([
    supabase.from("perfiles").select("id, nombre_completo").eq("id", id).eq("rol", "empleado").maybeSingle(),
    supabase.from("locales").select("id, nombre").order("nombre"),
    supabase.from("empleado_locales").select("local_id").eq("perfil_id", id),
    supabase
      .from("marcaciones")
      .select("id, local_id, tipo, registrada_en, anulada, origen, nota, distancia_metros")
      .eq("perfil_id", id)
      .gte("registrada_en", instanteLocal(fecha, "00:00").toISOString())
      .lt("registrada_en", instanteLocal(sumarDias(fecha, 1), "00:00").toISOString())
      .order("registrada_en"),
  ]);
  if (perfilRes.error || localesRes.error || asignadosRes.error || marcacionesRes.error) {
    throw new Error("No se pudieron cargar las marcaciones.");
  }
  if (!perfilRes.data) notFound();

  const empleado = perfilRes.data as Pick<PerfilRow, "id" | "nombre_completo">;
  const locales = localesRes.data as Pick<LocalRow, "id" | "nombre">[];
  const asignados = new Set((asignadosRes.data as { local_id: string }[]).map((a) => a.local_id));
  const marcaciones = marcacionesRes.data as Marcacion[];
  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));

  // Historial de correcciones de las marcaciones de este día.
  let auditoria: RegistroAuditoria[] = [];
  if (marcaciones.length > 0) {
    const { data, error } = await supabase
      .from("auditoria")
      .select("id, registro_id, accion, datos_anteriores, datos_nuevos, realizado_por, realizado_en, motivo")
      .eq("tabla", "marcaciones")
      .in("registro_id", marcaciones.map((m) => String(m.id)))
      .order("realizado_en", { ascending: false });
    if (error) throw new Error("No se pudo cargar el historial de correcciones.");
    auditoria = data as RegistroAuditoria[];
  }
  const autores = [...new Set(auditoria.flatMap((r) => (r.realizado_por ? [r.realizado_por] : [])))];
  const nombreAutor = new Map<string, string>();
  if (autores.length > 0) {
    const { data } = await supabase.from("perfiles").select("id, nombre_completo").in("id", autores);
    for (const p of (data ?? []) as Pick<PerfilRow, "id" | "nombre_completo">[]) nombreAutor.set(p.id, p.nombre_completo);
  }
  // Hora original de las marcaciones a las que se les cambió la hora.
  const horaOriginal = new Map<string, string>();
  for (const r of [...auditoria].reverse()) {
    const antes = r.datos_anteriores?.registrada_en;
    const despues = r.datos_nuevos?.registrada_en;
    if (r.accion === "UPDATE" && antes && despues && Date.parse(antes) !== Date.parse(despues) && !horaOriginal.has(r.registro_id)) {
      horaOriginal.set(r.registro_id, antes);
    }
  }

  const base = `/admin/empleados/${empleado.id}/marcaciones`;
  // Primero los locales donde trabaja.
  const opcionesLocal = [...locales].sort((a, b) => Number(asignados.has(b.id)) - Number(asignados.has(a.id)));

  return (
    <>
      <Link href={`/admin/empleados/${empleado.id}`} className="text-sm text-brand hover:underline">
        ← Volver a {empleado.nombre_completo}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Marcaciones de {empleado.nombre_completo}</h1>
        <p className="text-sm text-slate-600 first-letter:uppercase">
          {formatearFecha(fecha)}
          {fecha === hoy && " (hoy)"}
        </p>
      </div>

      <div className={`${claseTarjeta} flex flex-wrap items-end gap-3`}>
        <Form action={base} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Día
            <input type="date" name="fecha" defaultValue={fecha} max={hoy} required className={claseInput} />
          </label>
          <button type="submit" className={claseBotonPrimario}>
            Ver
          </button>
        </Form>
        <Link href={`${base}?fecha=${sumarDias(fecha, -1)}`} className={claseBotonSecundario}>
          ← Día anterior
        </Link>
        {fecha < hoy && (
          <Link href={`${base}?fecha=${sumarDias(fecha, 1)}`} className={claseBotonSecundario}>
            Día siguiente →
          </Link>
        )}
      </div>

      <section className={claseTarjeta}>
        <h2 className="mb-1 font-semibold text-slate-900">Marcaciones</h2>
        <p className="mb-3 text-xs text-slate-500">
          No se borran: si una está mal, anulala o corregí su hora. Todo queda registrado con el motivo.
        </p>
        {marcaciones.length === 0 ? (
          <p className="text-sm text-slate-600">No hay marcaciones este día.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {marcaciones.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${m.anulada ? "text-slate-400 line-through" : "text-slate-900"}`}>
                    {m.tipo === "entrada" ? "Entrada" : "Salida"} {formatearHora(m.registrada_en)} ·{" "}
                    {nombreLocal.get(m.local_id) ?? "Local"}
                  </span>
                  {m.anulada && <Etiqueta clase="bg-red-50 text-red-700">Anulada</Etiqueta>}
                  {m.origen === "admin" && <Etiqueta clase="bg-sky-50 text-sky-700">Cargada a mano</Etiqueta>}
                  {horaOriginal.has(String(m.id)) && (
                    <Etiqueta clase="bg-amber-50 text-amber-800">
                      Hora corregida (original {formatearHora(horaOriginal.get(String(m.id))!)})
                    </Etiqueta>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {m.origen === "qr_gps"
                    ? `Marcada con QR${m.distancia_metros != null ? ` a ${Math.round(m.distancia_metros)} m del local` : ""}`
                    : "Cargada por un administrador"}
                  {m.nota && ` · Motivo: ${m.nota}`}
                </p>
                {!m.anulada && (
                  <div className="flex flex-wrap gap-2">
                    <Desplegable titulo="Corregir hora">
                      <FormularioAccion accion={corregirHoraMarcacion.bind(null, m.id)} textoBoton="Guardar hora">
                        <CamposFechaHora fecha={fechaLocal(new Date(m.registrada_en)).fecha} hora={formatearHora(m.registrada_en)} max={hoy} />
                        <CampoMotivo />
                      </FormularioAccion>
                    </Desplegable>
                    <Desplegable titulo="Anular">
                      <FormularioAccion accion={anularMarcacion.bind(null, m.id)} textoBoton="Anular marcación">
                        <CampoMotivo ejemplo="Ej.: prueba del sistema, marcó por error" />
                      </FormularioAccion>
                    </Desplegable>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-1 font-semibold text-slate-900">Agregar una marcación que faltó</h2>
        <p className="mb-4 text-xs text-slate-500">Por ejemplo, si se olvidó de marcar la salida.</p>
        <FormularioAccion accion={agregarMarcacion.bind(null, empleado.id)} textoBoton="Agregar marcación">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Tipo
              <select name="tipo" required defaultValue="salida" className={claseInput}>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Local
              <select name="local" required className={claseInput}>
                {opcionesLocal.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                    {!asignados.has(l.id) && " (no asignado)"}
                  </option>
                ))}
              </select>
            </label>
            <CamposFechaHora fecha={fecha} max={hoy} />
          </div>
          <CampoMotivo ejemplo="Ej.: se olvidó de marcar la salida" />
        </FormularioAccion>
      </section>

      <section className={claseTarjeta}>
        <h2 className="mb-3 font-semibold text-slate-900">Historial de correcciones</h2>
        {auditoria.length === 0 ? (
          <p className="text-sm text-slate-600">No se hicieron correcciones en las marcaciones de este día.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {auditoria.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 py-2">
                <span className="text-slate-900">{describirCambio(r)}</span>
                <span className="text-xs text-slate-500">
                  {formatearFechaHora(r.realizado_en)} · {r.realizado_por ? (nombreAutor.get(r.realizado_por) ?? "Administrador") : "Sistema"}
                  {r.motivo && ` · Motivo: ${r.motivo}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Etiqueta({ clase, children }: { clase: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>{children}</span>;
}

function Desplegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="w-full rounded-lg border border-slate-200 sm:w-auto sm:min-w-80 [&[open]]:bg-slate-50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand">{titulo}</summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

function CamposFechaHora({ fecha, hora, max }: { fecha: string; hora?: string; max: string }) {
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Día
        <input type="date" name="fecha" required defaultValue={fecha} max={max} className={claseInput} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Hora
        <input type="time" name="hora" required defaultValue={hora} className={claseInput} />
      </label>
    </>
  );
}

function CampoMotivo({ ejemplo }: { ejemplo?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
      Motivo (obligatorio)
      <input name="motivo" required minLength={5} maxLength={500} placeholder={ejemplo} className={claseInput} />
    </label>
  );
}
