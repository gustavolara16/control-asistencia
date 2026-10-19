// Pruebas de la normativa: todos la leen, solo el administrador la cambia, y
// la constancia de lectura no se puede falsear.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);
  for (const nombre of ["admin", "ana"]) await base.crearUsuario(nombre);
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);
});

test("sin normativa no se puede confirmar la lectura", async () => {
  await rejects(as("ana", "select public.confirmar_lectura_normativa()"), /Todavía no hay una normativa/);
});

test("solo el administrador publica y edita; cada cambio sube la versión", async () => {
  await rejects(as("ana", "insert into public.normativa (texto) values ('Mía')"), /row-level security/);
  await as("admin", "insert into public.normativa (texto) values ('Artículo 1. (Prueba) Texto.')");
  await rejects(as("admin", "insert into public.normativa (texto) values ('Otra')"), /duplicate key/);

  const editada = await as("ana", "update public.normativa set texto = 'Cambiada por ana' returning id");
  assert.equal(editada.rows.length, 0);
  await rejects(as("admin", "update public.normativa set version = 50"), /permission denied/);

  await as("admin", "update public.normativa set texto = 'Artículo 1. (Prueba) Texto nuevo.'");
  const [n] = (await as("ana", "select texto, version, actualizada_por from public.normativa")).rows;
  assert.deepEqual(n, { texto: "Artículo 1. (Prueba) Texto nuevo.", version: 2, actualizada_por: ids.admin });

  const auditoria = await as("admin", "select accion from public.auditoria where tabla = 'normativa' order by id");
  assert.deepEqual(auditoria.rows.map((r) => r.accion), ["INSERT", "UPDATE"]);
});

test("la lectura se registra para la versión vigente y a nombre propio", async () => {
  const [{ v }] = (await as("ana", "select public.confirmar_lectura_normativa() as v")).rows;
  assert.equal(v, 2);
  await as("ana", "select public.confirmar_lectura_normativa()"); // repetir no duplica

  await rejects(
    as("ana", "insert into public.normativa_lecturas (perfil_id, version) values ($1, 9)", [ids.ana]),
    /permission denied/,
  );
  await rejects(as("ana", "delete from public.normativa_lecturas"), /permission denied/);
  await rejects(as("anon", "select public.confirmar_lectura_normativa()"), /permission denied/);

  const propias = await as("ana", "select perfil_id, version from public.normativa_lecturas");
  assert.deepEqual(propias.rows, [{ perfil_id: ids.ana, version: 2 }]);
  assert.equal((await as("admin", "select * from public.normativa_lecturas")).rows.length, 1);
  assert.equal((await as("admin", "select * from public.normativa_lecturas where perfil_id = $1", [ids.admin])).rows.length, 0);
});
