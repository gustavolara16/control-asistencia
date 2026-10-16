"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { marcar, type ResultadoMarcacion, type Ubicacion } from "@/actions/marcaciones";
import { claseBotonSecundario, claseTarjeta } from "@/components/ui/estilos";
import { formatearHora } from "@/lib/fechas";
import type { TipoMarcacion } from "@/types/db";

type EstadoUbicacion =
  | { estado: "buscando" }
  | { estado: "lista"; ubicacion: Ubicacion }
  | { estado: "error"; mensaje: string };

type Props = {
  codigoQr: string;
  nombre: string;
  tipoSugerido: TipoMarcacion;
  estado: string;
};

const TEXTO_TIPO: Record<TipoMarcacion, string> = { entrada: "ENTRADA", salida: "SALIDA" };

export function PanelMarcar({ codigoQr, nombre, tipoSugerido, estado }: Props) {
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>({ estado: "buscando" });
  const [resultado, setResultado] = useState<ResultadoMarcacion | null>(null);
  const [enviando, startTransition] = useTransition();
  const otroTipo: TipoMarcacion = tipoSugerido === "entrada" ? "salida" : "entrada";

  // Pide la ubicación al GPS; el estado se actualiza cuando responde.
  function solicitarUbicacion() {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() =>
        setUbicacion({ estado: "error", mensaje: "Este dispositivo no permite obtener la ubicación." }),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setUbicacion({
          estado: "lista",
          ubicacion: { latitud: coords.latitude, longitud: coords.longitude, precision: coords.accuracy },
        }),
      (error) =>
        setUbicacion({
          estado: "error",
          mensaje:
            error.code === error.PERMISSION_DENIED
              ? "No diste permiso de ubicación. Habilitalo en el navegador para poder marcar."
              : "No se pudo obtener tu ubicación. Revisá que el GPS esté activado.",
        }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  function reintentarUbicacion() {
    setUbicacion({ estado: "buscando" });
    solicitarUbicacion();
  }

  // La ubicación se pide al abrir la pantalla (el navegador solicita el permiso).
  useEffect(solicitarUbicacion, []);

  function enviar(tipo: TipoMarcacion) {
    startTransition(async () => {
      const coords = ubicacion.estado === "lista" ? ubicacion.ubicacion : null;
      setResultado(await marcar(codigoQr, tipo, coords));
    });
  }

  if (resultado?.ok) {
    return (
      <section className={`${claseTarjeta} flex flex-col items-center gap-3 text-center`}>
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">
          ✓
        </span>
        <h1 className="text-2xl font-semibold text-slate-900">
          {resultado.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"}
        </h1>
        <p className="text-4xl font-semibold tabular-nums text-slate-900">{formatearHora(resultado.registradaEn)}</p>
        <p className="text-slate-600">{resultado.local}</p>
        <Link href="/empleado" className={claseBotonSecundario}>
          Listo
        </Link>
      </section>
    );
  }

  return (
    <section className={`${claseTarjeta} flex flex-col gap-4`}>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Hola, {nombre}</h1>
        <p className="text-sm text-slate-600">{estado}</p>
      </div>

      <p
        className={`rounded-lg px-3 py-2 text-sm ${
          ubicacion.estado === "lista"
            ? "bg-emerald-50 text-emerald-800"
            : ubicacion.estado === "error"
              ? "bg-amber-50 text-amber-800"
              : "bg-slate-50 text-slate-600"
        }`}
      >
        {ubicacion.estado === "buscando" && "Obteniendo tu ubicación…"}
        {ubicacion.estado === "lista" && `Ubicación lista (precisión ± ${Math.round(ubicacion.ubicacion.precision)} m).`}
        {ubicacion.estado === "error" && (
          <>
            {ubicacion.mensaje}{" "}
            <button type="button" onClick={reintentarUbicacion} className="font-medium underline">
              Reintentar
            </button>
          </>
        )}
      </p>

      {resultado && !resultado.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resultado.error}
        </p>
      )}

      <button
        type="button"
        onClick={() => enviar(tipoSugerido)}
        disabled={enviando || ubicacion.estado === "buscando"}
        className={`h-20 rounded-2xl text-xl font-bold text-white transition-colors disabled:opacity-50 ${
          tipoSugerido === "entrada" ? "bg-brand hover:bg-brand-dark" : "bg-slate-800 hover:bg-slate-900"
        }`}
      >
        {enviando ? "Registrando…" : `Marcar ${TEXTO_TIPO[tipoSugerido]}`}
      </button>

      <button
        type="button"
        onClick={() => enviar(otroTipo)}
        disabled={enviando || ubicacion.estado === "buscando"}
        className="text-sm text-slate-500 underline disabled:opacity-50"
      >
        Marcar {otroTipo} en su lugar
      </button>
    </section>
  );
}
