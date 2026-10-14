// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarHorario, type Turno } from "../src/lib/horarios.ts";

const CENTRO = "centro";
const locales = new Set([CENTRO]);
const turno = (diaSemana: number, entrada: string, salida: string, localId = CENTRO): Turno => ({
  localId,
  diaSemana,
  entrada,
  salida,
});

test("acepta turno cortado y días de descanso", () => {
  assert.equal(validarHorario([turno(1, "09:00", "13:00"), turno(1, "17:00", "21:00")], locales), null);
  assert.equal(validarHorario([], locales), null);
});

test("acepta un turno que termina al día siguiente", () => {
  assert.equal(validarHorario([turno(5, "22:00", "06:00")], locales), null);
});

test("rechaza turnos superpuestos en el mismo día", () => {
  assert.match(validarHorario([turno(1, "09:00", "14:00"), turno(1, "13:00", "18:00")], locales)!, /superponen/);
  assert.match(validarHorario([turno(1, "20:00", "02:00"), turno(1, "23:00", "23:30")], locales)!, /superponen/);
});

test("turnos contiguos no se superponen", () => {
  assert.equal(validarHorario([turno(1, "09:00", "13:00"), turno(1, "13:00", "17:00")], locales), null);
});

test("rechaza horas faltantes, iguales o mal escritas", () => {
  assert.match(validarHorario([turno(1, "09:00", "")], locales)!, /Completá/);
  assert.match(validarHorario([turno(1, "09:00", "09:00")], locales)!, /iguales/);
  assert.match(validarHorario([turno(1, "25:00", "26:00")], locales)!, /Completá/);
});

test("rechaza días inválidos y locales no asignados", () => {
  assert.match(validarHorario([turno(0, "09:00", "10:00")], locales)!, /día inválido/);
  assert.match(validarHorario([turno(1, "09:00", "10:00", "otro")], locales)!, /no está asignado/);
});
