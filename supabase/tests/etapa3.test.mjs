// Pruebas de la Etapa 3: usuario de empleados y guardado del horario semanal.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);

  await base.crearUsuario("admin");
  await base.crearUsuario("ana", { appMeta: { usuario: "ana.lopez" } });
  // Un usuario que intenta asignarse un "usuario" por su cuenta (user_metadata).
  await base.crearUsuario("trucho", { userMeta: { usuario: "jefe" } });
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);

  const { rows } = await as(
    "admin",
    "insert into public.locales (nombre) values ('Centro'), ('Norte') returning id, nombre",
  );
  ids.centro = rows.find((r) => r.nombre === "Centro").id;
  ids.norte = rows.find((r) => r.nombre === "Norte").id;
  await as("admin", "insert into public.empleado_locales (perfil_id, local_id) values ($1, $2)", [ids.ana, ids.centro]);
});

test("el usuario se toma de app_metadata y nunca de user_metadata", async () => {
  const { rows } = await as("postgres", "select id, usuario from public.perfiles");
  assert.equal(rows.find((r) => r.id === ids.ana).usuario, "ana.lopez");
  assert.equal(rows.find((r) => r.id === ids.trucho).usuario, null);
});

test("el usuario no admite formatos inválidos ni repetidos", async () => {
  await rejects(
    as("postgres", "update public.perfiles set usuario = 'Con Espacios' where id = $1", [ids.trucho]),
    /check constraint/,
  );
  await rejects(
    as("postgres", "update public.perfiles set usuario = 'ana.lopez' where id = $1", [ids.trucho]),
    /unique|duplicate/,
  );
});

test("nadie puede cambiar el usuario desde la app (ni el admin)", async () => {
  await rejects(
    as("admin", "update public.perfiles set usuario = 'otro' where id = $1", [ids.ana]),
    /permission denied/,
  );
});

const turnos = (localId) =>
  JSON.stringify([
    { local_id: localId, dia_semana: 1, hora_entrada: "09:00", hora_salida: "13:00" },
    { local_id: localId, dia_semana: 1, hora_entrada: "17:00", hora_salida: "21:00" },
    { local_id: localId, dia_semana: 5, hora_entrada: "22:00", hora_salida: "06:00" },
  ]);

test("el admin reemplaza el horario semanal completo", async () => {
  await as("admin", "select public.reemplazar_horarios($1, $2::jsonb)", [ids.ana, turnos(ids.centro)]);
  assert.equal((await as("ana", "select * from public.horarios")).rows.length, 3);

  // Guardar de nuevo reemplaza (no duplica).
  await as("admin", "select public.reemplazar_horarios($1, $2::jsonb)", [ids.ana, turnos(ids.centro)]);
  assert.equal((await as("admin", "select * from public.horarios")).rows.length, 3);
});

test("si un turno es inválido no se pierde el horario anterior", async () => {
  // Norte no está asignado a Ana: falla todo y queda el horario que había.
  await rejects(
    as("admin", "select public.reemplazar_horarios($1, $2::jsonb)", [ids.ana, turnos(ids.norte)]),
    /foreign key/,
  );
  const { rows } = await as("admin", "select local_id from public.horarios");
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.local_id === ids.centro));
});

test("un empleado no puede modificar horarios", async () => {
  await rejects(
    as("ana", "select public.reemplazar_horarios($1, '[]'::jsonb)", [ids.ana]),
    /Solo un administrador/,
  );
  await rejects(as("anon", "select public.reemplazar_horarios($1, '[]'::jsonb)", [ids.ana]), /permission denied/);
  assert.equal((await as("admin", "select * from public.horarios")).rows.length, 3);
});

test("un horario vacío deja al empleado sin turnos (todos los días de descanso)", async () => {
  await as("admin", "select public.reemplazar_horarios($1, '[]'::jsonb)", [ids.ana]);
  assert.equal((await as("admin", "select * from public.horarios")).rows.length, 0);
});
