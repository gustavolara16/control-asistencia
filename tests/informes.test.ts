// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MarcacionDia, TurnoDia } from "../src/lib/asistencia.ts";
import { instanteLocal } from "../src/lib/fechas.ts";
import {
  asistenciaDelPeriodo,
  generarCsv,
  horasDecimales,
  leerPeriodo,
  minutosDelTurno,
  resumirPorEmpleado,
} from "../src/lib/informes.ts";

const CENTRO = "centro";
const marca = (perfil: string, tipo: "entrada" | "salida", fecha: string, hora: string): MarcacionDia => ({
  perfil_id: perfil,
  local_id: CENTRO,
  tipo,
  registrada_en: instanteLocal(fecha, hora).toISOString(),
});
const turno = (perfil: string, dia: number, entrada: string, salida: string): TurnoDia => ({
  perfil_id: perfil,
  local_id: CENTRO,
  dia_semana: dia,
  hora_entrada: `${entrada}:00`,
  hora_salida: `${salida}:00`,
});

test("duración de los turnos, incluso los nocturnos", () => {
  assert.equal(minutosDelTurno({ entrada: "09:00", salida: "17:30" }), 510);
  assert.equal(minutosDelTurno({ entrada: "22:00", salida: "06:00" }), 480);
  assert.equal(minutosDelTurno({ entrada: "16:00", salida: "23:59" }), 479);
});

test("resumen por empleado de una semana", () => {
  // Lunes 12 a viernes 16 de octubre de 2026. Ana: lunes y miércoles de 9 a 17.
  const filas = asistenciaDelPeriodo({
    desde: "2026-10-12",
    hasta: "2026-10-16",
    ahora: instanteLocal("2026-10-16", "20:00"),
    tolerancias: new Map([[CENTRO, 5]]),
    turnos: [turno("ana", 1, "09:00", "17:00"), turno("ana", 3, "09:00", "17:00"), turno("beto", 5, "22:00", "06:00")],
    marcaciones: [
      // Lunes: llega 09:20 (tarde) y se va 16:00 (antes).
      marca("ana", "entrada", "2026-10-12", "09:20"),
      marca("ana", "salida", "2026-10-12", "16:00"),
      // Miércoles: no viene (ausente). Jueves: trabaja sin turno y no marca la salida.
      marca("ana", "entrada", "2026-10-15", "10:00"),
    ],
  });
  const [ana, beto] = resumirPorEmpleado(filas).sort((a, b) => a.perfilId.localeCompare(b.perfilId));

  assert.deepEqual(ana, {
    perfilId: "ana",
    diasTrabajados: 2,
    minutosTrabajados: 400,
    minutosProgramados: 960,
    turnos: 2,
    llegadasTarde: 1,
    minutosTarde: 20,
    ausencias: 1,
    salidasAnticipadas: 1,
    sinSalida: 1,
    fueraDeHorario: 1,
  });
  // El turno nocturno del viernes todavía no empezó: no cuenta como ausencia ni como horas programadas.
  assert.equal(beto.ausencias, 0);
  assert.equal(beto.minutosProgramados, 0);
});

test("horas con coma decimal", () => {
  assert.equal(horasDecimales(465), "7,75");
  assert.equal(horasDecimales(-30), "-0,50");
});

test("CSV para Excel: BOM, punto y coma, comillas y sin fórmulas", () => {
  const csv = generarCsv([
    ["Empleado", "Horas"],
    ['Ana "La" Pérez; turno', "7,75"],
    ["=HYPERLINK(\"x\")", "-0,50"],
    [null, 3],
  ]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(
    csv.slice(1),
    'Empleado;Horas\r\n"Ana ""La"" Pérez; turno";7,75\r\n"\'=HYPERLINK(""x"")";-0,50\r\n;3\r\n',
  );
});

test("período del informe: valores por defecto y límites", () => {
  const hoy = "2026-10-16";
  assert.deepEqual(leerPeriodo(undefined, undefined, hoy), { desde: "2026-10-01", hasta: hoy });
  assert.deepEqual(leerPeriodo("2026-09-01", "2026-09-30", hoy), { desde: "2026-09-01", hasta: "2026-09-30" });
  // No se puede pedir el futuro.
  assert.deepEqual(leerPeriodo("2026-10-10", "2026-12-31", hoy), { desde: "2026-10-10", hasta: hoy });
  assert.equal(leerPeriodo("2026-10-20", "2026-10-05", hoy).desde, "2026-10-05");
  const largo = leerPeriodo("2025-01-01", hoy, hoy);
  assert.equal(largo.desde, "2026-07-16");
  assert.match(largo.aviso!, /93 días/);
  assert.deepEqual(leerPeriodo("basura", "16/10/2026", hoy), { desde: "2026-10-01", hasta: hoy });
});
