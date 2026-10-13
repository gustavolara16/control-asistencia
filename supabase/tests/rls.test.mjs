// Pruebas de las migraciones y de la seguridad (RLS) contra un PostgreSQL local
// en memoria (PGlite), simulando el entorno de Supabase.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

// Lo mínimo de Supabase que usan las migraciones: roles, auth.users y auth.uid(),
// más los privilegios por defecto que Supabase otorga en el esquema public.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

let db;
const ids = {};

// Ejecuta SQL como un usuario concreto (o como anon / superusuario).
async function as(who, sql, params = []) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  if (who === "anon") {
    await db.exec("set role anon;");
  } else if (who !== "postgres") {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[who]]);
    await db.exec("set role authenticated;");
  }
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => pattern.test(error.message));
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);

  // Un usuario que ya existía antes de la migración (como tu usuario de prueba).
  const previo = await db.query("insert into auth.users (email) values ('previo@ejemplo.test') returning id");
  ids.previo = previo.rows[0].id;

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  for (const name of ["admin", "ana", "beto"]) {
    const { rows } = await db.query(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`${name}@ejemplo.test`, { nombre_completo: name.toUpperCase(), rol: "admin" }],
    );
    ids[name] = rows[0].id;
  }
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);
});

test("se crea un perfil para usuarios nuevos y existentes, siempre como empleado", async () => {
  const { rows } = await as("postgres", "select id, nombre_completo, rol from public.perfiles order by nombre_completo");
  assert.equal(rows.length, 4);
  const ana = rows.find((r) => r.id === ids.ana);
  assert.equal(ana.nombre_completo, "ANA");
  assert.equal(ana.rol, "empleado", "el rol de los metadatos se ignora");
  assert.equal(rows.find((r) => r.id === ids.previo).rol, "empleado");
});

test("anon no puede leer nada", async () => {
  for (const table of ["perfiles", "locales", "marcaciones", "auditoria", "horarios"]) {
    await rejects(as("anon", `select * from public.${table}`), /permission denied/);
  }
});

test("el admin gestiona locales, asignaciones y horarios", async () => {
  const { rows } = await as(
    "admin",
    "insert into public.locales (nombre, latitud, longitud) values ('Centro', -34.6, -58.38), ('Norte', -34.5, -58.4) returning id, nombre",
  );
  ids.centro = rows.find((r) => r.nombre === "Centro").id;
  ids.norte = rows.find((r) => r.nombre === "Norte").id;

  await as("admin", "insert into public.empleado_locales (perfil_id, local_id) values ($1, $2), ($3, $4)", [
    ids.ana, ids.centro, ids.beto, ids.norte,
  ]);
  await as(
    "admin",
    "insert into public.horarios (perfil_id, local_id, dia_semana, hora_entrada, hora_salida) values ($1, $2, 1, '09:00', '13:00'), ($1, $2, 1, '17:00', '21:00')",
    [ids.ana, ids.centro],
  );
});

test("no se puede asignar un horario en un local donde el empleado no trabaja", async () => {
  await rejects(
    as(
      "admin",
      "insert into public.horarios (perfil_id, local_id, dia_semana, hora_entrada, hora_salida) values ($1, $2, 2, '09:00', '17:00')",
      [ids.ana, ids.norte],
    ),
    /foreign key/,
  );
});

test("el empleado solo ve sus datos y sus locales", async () => {
  const perfiles = await as("ana", "select id from public.perfiles");
  assert.deepEqual(perfiles.rows.map((r) => r.id), [ids.ana]);

  const locales = await as("ana", "select nombre from public.locales");
  assert.deepEqual(locales.rows.map((r) => r.nombre), ["Centro"]);

  const horarios = await as("beto", "select * from public.horarios");
  assert.equal(horarios.rows.length, 0);
});

test("el empleado no puede cambiar su rol, crear locales ni asignarse", async () => {
  const update = await as("ana", "update public.perfiles set rol = 'admin' where id = $1", [ids.ana]);
  assert.equal(update.affectedRows, 0);
  await rejects(as("ana", "insert into public.locales (nombre) values ('Trucho')"), /row-level security/);
  await rejects(
    as("ana", "insert into public.empleado_locales (perfil_id, local_id) values ($1, $2)", [ids.ana, ids.norte]),
    /row-level security/,
  );
  await rejects(as("ana", "update public.perfiles set id = gen_random_uuid()"), /permission denied/);
});

test("nadie puede crear, editar ni borrar marcaciones desde la app", async () => {
  await as(
    "postgres",
    "insert into public.marcaciones (perfil_id, local_id, tipo, origen) values ($1, $2, 'entrada', 'qr_gps')",
    [ids.ana, ids.centro],
  );
  for (const who of ["ana", "admin"]) {
    await rejects(
      as(who, "insert into public.marcaciones (perfil_id, local_id, tipo, origen) values ($1, $2, 'salida', 'qr_gps')", [
        ids.ana, ids.centro,
      ]),
      /permission denied/,
    );
    await rejects(as(who, "update public.marcaciones set registrada_en = now() - interval '1 hour'"), /permission denied/);
    await rejects(as(who, "delete from public.marcaciones"), /permission denied/);
  }
});

test("cada empleado solo ve sus marcaciones; el admin ve todas", async () => {
  assert.equal((await as("ana", "select * from public.marcaciones")).rows.length, 1);
  assert.equal((await as("beto", "select * from public.marcaciones")).rows.length, 0);
  assert.equal((await as("admin", "select * from public.marcaciones")).rows.length, 1);
});

test("solicitudes de corrección: solo propias y sin poder fijar el estado", async () => {
  const { rows } = await as("ana", "select id from public.marcaciones");
  const marcacionId = rows[0].id;

  await as(
    "ana",
    "insert into public.solicitudes_correccion (perfil_id, marcacion_id, fecha_hora_propuesta, motivo) values ($1, $2, now(), 'Llegué antes, falló el GPS')",
    [ids.ana, marcacionId],
  );
  // Beto no puede pedir correcciones a nombre de Ana ni sobre marcaciones ajenas.
  await rejects(
    as(
      "beto",
      "insert into public.solicitudes_correccion (perfil_id, marcacion_id, fecha_hora_propuesta, motivo) values ($1, $2, now(), 'No es mía')",
      [ids.beto, marcacionId],
    ),
    /row-level security/,
  );
  await rejects(
    as(
      "ana",
      "insert into public.solicitudes_correccion (perfil_id, local_id, tipo, fecha_hora_propuesta, motivo, estado) values ($1, $2, 'salida', now(), 'Me olvidé', 'aprobada')",
      [ids.ana, ids.centro],
    ),
    /permission denied/,
  );
  assert.equal((await as("beto", "select * from public.solicitudes_correccion")).rows.length, 0);
});

test("los cambios quedan en auditoría, que solo ve el admin", async () => {
  await as("postgres", "select set_config('app.motivo', 'Corrección de prueba', false)");
  await as("postgres", "update public.marcaciones set registrada_en = registrada_en - interval '5 minutes'");
  await as("postgres", "select set_config('app.motivo', '', false)");

  const { rows } = await as("admin", "select tabla, accion, motivo from public.auditoria where tabla = 'marcaciones'");
  assert.deepEqual(rows, [{ tabla: "marcaciones", accion: "UPDATE", motivo: "Corrección de prueba" }]);

  const locales = await as("admin", "select realizado_por from public.auditoria where tabla = 'locales'");
  assert.ok(locales.rows.every((r) => r.realizado_por === ids.admin));

  assert.equal((await as("ana", "select * from public.auditoria")).rows.length, 0);
  await rejects(as("admin", "delete from public.auditoria"), /permission denied/);
});

test("no se puede dejar el sistema sin administradores", async () => {
  await rejects(
    as("admin", "update public.perfiles set rol = 'empleado' where id = $1", [ids.admin]),
    /al menos un administrador/,
  );
  // El admin sí puede desactivar a un empleado.
  const res = await as("admin", "update public.perfiles set activo = false where id = $1", [ids.beto]);
  assert.equal(res.affectedRows, 1);
});

test("un admin desactivado pierde sus permisos", async () => {
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.previo]);
  await as("previo", "update public.perfiles set activo = false where id = $1", [ids.admin]);
  const { rows } = await as("admin", "select id from public.perfiles");
  assert.deepEqual(rows.map((r) => r.id), [ids.admin]);
});
