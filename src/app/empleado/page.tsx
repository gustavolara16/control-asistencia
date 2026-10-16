import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePerfil } from "@/lib/auth";
import { esEntradaAbierta } from "@/lib/marcaciones";
import Link from "next/link";
import { fechaLocal, formatearFechaHora, formatearHora, horaCorta, NOMBRES_DIAS } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import type { HorarioRow, LocalRow, MarcacionRow } from "@/types/db";

export const metadata: Metadata = {
  title: "Mi asistencia",
};

export default function EmpleadoPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <InicioEmpleado />
    </Suspense>
  );
}

async function InicioEmpleado() {
  const perfil = await requirePerfil();
  const supabase = await createClient();
  const { diaSemana } = fechaLocal(new Date());

  // Las políticas RLS garantizan que solo vuelvan los datos de este empleado.
  const [localesRes, horariosRes, marcacionesRes] = await Promise.all([
    supabase.from("empleado_locales").select("locales(id, nombre)").eq("perfil_id", perfil.id),
    supabase
      .from("horarios")
      .select("id, local_id, hora_entrada, hora_salida")
      .eq("perfil_id", perfil.id)
      .eq("dia_semana", diaSemana)
      .order("hora_entrada"),
    supabase
      .from("marcaciones")
      .select("id, local_id, tipo, registrada_en, anulada")
      .eq("perfil_id", perfil.id)
      .order("registrada_en", { ascending: false })
      .limit(5),
  ]);

  if (localesRes.error || horariosRes.error || marcacionesRes.error) {
    throw new Error("No se pudieron cargar tus datos.");
  }

  // empleado_locales → locales es una relación "muchos a uno": llega un objeto,
  // no una lista. Un local desactivado no es visible para el empleado y llega como null.
  const locales = (localesRes.data as unknown as { locales: Pick<LocalRow, "id" | "nombre"> | null }[])
    .flatMap((fila) => (fila.locales ? [fila.locales] : []))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const horarios = horariosRes.data as Pick<HorarioRow, "id" | "local_id" | "hora_entrada" | "hora_salida">[];
  const marcaciones = marcacionesRes.data as Pick<
    MarcacionRow,
    "id" | "local_id" | "tipo" | "registrada_en" | "anulada"
  >[];
  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));
  const ultima = marcaciones.find((m) => !m.anulada);
  const entradaAbierta = esEntradaAbierta(ultima);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hola, {perfil.nombreCompleto}</h1>
        <p className="text-sm text-slate-600">
          {locales.length > 0
            ? `Trabajás en: ${locales.map((l) => l.nombre).join(", ")}`
            : "Todavía no tenés un local asignado."}
        </p>
      </div>

      {entradaAbierta && ultima && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Estás trabajando desde las {formatearHora(ultima.registrada_en)} en{" "}
          {nombreLocal.get(ultima.local_id) ?? "tu local"}.
        </p>
      )}

      <Link
        href="/marcar"
        className="flex h-16 flex-col items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        {entradaAbierta ? "Marcar salida" : "Marcar entrada"}
        <span className="text-xs font-normal">Escaneá el QR del local</span>
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Tu horario de hoy ({NOMBRES_DIAS[diaSemana]})</h2>
        {horarios.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Hoy no tenés turnos asignados.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
            {horarios.map((h) => (
              <li key={h.id}>
                {horaCorta(h.hora_entrada)} a {horaCorta(h.hora_salida)} · {nombreLocal.get(h.local_id) ?? "Local"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Últimas marcaciones</h2>
        {marcaciones.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Todavía no registraste marcaciones.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-slate-100 text-sm">
            {marcaciones.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2">
                <span className={m.anulada ? "text-slate-400 line-through" : "text-slate-700"}>
                  {m.tipo === "entrada" ? "Entrada" : "Salida"} · {nombreLocal.get(m.local_id) ?? "Local"}
                </span>
                <span className="tabular-nums text-slate-600">{formatearFechaHora(m.registrada_en)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
