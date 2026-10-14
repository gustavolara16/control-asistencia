"use client";

import { useActionState } from "react";
import { crearEmpleado } from "@/actions/empleados";
import { claseInput } from "@/components/ui/estilos";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/ui/formulario";
import { estadoInicial } from "@/lib/formularios";
import type { LocalRow } from "@/types/db";
import { CampoContrasena } from "../campo-contrasena";
import { SelectorLocales } from "../selector-locales";

export function NuevoEmpleadoForm({ locales }: { locales: Pick<LocalRow, "id" | "nombre" | "activo">[] }) {
  const [estado, formAction] = useActionState(crearEmpleado, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo etiqueta="Nombre y apellido">
        <input name="nombre_completo" required maxLength={120} autoComplete="off" className={claseInput} />
      </Campo>

      <Campo
        etiqueta="Usuario"
        ayuda="Con esto ingresa a la app. Solo minúsculas, números, punto, guion o guion bajo. Ejemplo: juan.perez"
      >
        <input
          name="usuario"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9._\-]{3,30}"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className={`${claseInput} font-mono`}
        />
      </Campo>

      <CampoContrasena etiqueta="Contraseña inicial" />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Locales donde trabaja</span>
        <SelectorLocales locales={locales} />
      </div>

      <MensajeFormulario estado={estado} />
      <BotonEnviar enviando="Creando…">Crear empleado</BotonEnviar>
    </form>
  );
}
