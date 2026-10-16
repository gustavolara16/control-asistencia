import { historialPorDias } from "@/lib/asistencia";
import { cargarDatosAsistencia } from "@/lib/asistencia-datos";
import { fechaLocal, sumarDias } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import { HistorialDias } from "./historial-dias";

/**
 * Historial de los últimos `dias` días de un empleado. Quien lo use debe haber
 * verificado la sesión; además, las políticas RLS impiden que un empleado vea
 * datos de otro.
 */
export async function HistorialAsistencia({
  perfilId,
  dias,
  hrefCorregir,
}: {
  perfilId: string;
  dias: number;
  hrefCorregir?: string;
}) {
  const ahora = new Date();
  const hasta = fechaLocal(ahora).fecha;
  const desde = sumarDias(hasta, -(dias - 1));

  const supabase = await createClient();
  const { turnos, marcaciones, tolerancias, altas, nombreLocal } = await cargarDatosAsistencia(supabase, {
    desde,
    hasta,
    perfilId,
  });
  const historial = historialPorDias({ desde, hasta, ahora, turnos, marcaciones, tolerancias, altas });

  return <HistorialDias dias={historial} nombreLocal={nombreLocal} hrefCorregir={hrefCorregir} />;
}
