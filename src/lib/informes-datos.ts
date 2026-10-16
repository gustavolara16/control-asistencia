import "server-only";
import { minutosTrabajados } from "@/lib/asistencia";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import { fechaLocal, formatearHora, NOMBRES_DIAS, diaSemanaDe } from "@/lib/fechas";
import {
  asistenciaDelPeriodo,
  horasDecimales,
  resumirPorEmpleado,
  TEXTO_ESTADO_ASISTENCIA,
  type FilaPeriodo,
} from "@/lib/informes";
import type { createClient } from "@/lib/supabase/server";
import type { PerfilRow } from "@/types/db";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Datos de un informe. Solo para administradores: quien lo llame debe haber
 * verificado el rol (además, las políticas RLS no le dan a un empleado datos ajenos).
 */
export async function cargarInforme(
  supabase: Cliente,
  { desde, hasta, localId, ahora }: { desde: string; hasta: string; localId: string | null; ahora: Date },
) {
  const [datos, perfilesRes] = await Promise.all([
    cargarDatosAsistencia(supabase, { desde, hasta }),
    supabase.from("perfiles").select("id, nombre_completo").eq("rol", "empleado"),
  ]);
  if (perfilesRes.error) throw new Error("No se pudo cargar el informe.");

  const nombres = new Map(
    (perfilesRes.data as Pick<PerfilRow, "id" | "nombre_completo">[]).map((p) => [p.id, p.nombre_completo]),
  );
  const porNombre = (a: { perfilId: string }, b: { perfilId: string }) =>
    nombres.get(a.perfilId)!.localeCompare(nombres.get(b.perfilId)!);

  const filas = asistenciaDelPeriodo({ desde, hasta, ahora, ...datos }).filter(
    (f) => nombres.has(f.perfilId) && (!localId || f.localId === localId),
  );
  return {
    filas: [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || porNombre(a, b)),
    resumenes: resumirPorEmpleado(filas).sort(porNombre),
    nombres,
    locales: datos.locales,
    nombreLocal: datos.nombreLocal,
  };
}

type Informe = Awaited<ReturnType<typeof cargarInforme>>;

export function planillaResumen({ resumenes, nombres }: Informe) {
  return [
    [
      "Empleado",
      "Días trabajados",
      "Horas trabajadas",
      "Horas según horario",
      "Diferencia (horas)",
      "Turnos",
      "Llegadas tarde",
      "Minutos tarde (total)",
      "Ausencias",
      "Salidas antes de hora",
      "Sin marcar salida",
      "Marcó fuera de horario",
    ],
    ...resumenes.map((r) => [
      nombres.get(r.perfilId),
      r.diasTrabajados,
      horasDecimales(r.minutosTrabajados),
      horasDecimales(r.minutosProgramados),
      horasDecimales(r.minutosTrabajados - r.minutosProgramados),
      r.turnos,
      r.llegadasTarde,
      r.minutosTarde,
      r.ausencias,
      r.salidasAnticipadas,
      r.sinSalida,
      r.fueraDeHorario,
    ]),
  ];
}

/** Hora "HH:MM", con "(+1)" si es del día siguiente al de la fila. */
function horaDeFila(iso: string, fecha: string): string {
  return fechaLocal(new Date(iso)).fecha === fecha ? formatearHora(iso) : `${formatearHora(iso)} (+1)`;
}

export function planillaDetalle({ filas, nombres, nombreLocal }: Informe) {
  return [
    [
      "Fecha",
      "Día",
      "Empleado",
      "Local",
      "Turno",
      "Entrada",
      "Salida",
      "Horas trabajadas",
      "Estado",
      "Minutos tarde",
      "Minutos antes de hora",
      "Detalle",
    ],
    ...filas.map((f: FilaPeriodo) => {
      const primero = f.tramos[0];
      const ultimo = f.tramos[f.tramos.length - 1];
      const notas = [
        f.tramos.length > 1 &&
          `Tramos: ${f.tramos.map((t) => `${horaDeFila(t.entrada, f.fecha)}-${t.salida ? horaDeFila(t.salida, f.fecha) : "?"}`).join(", ")}`,
        f.tramos.some((t) => t.situacion === "abierto") && "Trabajando al generar el informe",
        f.tramos.some((t) => t.situacion === "sin_salida") && "No marcó la salida",
      ].filter(Boolean);
      return [
        f.fecha.split("-").reverse().join("/"),
        NOMBRES_DIAS[diaSemanaDe(f.fecha)],
        nombres.get(f.perfilId),
        nombreLocal.get(f.localId) ?? "",
        f.turno ? `${f.turno.entrada}-${f.turno.salida}` : "",
        primero ? horaDeFila(primero.entrada, f.fecha) : "",
        ultimo?.salida ? horaDeFila(ultimo.salida, f.fecha) : "",
        horasDecimales(minutosTrabajados(f.tramos)),
        TEXTO_ESTADO_ASISTENCIA[f.estado],
        f.minutosTarde || "",
        f.minutosAntes || "",
        notas.join(". "),
      ];
    }),
  ];
}
