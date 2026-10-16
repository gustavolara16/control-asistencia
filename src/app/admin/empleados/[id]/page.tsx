import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  actualizarNombreEmpleado,
  cambiarEstadoEmpleado,
  guardarLocalesEmpleado,
  restablecerContrasena,
} from "@/actions/empleados";
import { HistorialAsistencia } from "@/components/asistencia/historial-asistencia";
import {
  claseBotonPeligro,
  claseBotonPrimario,
  claseBotonSecundario,
  claseInput,
  claseTarjeta,
} from "@/components/ui/estilos";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { FormularioAccion } from "@/components/ui/formulario-accion";
import { requireAdmin } from "@/lib/auth";
import { horaCorta } from "@/lib/fechas";
import { esUuid } from "@/lib/formularios";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { HorarioRow, LocalRow, PerfilRow } from "@/types/db";
import { AvisoClaveSecreta } from "../aviso-clave-secreta";
import { CampoContrasena } from "../campo-contrasena";
import { SelectorLocales } from "../selector-locales";
import { HorarioEditor } from "./horario-editor";

export const metadata: Metadata = {
  title: "Empleado",
};

export default function EmpleadoPage({ params }: PageProps<"/admin/empleados/[id]">) {
  return (
    <>
      <Link href="/admin/empleados" className="text-sm text-brand hover:underline">
        ← Volver a empleados
      </Link>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        {params.then(({ id }) => (
          <DetalleEmpleado id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function DetalleEmpleado({ id }: { id: string }) {
  await requireAdmin();
  if (!esUuid(id)) notFound();

  const supabase = await createClient();
  const [perfilRes, localesRes, asignadosRes, horariosRes] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre_completo, usuario, activo")
      .eq("id", id)
      .eq("rol", "empleado")
      .maybeSingle(),
    supabase.from("locales").select("id, nombre, activo").order("nombre"),
    supabase.from("empleado_locales").select("local_id").eq("perfil_id", id),
    supabase
      .from("horarios")
      .select("local_id, dia_semana, hora_entrada, hora_salida")
      .eq("perfil_id", id)
      .order("dia_semana")
      .order("hora_entrada"),
  ]);
  if (perfilRes.error || localesRes.error || asignadosRes.error || horariosRes.error) {
    throw new Error("No se pudieron cargar los datos del empleado.");
  }
  if (!perfilRes.data) notFound();

  const empleado = perfilRes.data as Pick<PerfilRow, "id" | "nombre_completo" | "usuario" | "activo">;
  const todosLosLocales = localesRes.data as Pick<LocalRow, "id" | "nombre" | "activo">[];
  const asignados = (asignadosRes.data as { local_id: string }[]).map((a) => a.local_id);
  const horarios = horariosRes.data as Pick<HorarioRow, "local_id" | "dia_semana" | "hora_entrada" | "hora_salida">[];

  // Para elegir: los locales activos y los inactivos que ya tenía asignados.
  const localesElegibles = todosLosLocales.filter((l) => l.activo || asignados.includes(l.id));
  const localesAsignados = todosLosLocales.filter((l) => asignados.includes(l.id));
  const puedeAdministrarCuenta = isAdminClientConfigured();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{empleado.nombre_completo}</h1>
        <EtiquetaEstado activo={empleado.activo} />
      </div>
      <p className="-mt-4 text-sm text-slate-600">
        Usuario para ingresar: <span className="font-mono font-medium text-slate-900">{empleado.usuario ?? "—"}</span>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={claseTarjeta}>
          <h2 className="mb-4 font-semibold text-slate-900">Datos</h2>
          <FormularioAccion accion={actualizarNombreEmpleado.bind(null, empleado.id)} textoBoton="Guardar nombre">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Nombre y apellido
              <input
                name="nombre_completo"
                required
                maxLength={120}
                defaultValue={empleado.nombre_completo}
                className={claseInput}
              />
            </label>
          </FormularioAccion>
        </section>

        <section className={claseTarjeta}>
          <h2 className="mb-1 font-semibold text-slate-900">Locales donde trabaja</h2>
          <p className="mb-4 text-xs text-slate-500">Si quitás un local, también se borran sus turnos en ese local.</p>
          <FormularioAccion accion={guardarLocalesEmpleado.bind(null, empleado.id)} textoBoton="Guardar locales">
            <SelectorLocales locales={localesElegibles} seleccionados={asignados} />
          </FormularioAccion>
        </section>
      </div>

      <section className={claseTarjeta}>
        <h2 className="mb-1 font-semibold text-slate-900">Horario semanal</h2>
        <p className="mb-2 text-xs text-slate-500">
          Los días sin turnos son de descanso. Podés cargar más de un turno por día (turno cortado).
        </p>
        <HorarioEditor
          // Al guardar se recarga la página: la clave reinicia el editor con los datos nuevos.
          key={[...asignados, ...horarios.map((h) => `${h.dia_semana}${h.hora_entrada}${h.hora_salida}${h.local_id}`)].join("|")}
          perfilId={empleado.id}
          locales={localesAsignados.map(({ id, nombre }) => ({ id, nombre }))}
          turnosIniciales={horarios.map((h) => ({
            localId: h.local_id,
            diaSemana: h.dia_semana,
            entrada: horaCorta(h.hora_entrada),
            salida: horaCorta(h.hora_salida),
          }))}
        />
      </section>

      <section className={claseTarjeta}>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Asistencia de los últimos 14 días</h2>
            <p className="text-xs text-slate-500">Se compara con el horario semanal actual.</p>
          </div>
          <Link href={`/admin/empleados/${empleado.id}/marcaciones`} className={claseBotonSecundario}>
            Corregir marcaciones
          </Link>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
          <HistorialAsistencia
            perfilId={empleado.id}
            dias={14}
            hrefCorregir={`/admin/empleados/${empleado.id}/marcaciones?fecha=`}
          />
        </Suspense>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={claseTarjeta}>
          <h2 className="mb-4 font-semibold text-slate-900">Cambiar contraseña</h2>
          {puedeAdministrarCuenta ? (
            <FormularioAccion accion={restablecerContrasena.bind(null, empleado.id)} textoBoton="Cambiar contraseña">
              <CampoContrasena etiqueta="Nueva contraseña" />
            </FormularioAccion>
          ) : (
            <AvisoClaveSecreta />
          )}
        </section>

        <section className={`${claseTarjeta} flex flex-col gap-3`}>
          <h2 className="font-semibold text-slate-900">Estado de la cuenta</h2>
          <p className="text-sm text-slate-600">
            {empleado.activo
              ? "Si lo desactivás, no va a poder ingresar ni marcar. Su historial se conserva."
              : "La cuenta está desactivada: no puede ingresar ni marcar. Podés reactivarla cuando quieras."}
          </p>
          <form action={cambiarEstadoEmpleado.bind(null, empleado.id, !empleado.activo)}>
            <button type="submit" className={empleado.activo ? claseBotonPeligro : claseBotonPrimario}>
              {empleado.activo ? "Desactivar empleado" : "Reactivar empleado"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
