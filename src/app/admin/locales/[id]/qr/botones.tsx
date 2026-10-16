"use client";

import { useFormStatus } from "react-dom";
import { claseBotonPeligro, claseBotonPrimario } from "@/components/ui/estilos";

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={claseBotonPrimario}>
      Imprimir
    </button>
  );
}

export function BotonRegenerar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("¿Generar un código nuevo? El QR impreso actual dejará de funcionar.")) e.preventDefault();
      }}
      className={`${claseBotonPeligro} self-start`}
    >
      {pending ? "Generando…" : "Generar código nuevo"}
    </button>
  );
}
