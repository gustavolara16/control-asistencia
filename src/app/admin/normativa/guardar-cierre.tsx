"use client";

import { useState, useTransition } from "react";
import { guardarCierreMes } from "@/actions/normativa";
import { claseBotonSecundario } from "@/components/ui/estilos";

/** Guarda el cierre de un mes terminado, o lo vuelve a calcular y guardar. */
export function GuardarCierre({ mes, yaGuardado }: { mes: string; yaGuardado: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok?: string; error?: string }>({});

  const guardar = () => {
    if (
      yaGuardado &&
      !confirm("Se va a recalcular el mes con las marcaciones y los horarios de hoy, y reemplaza lo guardado. ¿Seguir?")
    ) {
      return;
    }
    iniciar(async () => setMensaje(await guardarCierreMes(mes)));
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={guardar} disabled={ocupado} className={`${claseBotonSecundario} h-9`}>
        {ocupado ? "Guardando…" : yaGuardado ? "Volver a calcular y guardar" : "Guardar el cierre de este mes"}
      </button>
      {mensaje.error && <span className="text-xs text-red-700">{mensaje.error}</span>}
    </span>
  );
}
