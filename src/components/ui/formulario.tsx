"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoFormulario } from "@/lib/formularios";
import { claseBotonPrimario } from "./estilos";

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
      {etiqueta}
      {children}
      {ayuda && <span className="text-xs font-normal text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function BotonEnviar({
  children,
  enviando = "Guardando…",
  className = claseBotonPrimario,
  nombre,
  valor,
}: {
  children: ReactNode;
  enviando?: string;
  className?: string;
  /** name/value del botón: viajan con el formulario (útil con varios botones). */
  nombre?: string;
  valor?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={nombre} value={valor} disabled={pending} className={className}>
      {pending ? enviando : children}
    </button>
  );
}

export function MensajeFormulario({ estado }: { estado: EstadoFormulario }) {
  if (estado.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {estado.error}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {estado.ok}
      </p>
    );
  }
  return null;
}
