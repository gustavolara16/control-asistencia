import { parsearNormativa } from "@/lib/normativa";

/** Muestra el texto de la normativa con títulos, artículos resaltados y tablas. */
export function TextoNormativa({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-800">
      {parsearNormativa(texto).map((bloque, i) => {
        if (bloque.tipo === "titulo") {
          return (
            <h3 key={i} className="mt-2 text-base font-semibold text-brand first:mt-0">
              {bloque.texto}
            </h3>
          );
        }
        if (bloque.tipo === "tabla") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {bloque.encabezado.map((celda, j) => (
                      <th key={j} className="border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold">
                        {celda}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bloque.filas.map((fila, j) => (
                    <tr key={j}>
                      {fila.map((celda, k) => (
                        <td key={k} className="border border-slate-300 px-3 py-1.5">
                          {celda}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i}>
            {bloque.destacado && <strong className="font-semibold text-slate-900">{bloque.destacado} </strong>}
            {bloque.texto}
          </p>
        );
      })}
    </div>
  );
}
