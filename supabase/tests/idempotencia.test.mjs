// La migración de la Etapa 3 se puede ejecutar dos veces sin errores
// (útil si el panel de Supabase falla y hay que reintentar).
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearBase } from "./helpers.mjs";

test("la migración de usuarios y horarios es re-ejecutable", async () => {
  const { db } = await crearBase();
  const sql = readFileSync(
    join(import.meta.dirname, "..", "migrations", "20261014120000_usuarios_y_horarios.sql"),
    "utf8",
  );
  await db.exec(sql);
});
