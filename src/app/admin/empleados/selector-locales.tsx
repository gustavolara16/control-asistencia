import type { LocalRow } from "@/types/db";

// Casillas para elegir locales (name="locales"). Sirve en formularios cliente y servidor.
export function SelectorLocales({
  locales,
  seleccionados = [],
}: {
  locales: Pick<LocalRow, "id" | "nombre" | "activo">[];
  seleccionados?: string[];
}) {
  if (locales.length === 0) {
    return <p className="text-sm text-slate-600">Todavía no hay locales cargados.</p>;
  }
  return (
    <fieldset className="flex flex-col gap-2">
      {locales.map((local) => (
        <label key={local.id} className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="locales"
            value={local.id}
            defaultChecked={seleccionados.includes(local.id)}
            className="size-5 accent-brand"
          />
          {local.nombre}
          {!local.activo && <span className="text-xs text-slate-500">(inactivo)</span>}
        </label>
      ))}
    </fieldset>
  );
}
