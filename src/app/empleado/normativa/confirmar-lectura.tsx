"use client";

import { useState, useTransition } from "react";
import { confirmarLecturaNormativa } from "@/actions/normativa";
import { claseBotonPrimario } from "@/components/ui/estilos";

export function ConfirmarLectura() {
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            setError((await confirmarLecturaNormativa()).error);
          })
        }
        className={claseBotonPrimario}
      >
        {ocupado ? "Registrando…" : "Leí y entendí la normativa"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
