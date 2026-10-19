import { fechaLocal } from "@/lib/fechas";
import { nombreDelMes, proximaSancion, sancionPorTardanzas } from "@/lib/normativa";
import { tardanzasDelMes } from "@/lib/normativa-datos";
import { createClient } from "@/lib/supabase/server";

const fechaCorta = (fecha: string) => fecha.slice(5).split("-").reverse().join("/");

/** Aviso al empleado con sus llegadas tarde del mes y lo que marca la escala del Art. 32. */
export async function TardanzasDelMesEmpleado({ perfilId, siempre = false }: { perfilId: string; siempre?: boolean }) {
  const ahora = new Date();
  const mes = fechaLocal(ahora).fecha.slice(0, 7);
  const supabase = await createClient();
  const tardanzas = (await tardanzasDelMes(supabase, { mes, perfilId, ahora })).get(perfilId) ?? [];
  const cantidad = tardanzas.length;

  if (cantidad === 0) {
    return siempre ? (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        En {nombreDelMes(mes)} no tenés llegadas tarde. ¡Bien!
      </p>
    ) : null;
  }

  const sancion = sancionPorTardanzas(cantidad);
  const proxima = proximaSancion(cantidad);
  return (
    <div
      role="status"
      className={`rounded-2xl border p-4 text-sm ${sancion ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
    >
      <p className="font-semibold">
        En {nombreDelMes(mes)} llevás {cantidad} llegada{cantidad > 1 ? "s" : ""} tarde
      </p>
      <p className="mt-1">{tardanzas.map((t) => `${fechaCorta(t.fecha)} (${t.minutosTarde} min)`).join(" · ")}</p>
      {sancion && (
        <p className="mt-2">
          Según la escala del Art. 32 corresponde: <strong>{sancion}</strong>.
        </p>
      )}
      {proxima && (
        <p className="mt-2">
          Con {proxima.desde} llegadas tarde en el mes corresponde: {proxima.sancion.toLowerCase()}.
        </p>
      )}
      <p className="mt-2 text-xs opacity-80">Si alguna tuvo una justificación, hablalo con tu encargado.</p>
    </div>
  );
}
