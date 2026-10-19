"use client";

import { useActionState } from "react";
import { guardarPreferenciasAvisos } from "@/actions/avisos";
import { BotonEnviar, MensajeFormulario } from "@/components/ui/formulario";
import type { PreferenciasAvisos } from "@/lib/avisos";
import { estadoInicial } from "@/lib/formularios";

const OPCIONES_ENTRADAS = [
  { valor: "todas", texto: "Todas las entradas" },
  { valor: "tarde", texto: "Solo cuando alguien llega tarde" },
  { valor: "ninguna", texto: "Ninguna entrada" },
] as const;

export function FormularioPreferencias({
  preferencias,
  locales,
}: {
  preferencias: PreferenciasAvisos;
  locales: { id: string; nombre: string }[];
}) {
  const [estado, accion] = useActionState(guardarPreferenciasAvisos, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Entradas</legend>
        {OPCIONES_ENTRADAS.map((o) => (
          <label key={o.valor} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="entradas"
              value={o.valor}
              defaultChecked={preferencias.entradas === o.valor}
              className="size-4 accent-brand"
            />
            {o.texto}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Salidas</legend>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="salidas"
            value="si"
            defaultChecked={preferencias.salidas}
            className="size-4 accent-brand"
          />
          Avisarme también cuando salen
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Locales</legend>
        {locales.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hay locales.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {locales.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  name="local"
                  value={l.id}
                  defaultChecked={!preferencias.locales || preferencias.locales.includes(l.id)}
                  className="size-4 accent-brand"
                />
                {l.nombre}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <MensajeFormulario estado={estado} />
      <div>
        <BotonEnviar>Guardar preferencias</BotonEnviar>
      </div>
    </form>
  );
}
