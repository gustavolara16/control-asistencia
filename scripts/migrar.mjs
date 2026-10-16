// Aplica las migraciones pendientes de supabase/migrations directamente a la
// base de datos de Supabase, en orden y cada una en su propia transacción.
// Uso: npm run db:migrar          (aplica las pendientes)
//      npm run db:migrar -- --ver (solo muestra el estado)
//
// Necesita SUPABASE_DB_URL en .env.migraciones (cadena de conexión "Session
// pooler"). Va en un archivo aparte de .env.local para que la contraseña de la
// base nunca viaje con la app publicada. Nunca se muestra en pantalla.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIRECTORIO = join(import.meta.dirname, "..", "supabase", "migrations");
// Migración que ya se aplicó a mano (SQL Editor) antes de existir este script.
const MIGRACION_BASE = "20261013120000_esquema_inicial.sql";

try {
  process.loadEnvFile(join(import.meta.dirname, "..", ".env.migraciones"));
} catch {
  // Sin .env.migraciones: se avisa abajo.
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("✗ Falta SUPABASE_DB_URL en .env.migraciones (ver .env.example).");
  process.exit(1);
}
if (url.includes("[YOUR-PASSWORD]")) {
  console.error("✗ En SUPABASE_DB_URL falta reemplazar [YOUR-PASSWORD] por la contraseña de la base.");
  process.exit(1);
}

// Se separa la cadena a mano para que la contraseña pueda tener símbolos
// (#, ?, /, %…) sin necesidad de codificarlos.
const partes = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:/]+):(\d+)\/([^?]+)/);
if (!partes) {
  console.error("✗ SUPABASE_DB_URL no tiene el formato postgresql://usuario:contraseña@servidor:puerto/base");
  process.exit(1);
}
const [, user, password, host, port, database] = partes;

const soloVer = process.argv.includes("--ver");
// Conexión cifrada (equivalente a sslmode=require).
const cliente = new pg.Client({
  user,
  password,
  host,
  port: Number(port),
  database,
  ssl: { rejectUnauthorized: false },
});

function describirError(error) {
  return [error.message, error.detail && `Detalle: ${error.detail}`, error.hint && `Sugerencia: ${error.hint}`]
    .filter(Boolean)
    .join("\n  ");
}

try {
  await cliente.connect();
} catch (error) {
  console.error("✗ No se pudo conectar a la base de datos:\n  " + describirError(error));
  console.error("  Revisá la cadena de conexión y la contraseña en SUPABASE_DB_URL.");
  process.exit(1);
}

try {
  // Registro de migraciones aplicadas, en un esquema que no expone la API.
  await cliente.query(`
    create schema if not exists privado;
    create table if not exists privado.migraciones_aplicadas (
      nombre text primary key,
      aplicada_en timestamptz not null default now()
    );
  `);

  const { rows: registradas } = await cliente.query("select nombre from privado.migraciones_aplicadas");
  const aplicadas = new Set(registradas.map((r) => r.nombre));

  if (aplicadas.size === 0) {
    const { rows } = await cliente.query("select to_regclass('public.perfiles') is not null as existe");
    if (rows[0].existe) {
      await cliente.query("insert into privado.migraciones_aplicadas (nombre) values ($1)", [MIGRACION_BASE]);
      aplicadas.add(MIGRACION_BASE);
    }
  }

  const archivos = readdirSync(DIRECTORIO).filter((f) => f.endsWith(".sql")).sort();
  const pendientes = archivos.filter((f) => !aplicadas.has(f));

  for (const archivo of archivos) {
    console.log(`${aplicadas.has(archivo) ? "✓ aplicada " : "• pendiente"}  ${archivo}`);
  }
  if (soloVer) process.exit(0);
  if (pendientes.length === 0) {
    console.log("\nLa base de datos está al día.");
    process.exit(0);
  }

  for (const archivo of pendientes) {
    process.stdout.write(`\nAplicando ${archivo}… `);
    try {
      await cliente.query("begin");
      await cliente.query("set local lock_timeout = '10s'; set local statement_timeout = '60s';");
      await cliente.query(readFileSync(join(DIRECTORIO, archivo), "utf8"));
      await cliente.query("insert into privado.migraciones_aplicadas (nombre) values ($1)", [archivo]);
      await cliente.query("commit");
      console.log("✓");
    } catch (error) {
      await cliente.query("rollback").catch(() => {});
      console.log("✗");
      console.error(`  No se aplicó (no quedó ningún cambio a medias):\n  ${describirError(error)}`);
      process.exit(1);
    }
  }

  // Avisa a la API de Supabase que hay tablas/funciones nuevas.
  await cliente.query("notify pgrst, 'reload schema'");
  console.log("\n✓ Migraciones aplicadas.");
} finally {
  await cliente.end();
}
