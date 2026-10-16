"use client";

import { useActionState } from "react";
import { resolverSolicitud } from "@/actions/solicitudes";
import { claseBotonPeligro, claseBotonPrimario, claseInput } from "@/components/ui/estilos";
import { BotonEnviar, MensajeFormulario } from "@/components/ui/formulario";
import { estadoInicial } from "@/lib/formularios";

/** Aprobar o rechazar un pedido. El botón que se toca envía la decisión. */
export function ResolverPedido({ solicitudId }: { solicitudId: number }) {
  const [estado, accion] = useActionState(resolverSolicitud.bind(null, solicitudId), estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-2">
      <input
        name="respuesta"
        maxLength={500}
        placeholder="Respuesta para el empleado (obligatoria si rechazás)"
        className={claseInput}
      />
      <MensajeFormulario estado={estado} />
      <div className="flex flex-wrap gap-2">
        <BotonDecision valor="aprobar" clase={claseBotonPrimario}>
          Aprobar y corregir
        </BotonDecision>
        <BotonDecision valor="rechazar" clase={claseBotonPeligro}>
          Rechazar
        </BotonDecision>
      </div>
    </form>
  );
}

function BotonDecision({ valor, clase, children }: { valor: string; clase: string; children: string }) {
  // name/value del botón viajan en el formulario e indican la decisión.
  return (
    <BotonEnviar className={clase} enviando="Guardando…" nombre="decision" valor={valor}>
      {children}
    </BotonEnviar>
  );
}
