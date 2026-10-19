// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diasDelMes,
  esMesValido,
  nombreDelMes,
  parsearNormativa,
  proximaSancion,
  sancionPorTardanzas,
  sumarMeses,
} from "../src/lib/normativa.ts";

test("normativa: títulos, artículos resaltados y tablas", () => {
  const bloques = parsearNormativa(
    [
      "## 2.2 Registro de asistencia",
      "",
      "Artículo 26. (Listo para trabajar) El trabajador debe estar en su puesto.",
      "Texto suelto.",
      "| Tardanzas en el mes | Sanción |",
      "|---|---|",
      "| 2 | Llamado de atención |",
      "| 5 o más | Suspensión |",
      "Artículo 33. (Salidas) Nadie se retira.",
    ].join("\r\n"),
  );
  assert.deepEqual(bloques, [
    { tipo: "titulo", texto: "2.2 Registro de asistencia" },
    { tipo: "parrafo", destacado: "Artículo 26. (Listo para trabajar)", texto: "El trabajador debe estar en su puesto." },
    { tipo: "parrafo", destacado: null, texto: "Texto suelto." },
    {
      tipo: "tabla",
      encabezado: ["Tardanzas en el mes", "Sanción"],
      filas: [
        ["2", "Llamado de atención"],
        ["5 o más", "Suspensión"],
      ],
    },
    { tipo: "parrafo", destacado: "Artículo 33. (Salidas)", texto: "Nadie se retira." },
  ]);
});

test("escala de sanciones por tardanzas en el mes (Art. 32)", () => {
  assert.equal(sancionPorTardanzas(0), null);
  assert.equal(sancionPorTardanzas(1), null);
  assert.equal(sancionPorTardanzas(2), "Llamado de atención por escrito");
  assert.equal(sancionPorTardanzas(3), "Apercibimiento con constancia en el legajo");
  assert.equal(sancionPorTardanzas(4), "Suspensión de un (1) día");
  assert.equal(sancionPorTardanzas(5), "Suspensión de dos (2) a tres (3) días");
  assert.equal(sancionPorTardanzas(9), "Suspensión de dos (2) a tres (3) días");
  assert.deepEqual(proximaSancion(1), { desde: 2, sancion: "Llamado de atención por escrito" });
  assert.equal(proximaSancion(5), null);
});

test("meses", () => {
  assert.deepEqual(diasDelMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(diasDelMes("2028-02"), { desde: "2028-02-01", hasta: "2028-02-29" });
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(nombreDelMes("2026-10"), "octubre de 2026");
  assert.equal(esMesValido("2026-10"), true);
  assert.equal(esMesValido("2026-13"), false);
  assert.equal(esMesValido(["2026-10"]), false);
});
