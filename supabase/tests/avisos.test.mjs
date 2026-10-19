// Pruebas de los avisos: cada administrador solo ve y cambia sus suscripciones
// y preferencias; los empleados no tienen acceso.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);
  for (const nombre of ["admin", "admin2", "ana"]) await base.crearUsuario(nombre);
  await as("postgres", "update public.perfiles set rol = 'admin' where id in ($1, $2)", [ids.admin, ids.admin2]);
});

const suscribir = (who, endpoint, perfil = who) =>
  as(
    who,
    "insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth) values ($1, $2, 'clave', 'secreto') returning id",
    [ids[perfil], endpoint],
  );

test("cada administrador ve y borra solo sus suscripciones", async () => {
  await suscribir("admin", "https://fcm.googleapis.com/fcm/send/uno");
  await suscribir("admin2", "https://web.push.apple.com/dos");

  const propias = await as("admin", "select endpoint from public.suscripciones_push");
  assert.deepEqual(propias.rows.map((r) => r.endpoint), ["https://fcm.googleapis.com/fcm/send/uno"]);

  await as("admin", "delete from public.suscripciones_push");
  const quedan = await as("postgres", "select endpoint from public.suscripciones_push");
  assert.deepEqual(quedan.rows.map((r) => r.endpoint), ["https://web.push.apple.com/dos"]);
});

test("nadie puede suscribirse a nombre de otro ni un empleado puede suscribirse", async () => {
  await rejects(suscribir("admin", "https://fcm.googleapis.com/fcm/send/tres", "admin2"), /row-level security/);
  await rejects(suscribir("ana", "https://fcm.googleapis.com/fcm/send/cuatro"), /row-level security/);
  await rejects(as("anon", "select * from public.suscripciones_push"), /permission denied/);
  assert.equal((await as("ana", "select * from public.suscripciones_push")).rows.length, 0);
  await rejects(suscribir("admin", "http://inseguro.test/x"), /check constraint/);
});

test("las preferencias son de cada administrador", async () => {
  await as("admin", "insert into public.preferencias_avisos (perfil_id, entradas, salidas) values ($1, 'tarde', true)", [
    ids.admin,
  ]);
  await rejects(
    as("admin", "insert into public.preferencias_avisos (perfil_id) values ($1)", [ids.admin2]),
    /row-level security/,
  );
  await rejects(as("ana", "insert into public.preferencias_avisos (perfil_id) values ($1)", [ids.ana]), /row-level security/);
  await rejects(
    as("admin", "update public.preferencias_avisos set entradas = 'cualquiera' where perfil_id = $1", [ids.admin]),
    /check constraint/,
  );
  assert.equal((await as("admin2", "select * from public.preferencias_avisos")).rows.length, 0);
  const [p] = (await as("admin", "select entradas, salidas, locales from public.preferencias_avisos")).rows;
  assert.deepEqual(p, { entradas: "tarde", salidas: true, locales: null });
});

test("un administrador desactivado pierde el acceso a sus avisos", async () => {
  await as("postgres", "update public.perfiles set activo = false where id = $1", [ids.admin]);
  assert.equal((await as("admin", "select * from public.preferencias_avisos")).rows.length, 0);
  await as("postgres", "update public.perfiles set activo = true where id = $1", [ids.admin]);
});
