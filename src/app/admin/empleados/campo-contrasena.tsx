"use client";

import { useState } from "react";
import { claseInput } from "@/components/ui/estilos";
import { LARGO_MINIMO_CONTRASENA } from "@/lib/usuarios";

// Campo de contraseña con opción de mostrarla (para poder pasársela al empleado).
export function CampoContrasena({ etiqueta }: { etiqueta: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
      {etiqueta}
      <div className="flex gap-2">
        <input
          name="contrasena"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={LARGO_MINIMO_CONTRASENA}
          maxLength={72}
          required
          className={claseInput}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <span className="text-xs font-normal text-slate-500">
        Mínimo {LARGO_MINIMO_CONTRASENA} caracteres. Anotala para pasársela al empleado.
      </span>
    </label>
  );
}
