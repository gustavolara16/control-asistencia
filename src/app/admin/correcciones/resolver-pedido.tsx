"use client";

import { useActionState } from "react";
import { resolverSolicitud } from "@/actions/solicitudes";
import { claseBotonPeligro, claseInput } from "@/components/ui/estilos";
import { BotonEnviar, MensajeFormulario } from "@/components/ui/formulario";
import { estadoInicial } from "@/lib/formularios";

/** Aprobar o rechazar un pedido. Cada decisión es un formulario aparte. */
export function ResolverPedido({ solicitudId }: { solicitudId: number }) {
  const [estadoAprobar, aprobar] = useActionState(resolverSolicitud.bind(null, solicitudId, true), estadoInicial);
  const [estadoRechazar, rechazar] = useActionState(resolverSolicitud.bind(null, solicitudId, false), estadoInicial);

  return (
    <div className="flex flex-col gap-2">
      <form action={aprobar} className="flex flex-col gap-2">
        <MensajeFormulario estado={estadoAprobar} />
        <BotonEnviar enviando="Aplicando…">Aprobar y corregir</BotonEnviar>
      </form>
      <details className="rounded-lg border border-slate-200 [&[open]]:bg-slate-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-red-700">Rechazar</summary>
        <form action={rechazar} className="flex flex-col gap-2 px-3 pb-3">
          <input
            name="respuesta"
            required
            minLength={3}
            maxLength={500}
            placeholder="Motivo del rechazo (lo va a ver el empleado)"
            className={claseInput}
          />
          <MensajeFormulario estado={estadoRechazar} />
          <BotonEnviar className={claseBotonPeligro}>Rechazar pedido</BotonEnviar>
        </form>
      </details>
    </div>
  );
}
