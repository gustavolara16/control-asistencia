// Las migraciones (desde la Etapa 3) se pueden ejecutar dos veces sin errores
// (útil si una aplicación se interrumpe y hay que reintentar).
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearBase } from "./helpers.mjs";

const REEJECUTABLES = [
  "20261014120000_usuarios_y_horarios.sql",
  "20261015120000_marcacion_qr_gps.sql",
  "20261016120000_correcciones.sql",
  "20261017120000_solicitudes.sql",
  "20261019120000_avisos.sql",
];

for (const archivo of REEJECUTABLES) {
  test(`${archivo} es re-ejecutable`, async () => {
    const { db } = await crearBase();
    await db.exec(readFileSync(join(import.meta.dirname, "..", "migrations", archivo), "utf8"));
  });
}
