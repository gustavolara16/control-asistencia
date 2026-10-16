import Link from "next/link";
import { minutosTrabajados, type DiaHistorial } from "@/lib/asistencia";
import { formatearDuracion, formatearFecha } from "@/lib/fechas";
import { DetalleAsistencia, EtiquetasAsistencia } from "./fila-asistencia";

/** Historial de asistencia de un empleado, agrupado por día. */
export function HistorialDias({
  dias,
  nombreLocal,
  hrefCorregir,
}: {
  dias: DiaHistorial[];
  nombreLocal: Map<string, string>;
  /** Solo para el administrador: dirección de corrección, a la que se le agrega la fecha. */
  hrefCorregir?: string;
}) {
  if (dias.length === 0) {
    return <p className="text-sm text-slate-600">No hay turnos ni marcaciones en estos días.</p>;
  }
  const total = dias.reduce((suma, d) => suma + d.filas.reduce((s, f) => s + minutosTrabajados(f.tramos), 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Total trabajado: <strong className="text-slate-900 tabular-nums">{formatearDuracion(total)}</strong>
      </p>
      <ul className="flex flex-col divide-y divide-slate-100">
        {dias.map((dia) => (
          <li key={dia.fecha} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 first-letter:uppercase">{formatearFecha(dia.fecha)}</h3>
              {hrefCorregir && (
                <Link href={`${hrefCorregir}${dia.fecha}`} className="text-xs font-medium text-brand hover:underline">
                  Ver o corregir
                </Link>
              )}
            </div>
            {dia.filas.map((fila, i) => (
              <div key={i} className="flex flex-col gap-1">
                <EtiquetasAsistencia fila={fila} />
                <DetalleAsistencia fila={fila} nombreLocal={nombreLocal} />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
