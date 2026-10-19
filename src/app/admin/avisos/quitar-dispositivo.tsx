"use client";

import { useTransition } from "react";
import { quitarSuscripcion } from "@/actions/avisos";

/** Deja de mandar avisos a un dispositivo (por ejemplo, un celular que ya no usás). */
export function QuitarDispositivo({ id }: { id: number }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => iniciar(async () => void (await quitarSuscripcion({ id })))}
      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
    >
      {ocupado ? "Quitando…" : "Quitar"}
    </button>
  );
}
