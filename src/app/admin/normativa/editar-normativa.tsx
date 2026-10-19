"use client";

import { useActionState } from "react";
import { guardarNormativa } from "@/actions/normativa";
import { BotonEnviar, MensajeFormulario } from "@/components/ui/formulario";
import { estadoInicial } from "@/lib/formularios";

export function EditarNormativa({ texto }: { texto: string }) {
  const [estado, accion] = useActionState(guardarNormativa, estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <p className="text-xs text-slate-600">
        Formato: una línea que empieza con <code>##</code> es un título; cada línea es un párrafo y, si empieza con
        «Artículo N. (Nombre)», eso aparece en negrita; las tablas se escriben con barras:{" "}
        <code>| 2 | Llamado de atención |</code>. Al guardar, todos los empleados ven el aviso para volver a leerla.
      </p>
      <textarea
        name="texto"
        defaultValue={texto}
        required
        maxLength={60000}
        rows={18}
        className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      <MensajeFormulario estado={estado} />
      <div>
        <BotonEnviar enviando="Publicando…">Publicar normativa</BotonEnviar>
      </div>
    </form>
  );
}
