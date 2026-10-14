"use client";

import { useActionState, useRef, useState } from "react";
import { estadoInicial, type EstadoFormulario } from "@/lib/formularios";
import { claseBotonSecundario, claseInput } from "@/components/ui/estilos";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/ui/formulario";
import type { LocalRow } from "@/types/db";

type Props = {
  accion: (prev: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  local?: Pick<LocalRow, "nombre" | "direccion" | "latitud" | "longitud" | "radio_metros" | "tolerancia_minutos">;
  textoBoton: string;
};

export function LocalForm({ accion, local, textoBoton }: Props) {
  const [estado, formAction] = useActionState(accion, estadoInicial);
  const coordenadasRef = useRef<HTMLInputElement>(null);
  const [ubicacion, setUbicacion] = useState<string | null>(null);

  const coordenadasIniciales =
    local?.latitud != null && local?.longitud != null ? `${local.latitud}, ${local.longitud}` : "";

  function usarUbicacionActual() {
    if (!("geolocation" in navigator)) {
      setUbicacion("Este dispositivo no permite obtener la ubicación.");
      return;
    }
    setUbicacion("Obteniendo ubicación…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (coordenadasRef.current) {
          coordenadasRef.current.value = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        }
        setUbicacion(`Ubicación cargada (precisión aproximada: ${Math.round(coords.accuracy)} m).`);
      },
      () => setUbicacion("No se pudo obtener la ubicación. Revisá los permisos del navegador."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo etiqueta="Nombre del local">
        <input name="nombre" required maxLength={80} defaultValue={local?.nombre} className={claseInput} />
      </Campo>

      <Campo etiqueta="Dirección (opcional)">
        <input name="direccion" maxLength={200} defaultValue={local?.direccion ?? ""} className={claseInput} />
      </Campo>

      <Campo
        etiqueta="Ubicación (coordenadas)"
        ayuda="En Google Maps, mantené apretado (o clic derecho) sobre el local y copiá los números que aparecen. Ejemplo: -34.603722, -58.381592"
      >
        <input
          ref={coordenadasRef}
          name="coordenadas"
          inputMode="decimal"
          placeholder="-34.603722, -58.381592"
          defaultValue={coordenadasIniciales}
          className={claseInput}
        />
      </Campo>
      <div className="-mt-2 flex flex-col gap-1">
        <button type="button" onClick={usarUbicacionActual} className={`${claseBotonSecundario} self-start`}>
          Usar mi ubicación actual
        </button>
        <span className="text-xs text-slate-500">Usalo estando dentro del local.</span>
        {ubicacion && <span className="text-sm text-slate-700">{ubicacion}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Radio permitido (metros)" ayuda="Distancia máxima al local para marcar. Recomendado: 50 a 150.">
          <input
            name="radio_metros"
            type="number"
            min={10}
            max={2000}
            required
            defaultValue={local?.radio_metros ?? 100}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Tolerancia de tardanza (minutos)" ayuda="Minutos de gracia antes de contar una llegada tarde.">
          <input
            name="tolerancia_minutos"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={local?.tolerancia_minutos ?? 10}
            className={claseInput}
          />
        </Campo>
      </div>

      <MensajeFormulario estado={estado} />
      <BotonEnviar>{textoBoton}</BotonEnviar>
    </form>
  );
}
