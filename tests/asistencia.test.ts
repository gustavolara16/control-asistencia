// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarTramos, calcularAsistencia, historialPorDias, minutosTrabajados, type MarcacionDia, type TurnoDia } from "../src/lib/asistencia.ts";
import { diaSemanaDe, esFechaValida, formatearDuracion, inicioDelDia, instanteLocal, sumarDias } from "../src/lib/fechas.ts";

// 2026-10-16 es viernes (5). Buenos Aires = UTC-3.
const FECHA = "2026-10-16";
const ANA = "ana";
const CENTRO = "centro";
const NORTE = "norte";

const hora = (h: string, fecha = FECHA) => instanteLocal(fecha, h).toISOString();
const marca = (tipo: "entrada" | "salida", h: string, fecha = FECHA, local = CENTRO, perfil = ANA): MarcacionDia => ({
  perfil_id: perfil,
  local_id: local,
  tipo,
  registrada_en: hora(h, fecha),
});
const turno = (entrada: string, salida: string, local = CENTRO, dia = 5, perfil = ANA): TurnoDia => ({
  perfil_id: perfil,
  local_id: local,
  dia_semana: dia,
  hora_entrada: `${entrada}:00`,
  hora_salida: `${salida}:00`,
});
const calcular = (turnos: TurnoDia[], marcaciones: MarcacionDia[], ahora: string, tolerancia = 0) =>
  calcularAsistencia({
    fecha: FECHA,
    ahora: new Date(ahora),
    turnos,
    marcaciones,
    tolerancias: new Map([
      [CENTRO, tolerancia],
      [NORTE, tolerancia],
    ]),
  });

test("fechas: conversión a la zona del negocio", () => {
  assert.equal(instanteLocal(FECHA, "09:00").toISOString(), "2026-10-16T12:00:00.000Z");
  assert.equal(inicioDelDia(new Date("2026-10-17T02:30:00Z")).toISOString(), "2026-10-16T03:00:00.000Z");
  assert.equal(diaSemanaDe(FECHA), 5);
  assert.equal(diaSemanaDe("2026-10-18"), 7);
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.ok(esFechaValida("2026-02-28"));
  assert.ok(!esFechaValida("2026-02-30"));
  assert.ok(!esFechaValida("16/10/2026"));
  assert.ok(!esFechaValida(undefined));
  assert.equal(formatearDuracion(485), "8:05 h");
});

test("tramos: empareja entradas y salidas y detecta la salida faltante", () => {
  const tramos = armarTramos(
    [marca("salida", "07:00"), marca("entrada", "09:00"), marca("salida", "13:00"), marca("entrada", "14:00"), marca("entrada", "18:00")],
    new Date(hora("19:30")),
  );
  // La salida de las 07:00 es de una entrada anterior: se ignora.
  assert.deepEqual(
    tramos.map((t) => [t.situacion, t.minutos]),
    [
      ["cerrado", 240],
      ["sin_salida", null],
      ["abierto", 90],
    ],
  );
  assert.equal(minutosTrabajados(tramos), 330);
});

test("tramos: una entrada de hace más de 18 h ya no está abierta", () => {
  const [t] = armarTramos([marca("entrada", "09:00")], new Date(hora("04:00", "2026-10-17")));
  assert.equal(t.situacion, "sin_salida");
});

test("a horario, tarde y salida anticipada según la tolerancia", () => {
  const [fila] = calcular([turno("09:00", "17:00")], [marca("entrada", "09:04"), marca("salida", "17:00")], hora("18:00"), 5);
  assert.equal(fila.estado, "a_horario");
  assert.equal(fila.minutosTarde, 0);

  const [tarde] = calcular([turno("09:00", "17:00")], [marca("entrada", "09:12"), marca("salida", "16:30")], hora("18:00"), 5);
  assert.equal(tarde.estado, "tarde");
  assert.equal(tarde.minutosTarde, 12);
  assert.equal(tarde.minutosAntes, 30);
  assert.equal(minutosTrabajados(tarde.tramos), 438);
});

test("sin tolerancia, unos segundos tarde no cuentan como llegada tarde", () => {
  const marcaciones = [{ ...marca("entrada", "09:00"), registrada_en: "2026-10-16T12:00:45.000Z" }];
  const [fila] = calcular([turno("09:00", "17:00")], marcaciones, hora("10:00"));
  assert.equal(fila.estado, "a_horario");
  assert.equal(fila.tramos[0].situacion, "abierto");
});

test("pendiente, sin marcar y ausente según la hora actual", () => {
  assert.equal(calcular([turno("09:00", "17:00")], [], hora("08:30"))[0].estado, "pendiente");
  assert.equal(calcular([turno("09:00", "17:00")], [], hora("09:00"), 10)[0].estado, "pendiente");
  assert.equal(calcular([turno("09:00", "17:00")], [], hora("10:00"))[0].estado, "sin_marcar");
  assert.equal(calcular([turno("09:00", "17:00")], [], hora("17:00"))[0].estado, "ausente");
});

test("solo cuentan los turnos del día de la semana consultado", () => {
  assert.equal(calcular([turno("09:00", "17:00", CENTRO, 4)], [], hora("18:00")).length, 0);
});

test("trabajar sin turno asignado o en otro local figura como sin horario", () => {
  const filas = calcular([turno("09:00", "17:00")], [marca("entrada", "09:05", FECHA, NORTE)], hora("12:00"));
  assert.deepEqual(
    filas.map((f) => [f.localId, f.estado]),
    [
      [CENTRO, "sin_marcar"],
      [NORTE, "sin_horario"],
    ],
  );
});

test("turno cortado: cada entrada va a su turno", () => {
  const filas = calcular(
    [turno("17:00", "21:00"), turno("09:00", "13:00")],
    [marca("entrada", "08:58"), marca("salida", "13:00"), marca("entrada", "17:20")],
    hora("18:00"),
  );
  assert.deepEqual(
    filas.map((f) => [f.turno?.entrada, f.estado, f.minutosTarde]),
    [
      ["09:00", "a_horario", 0],
      ["17:00", "tarde", 20],
    ],
  );
});

test("salir y volver a entrar dentro del mismo turno suma las horas", () => {
  const [fila] = calcular(
    [turno("09:00", "17:00")],
    [marca("entrada", "09:00"), marca("salida", "12:00"), marca("entrada", "12:30"), marca("salida", "17:00")],
    hora("18:00"),
  );
  assert.equal(fila.tramos.length, 2);
  assert.equal(minutosTrabajados(fila.tramos), 450);
});

test("turno nocturno: la salida del día siguiente cierra el tramo", () => {
  const [fila] = calcular(
    [turno("22:00", "06:00")],
    [marca("entrada", "22:05"), marca("salida", "06:00", "2026-10-17")],
    hora("07:00", "2026-10-17"),
  );
  assert.equal(fila.estado, "tarde");
  assert.equal(fila.minutosTarde, 5);
  assert.equal(fila.minutosAntes, 0);
  assert.equal(fila.tramos[0].minutos, 475);
});

test("la salida de un turno del día anterior no aparece como sin horario", () => {
  const filas = calcular([], [marca("salida", "06:00")], hora("12:00"));
  assert.equal(filas.length, 0);
});

test("historial: un día por fecha, del más reciente al más antiguo, sin días vacíos", () => {
  const dias = historialPorDias({
    desde: "2026-10-12",
    hasta: FECHA,
    ahora: new Date(hora("20:00")),
    // Lunes y viernes de 9 a 17.
    turnos: [turno("09:00", "17:00", CENTRO, 1), turno("09:00", "17:00", CENTRO, 5)],
    marcaciones: [marca("entrada", "09:00"), marca("salida", "17:00"), marca("entrada", "10:00", "2026-10-14", NORTE)],
    tolerancias: new Map(),
  });
  assert.deepEqual(
    dias.map((d) => [d.fecha, d.filas.map((f) => f.estado)]),
    [
      [FECHA, ["a_horario"]],
      ["2026-10-14", ["sin_horario"]],
      ["2026-10-12", ["ausente"]],
    ],
  );
});
