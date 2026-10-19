// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAsistencia, type MarcacionDia, type TurnoDia } from "../src/lib/asistencia.ts";
import {
  armarAviso,
  debeAvisar,
  esEndpointPushValido,
  filaDeMarcacion,
  PREFERENCIAS_INICIALES,
  type MarcacionAvisada,
} from "../src/lib/avisos.ts";
import { instanteLocal } from "../src/lib/fechas.ts";

// 2026-10-16 es viernes (5). Turno de Ana: 09:00 a 17:00 en Centro.
const FECHA = "2026-10-16";
const hora = (h: string) => instanteLocal(FECHA, h).toISOString();
const marca = (tipo: "entrada" | "salida", h: string): MarcacionDia => ({
  perfil_id: "ana",
  local_id: "centro",
  tipo,
  registrada_en: hora(h),
});
const TURNOS: TurnoDia[] = [
  { perfil_id: "ana", local_id: "centro", dia_semana: 5, hora_entrada: "09:00:00", hora_salida: "17:00:00" },
];

function avisada(marcaciones: MarcacionDia[], ultima: MarcacionDia, turnos = TURNOS): MarcacionAvisada {
  const filas = calcularAsistencia({
    fecha: FECHA,
    ahora: new Date(ultima.registrada_en),
    turnos,
    marcaciones,
    tolerancias: new Map([["centro", 5]]),
  });
  return {
    tipo: ultima.tipo,
    empleado: "Ana Pérez",
    local: "Centro",
    localId: "centro",
    registradaEn: ultima.registrada_en,
    fila: filaDeMarcacion(filas, "ana", ultima.tipo, ultima.registrada_en),
  };
}

test("aviso de entrada: a horario, tarde, fuera de horario y vuelta de un descanso", () => {
  const aHorario = marca("entrada", "09:03");
  assert.deepEqual(armarAviso(avisada([aHorario], aHorario)), {
    titulo: "Ana Pérez entró · Centro",
    cuerpo: "09:03 · a horario (turno 09:00 a 17:00)",
    url: "/admin/asistencia",
  });

  const tarde = marca("entrada", "09:12");
  assert.equal(armarAviso(avisada([tarde], tarde)).cuerpo, "09:12 · 12 min tarde (turno 09:00 a 17:00)");

  assert.equal(armarAviso(avisada([aHorario], aHorario, [])).cuerpo, "09:03 · fuera de su horario");

  const vuelta = [tarde, marca("salida", "13:00"), marca("entrada", "14:00")];
  assert.equal(armarAviso(avisada(vuelta, vuelta[2])).cuerpo, "14:00 · volvió a entrar");
});

test("aviso de salida: horas trabajadas y salida anticipada", () => {
  const dia = [marca("entrada", "09:00"), marca("salida", "16:30")];
  assert.deepEqual(armarAviso(avisada(dia, dia[1])), {
    titulo: "Ana Pérez salió · Centro",
    cuerpo: "16:30 · trabajó 7:30 h · se fue 30 min antes",
    url: "/admin/asistencia",
  });
});

test("preferencias: qué marcaciones se avisan", () => {
  const aHorario = marca("entrada", "09:00");
  const tarde = marca("entrada", "09:20");
  const salida = [aHorario, marca("salida", "17:00")];
  const soloTarde = { ...PREFERENCIAS_INICIALES, entradas: "tarde" as const };

  assert.equal(debeAvisar(PREFERENCIAS_INICIALES, avisada([aHorario], aHorario)), true);
  assert.equal(debeAvisar(PREFERENCIAS_INICIALES, avisada(salida, salida[1])), false);
  assert.equal(debeAvisar({ ...PREFERENCIAS_INICIALES, salidas: true }, avisada(salida, salida[1])), true);
  assert.equal(debeAvisar(soloTarde, avisada([aHorario], aHorario)), false);
  assert.equal(debeAvisar(soloTarde, avisada([tarde], tarde)), true);
  // La vuelta de un descanso no se avisa como llegada tarde.
  const vuelta = [tarde, marca("salida", "13:00"), marca("entrada", "14:00")];
  assert.equal(debeAvisar(soloTarde, avisada(vuelta, vuelta[2])), false);
  assert.equal(debeAvisar({ ...PREFERENCIAS_INICIALES, entradas: "ninguna" }, avisada([tarde], tarde)), false);
  assert.equal(debeAvisar({ ...PREFERENCIAS_INICIALES, locales: ["norte"] }, avisada([tarde], tarde)), false);
  assert.equal(debeAvisar({ ...PREFERENCIAS_INICIALES, locales: ["norte", "centro"] }, avisada([tarde], tarde)), true);
});

test("solo se aceptan direcciones de los servicios de notificaciones de los navegadores", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QK1x",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(esEndpointPushValido(ok), true, ok);
  }
  for (const mal of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/x",
    "https://evil-fcm.googleapis.com.example.com/x",
    "https://apple.com.evil.test/x",
    "https://localhost/x",
    "no es una url",
    42,
  ]) {
    assert.equal(esEndpointPushValido(mal), false, String(mal));
  }
});
