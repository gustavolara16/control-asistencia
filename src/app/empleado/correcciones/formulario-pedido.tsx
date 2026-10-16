"use client";

import { useActionState, useState } from "react";
import { pedirCorreccion } from "@/actions/solicitudes";
import { claseInput } from "@/components/ui/estilos";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/ui/formulario";
import { estadoInicial } from "@/lib/formularios";

type Opcion = { id: string; texto: string };

export function FormularioPedido({
  marcaciones,
  locales,
  hoy,
}: {
  /** Marcaciones propias recientes (id como texto, para el select). */
  marcaciones: (Opcion & { fecha: string; hora: string })[];
  locales: Opcion[];
  hoy: string;
}) {
  const [estado, accion] = useActionState(pedirCorreccion, estadoInicial);
  const [clase, setClase] = useState<"falta" | "hora">("falta");
  const [marcacionId, setMarcacionId] = useState(marcaciones[0]?.id ?? "");
  const elegida = marcaciones.find((m) => m.id === marcacionId);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">¿Qué pasó?</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="clase" value="falta" checked={clase === "falta"} onChange={() => setClase("falta")} />
          Me olvidé de marcar (o no pude)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="clase"
            value="hora"
            checked={clase === "hora"}
            onChange={() => setClase("hora")}
            disabled={marcaciones.length === 0}
          />
          Una marcación tiene la hora mal
        </label>
      </fieldset>

      {clase === "falta" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Me faltó marcar la">
            <select name="tipo" required defaultValue="salida" className={claseInput}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </Campo>
          <Campo etiqueta="Local">
            <select name="local" required className={claseInput}>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.texto}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Día">
            <input type="date" name="fecha" required defaultValue={hoy} max={hoy} className={claseInput} />
          </Campo>
          <Campo etiqueta="Hora real">
            <input type="time" name="hora" required className={claseInput} />
          </Campo>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo etiqueta="Marcación">
              <select
                name="marcacion"
                required
                value={marcacionId}
                onChange={(e) => setMarcacionId(e.target.value)}
                className={claseInput}
              >
                {marcaciones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {/* La clave reinicia los campos al elegir otra marcación. */}
          <Campo etiqueta="Día correcto" key={`f${marcacionId}`}>
            <input type="date" name="fecha" required defaultValue={elegida?.fecha} max={hoy} className={claseInput} />
          </Campo>
          <Campo etiqueta="Hora correcta" key={`h${marcacionId}`}>
            <input type="time" name="hora" required defaultValue={elegida?.hora} className={claseInput} />
          </Campo>
        </div>
      )}

      <Campo etiqueta="Contá qué pasó" ayuda="Lo va a leer el administrador.">
        <textarea
          name="motivo"
          required
          minLength={5}
          maxLength={500}
          rows={3}
          placeholder="Ej.: me quedé sin batería y salí a las 18:00"
          className={`${claseInput} h-auto py-2`}
        />
      </Campo>

      <MensajeFormulario estado={estado} />
      <BotonEnviar enviando="Enviando…">Enviar pedido</BotonEnviar>
    </form>
  );
}
