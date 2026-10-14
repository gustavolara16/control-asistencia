"use client";

import { useActionState, type ReactNode } from "react";
import { estadoInicial, type EstadoFormulario } from "@/lib/formularios";
import { BotonEnviar, MensajeFormulario } from "./formulario";

// Formulario simple: campos + mensaje de resultado + botón de guardar.
// Después de guardar, React vuelve los campos a sus valores iniciales.
export function FormularioAccion({
  accion,
  textoBoton,
  children,
}: {
  accion: (prev: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  textoBoton: string;
  children: ReactNode;
}) {
  const [estado, formAction] = useActionState(accion, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      <MensajeFormulario estado={estado} />
      <BotonEnviar>{textoBoton}</BotonEnviar>
    </form>
  );
}
