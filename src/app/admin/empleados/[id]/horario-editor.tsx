"use client";

import { useRef, useState, useTransition } from "react";
import { guardarHorario } from "@/actions/horarios";
import { claseBotonPrimario, claseBotonSecundario, claseInput } from "@/components/ui/estilos";
import { MensajeFormulario } from "@/components/ui/formulario";
import { NOMBRES_DIAS } from "@/lib/fechas";
import type { EstadoFormulario } from "@/lib/formularios";
import { validarHorario, type Turno } from "@/lib/horarios";

type TurnoEditable = Turno & { clave: number };

type Props = {
  perfilId: string;
  locales: { id: string; nombre: string }[];
  turnosIniciales: Turno[];
};

const DIAS = [1, 2, 3, 4, 5, 6, 7];

export function HorarioEditor({ perfilId, locales, turnosIniciales }: Props) {
  const siguienteClave = useRef(turnosIniciales.length);
  const [turnos, setTurnos] = useState<TurnoEditable[]>(() =>
    turnosIniciales.map((t, i) => ({ ...t, clave: i })),
  );
  const [modificado, setModificado] = useState(false);
  const [estado, setEstado] = useState<EstadoFormulario>({});
  const [guardando, startTransition] = useTransition();

  if (locales.length === 0) {
    return <p className="text-sm text-slate-600">Asigná al menos un local para poder cargar el horario.</p>;
  }

  function cambiar(nuevos: TurnoEditable[]) {
    setTurnos(nuevos);
    setModificado(true);
    setEstado({});
  }

  function agregar(dia: number) {
    const anterior = turnos.filter((t) => t.diaSemana === dia).at(-1);
    cambiar([
      ...turnos,
      {
        clave: siguienteClave.current++,
        diaSemana: dia,
        localId: anterior?.localId ?? locales[0].id,
        entrada: anterior ? anterior.salida : "09:00",
        salida: anterior ? "" : "17:00",
      },
    ]);
  }

  function actualizar(clave: number, campos: Partial<Turno>) {
    cambiar(turnos.map((t) => (t.clave === clave ? { ...t, ...campos } : t)));
  }

  function quitar(clave: number) {
    cambiar(turnos.filter((t) => t.clave !== clave));
  }

  // Copia los turnos del lunes a martes–viernes.
  function copiarLunesADiasHabiles() {
    const lunes = turnos.filter((t) => t.diaSemana === 1);
    const resto = turnos.filter((t) => t.diaSemana === 1 || t.diaSemana > 5);
    const copias = [2, 3, 4, 5].flatMap((dia) =>
      lunes.map((t) => ({ ...t, diaSemana: dia, clave: siguienteClave.current++ })),
    );
    cambiar([...resto, ...copias]);
  }

  function guardar() {
    const datos = turnos.map(({ localId, diaSemana, entrada, salida }) => ({ localId, diaSemana, entrada, salida }));
    const error = validarHorario(datos, new Set(locales.map((l) => l.id)));
    if (error) {
      setEstado({ error });
      return;
    }
    startTransition(async () => {
      const resultado = await guardarHorario(perfilId, datos);
      setEstado(resultado);
      if (resultado.ok) setModificado(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-slate-100">
        {DIAS.map((dia) => {
          const delDia = turnos.filter((t) => t.diaSemana === dia);
          return (
            <li key={dia} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <span className="w-28 shrink-0 pt-2 text-sm font-medium text-slate-900">{NOMBRES_DIAS[dia]}</span>
              <div className="flex flex-1 flex-col gap-2">
                {delDia.length === 0 && <span className="pt-2 text-sm text-slate-500">Descanso</span>}
                {delDia.map((t) => (
                  <div key={t.clave} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      aria-label="Hora de entrada"
                      value={t.entrada}
                      onChange={(e) => actualizar(t.clave, { entrada: e.target.value })}
                      className={`${claseInput} w-32`}
                    />
                    <span className="text-sm text-slate-500">a</span>
                    <input
                      type="time"
                      aria-label="Hora de salida"
                      value={t.salida}
                      onChange={(e) => actualizar(t.clave, { salida: e.target.value })}
                      className={`${claseInput} w-32`}
                    />
                    {locales.length > 1 && (
                      <select
                        aria-label="Local"
                        value={t.localId}
                        onChange={(e) => actualizar(t.clave, { localId: e.target.value })}
                        className={`${claseInput} w-auto`}
                      >
                        {locales.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => quitar(t.clave)}
                      className="h-11 px-2 text-sm text-red-700 hover:underline"
                    >
                      Quitar
                    </button>
                    {t.entrada && t.salida && t.salida < t.entrada && (
                      <span className="text-xs text-slate-500">(termina al día siguiente)</span>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => agregar(dia)}
                  className="self-start text-sm font-medium text-brand hover:underline"
                >
                  + Agregar turno
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <MensajeFormulario estado={estado} />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className={claseBotonPrimario}>
          {guardando ? "Guardando…" : "Guardar horario"}
        </button>
        <button
          type="button"
          onClick={copiarLunesADiasHabiles}
          disabled={!turnos.some((t) => t.diaSemana === 1)}
          className={claseBotonSecundario}
        >
          Copiar lunes a martes–viernes
        </button>
        {modificado && <span className="self-center text-sm text-amber-700">Hay cambios sin guardar.</span>}
      </div>
    </div>
  );
}
