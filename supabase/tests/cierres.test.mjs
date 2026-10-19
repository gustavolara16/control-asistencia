// Pruebas del cierre mensual de tardanzas: solo el administrador (o el
// servidor) lo guarda y lo ve; volver a guardarlo reemplaza el anterior.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);
  for (const nombre of ["admin", "ana", "beto"]) await base.crearUsuario(nombre);
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);
});

const fila = (perfil, tardanzas) => ({
  perfil_id: ids[perfil],
  tardanzas,
  minutos_tarde: tardanzas * 5,
  detalle: Array.from({ length: tardanzas }, (_, i) => ({ fecha: `2026-10-0${i + 1}`, minutos: 5 })),
  sancion: tardanzas >= 2 ? "Llamado de atención por escrito" : "",
});
const guardar = (who, mes, filas, origen = "manual") =>
  as(who, "select public.guardar_cierre_mes($1, $2, $3) as n", [mes, JSON.stringify(filas), origen]);

test("el administrador guarda el cierre y volver a guardarlo lo reemplaza", async () => {
  await guardar("admin", "2026-10", [fila("ana", 2), fila("beto", 1)]);
  await guardar("admin", "2026-10", [fila("ana", 3)]);

  const filas = await as("admin", "select perfil_id, tardanzas, sancion from public.cierres_tardanzas where mes = '2026-10'");
  assert.deepEqual(filas.rows, [{ perfil_id: ids.ana, tardanzas: 3, sancion: "Llamado de atención por escrito" }]);
  const [cierre] = (await as("admin", "select origen, guardado_por from public.cierres_mes")).rows;
  assert.deepEqual(cierre, { origen: "manual", guardado_por: ids.admin });
});

test("el servidor (sin usuario) guarda el cierre automático; un mes sin tardanzas también queda guardado", async () => {
  const [{ n }] = (await guardar("postgres", "2026-09", [], "automatico")).rows;
  assert.equal(n, 0);
  const [cierre] = (await as("admin", "select origen, guardado_por from public.cierres_mes where mes = '2026-09'")).rows;
  assert.deepEqual(cierre, { origen: "automatico", guardado_por: null });
});

test("los empleados no ven ni guardan cierres; los datos se validan", async () => {
  await rejects(guardar("ana", "2026-10", [fila("ana", 0)]), /row-level security/);
  assert.equal((await as("ana", "select * from public.cierres_tardanzas")).rows.length, 0);
  assert.equal((await as("ana", "select * from public.cierres_mes")).rows.length, 0);
  await rejects(as("anon", "select * from public.cierres_mes"), /permission denied/);
  await rejects(guardar("admin", "2026-13", []), /check constraint/);
  await rejects(guardar("admin", "2026-10", [], "otro"), /Origen de cierre inválido/);
  await rejects(guardar("admin", "2026-10", [fila("beto", 0)]), /check constraint/);
  // Un error no deja el cierre a medias: sigue el anterior.
  assert.equal((await as("admin", "select tardanzas from public.cierres_tardanzas where mes = '2026-10'")).rows[0].tardanzas, 3);
});
