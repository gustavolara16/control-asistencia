// Base PostgreSQL en memoria (PGlite) que simula lo mínimo de Supabase,
// con todas las migraciones aplicadas. Compartido por las pruebas.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

// Roles, auth.users y auth.uid(), más los privilegios por defecto que
// Supabase otorga en el esquema public.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}',
    raw_app_meta_data jsonb not null default '{}'
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

/**
 * Crea una base nueva. `antesDeMigrar` permite insertar datos previos
 * (por ejemplo, usuarios que ya existían).
 */
export async function crearBase(antesDeMigrar = async () => {}) {
  const db = new PGlite();
  const ids = {};
  await db.exec(SUPABASE_STUB);
  await antesDeMigrar(db, ids);

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  // Ejecuta SQL como un usuario de `ids`, como "anon" o como "postgres" (superusuario).
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

  // Simula la creación de un usuario en Supabase Auth.
  async function crearUsuario(nombre, { userMeta = {}, appMeta = {} } = {}) {
    const { rows } = await db.query(
      "insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3) returning id",
      [`${nombre}@ejemplo.test`, userMeta, appMeta],
    );
    ids[nombre] = rows[0].id;
    return rows[0].id;
  }

  return { db, ids, as, crearUsuario };
}

export async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => pattern.test(error.message));
}
