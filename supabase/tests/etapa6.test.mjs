// Pruebas de la Etapa 6: correcciones de marcaciones por el administrador.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;
let qr;

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);

  await base.crearUsuario("admin");
  for (const nombre of ["ana", "beto"]) {
    await base.crearUsuario(nombre, { appMeta: { usuario: nombre } });
  }
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);
  const { rows } = await as("admin", "insert into public.locales (nombre) values ('Centro') returning id");
  ids.Centro = rows[0].id;
  qr = (await as("admin", "select public.qr_token_local($1) as t", [ids.Centro])).rows[0].t;
  await as("admin", "insert into public.empleado_locales (perfil_id, local_id) values ($1, $3), ($2, $3)", [
    ids.ana,
    ids.beto,
    ids.Centro,
  ]);
});

const marcar = (who, tipo) => as(who, "select public.registrar_marcacion($1, $2) as r", [qr, tipo]);
const marcacionesDe = (who) =>
  as("admin", "select id, tipo, registrada_en, anulada, origen, nota from public.marcaciones where perfil_id = $1 order by id", [
    ids[who],
  ]).then((r) => r.rows);
const auditoriaDe = (id) =>
  as(
    "admin",
    "select accion, motivo, realizado_por, datos_anteriores, datos_nuevos from public.auditoria where tabla = 'marcaciones' and registro_id = $1 order by id",
    [String(id)],
  ).then((r) => r.rows);

test("los empleados no pueden usar las funciones de corrección", async () => {
  const { rows } = await marcar("ana", "entrada");
  const id = rows[0].r.id;
  await rejects(as("ana", "select public.anular_marcacion($1, 'me equivoqué')", [id]), /Solo un administrador/);
  await rejects(
    as("ana", "select public.corregir_hora_marcacion($1, now() - interval '1 hour', 'llegué antes')", [id]),
    /Solo un administrador/,
  );
  await rejects(
    as("ana", "select public.agregar_marcacion($1, $2, 'salida', now(), 'me olvidé')", [ids.ana, ids.Centro]),
    /Solo un administrador/,
  );
  await rejects(as("anon", "select public.anular_marcacion($1, 'motivo largo')", [id]), /permission denied/);
  await rejects(as("ana", "select public.preparar_correccion('motivo largo')"), /permission denied/);
  // Y siguen sin poder tocar la tabla directamente.
  await rejects(as("ana", "update public.marcaciones set anulada = true"), /permission denied/);
  await rejects(as("admin", "delete from public.marcaciones"), /permission denied/);
});

test("el motivo es obligatorio", async () => {
  const [m] = await marcacionesDe("ana");
  await rejects(as("admin", "select public.anular_marcacion($1, '  ')", [m.id]), /motivo/);
  await rejects(as("admin", "select public.anular_marcacion($1, null)", [m.id]), /motivo/);
});

test("anular conserva la marcación y deja constancia en la auditoría", async () => {
  const [m] = await marcacionesDe("ana");
  await as("admin", "select public.anular_marcacion($1, '  Prueba del sistema  ')", [m.id]);
  const [anulada] = await marcacionesDe("ana");
  assert.equal(anulada.anulada, true);
  assert.equal(anulada.nota, "Prueba del sistema");

  const [registro] = await auditoriaDe(m.id);
  assert.equal(registro.accion, "UPDATE");
  assert.equal(registro.motivo, "Prueba del sistema");
  assert.equal(registro.realizado_por, ids.admin);
  assert.equal(registro.datos_anteriores.anulada, false);
  assert.equal(registro.datos_nuevos.anulada, true);

  await rejects(as("admin", "select public.anular_marcacion($1, 'otra vez')", [m.id]), /ya estaba anulada/);
  // Con la entrada anulada, la empleada puede volver a marcar entrada.
  await as("postgres", "update public.marcaciones set registrada_en = registrada_en - interval '2 minutes'");
  await marcar("ana", "entrada");
});

test("corregir la hora guarda la hora anterior en la auditoría", async () => {
  const [, m] = await marcacionesDe("ana");
  const nueva = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  await as("admin", "select public.corregir_hora_marcacion($1, $2, 'Llegó a las 9, el celular no tenía señal')", [m.id, nueva]);
  const [, corregida] = await marcacionesDe("ana");
  assert.equal(corregida.registrada_en.toISOString(), nueva);

  const [registro] = await auditoriaDe(m.id);
  assert.equal(new Date(registro.datos_anteriores.registrada_en).toISOString(), m.registrada_en.toISOString());
  assert.equal(registro.motivo, "Llegó a las 9, el celular no tenía señal");

  await rejects(
    as("admin", "select public.corregir_hora_marcacion($1, now() + interval '1 hour', 'en el futuro')", [m.id]),
    /posterior al momento actual/,
  );
});

test("agregar una salida olvidada: queda como carga manual y en la auditoría", async () => {
  const hora = new Date(Date.now() - 3600 * 1000).toISOString();
  const { rows } = await as("admin", "select public.agregar_marcacion($1, $2, 'salida', $3, 'Se olvidó de marcar') as id", [
    ids.ana,
    ids.Centro,
    hora,
  ]);
  const [, , agregada] = await marcacionesDe("ana");
  assert.equal(agregada.id, rows[0].id);
  assert.equal(agregada.origen, "admin");
  assert.equal(agregada.tipo, "salida");

  const [registro] = await auditoriaDe(agregada.id);
  assert.equal(registro.accion, "INSERT");
  assert.equal(registro.motivo, "Se olvidó de marcar");
  assert.equal(registro.realizado_por, ids.admin);

  // Con la salida cargada, la entrada ya no está abierta: puede volver a entrar.
  await marcar("ana", "entrada");
});

test("agregar valida empleado, local y hora", async () => {
  const motivo = "Carga manual de prueba";
  await rejects(
    as("admin", "select public.agregar_marcacion($1, $2, 'entrada', now(), $3)", [ids.admin, ids.Centro, motivo]),
    /no existe/,
  );
  await rejects(
    as("admin", "select public.agregar_marcacion($1, gen_random_uuid(), 'entrada', now(), $2)", [ids.beto, motivo]),
    /local no existe/,
  );
  await rejects(
    as("admin", "select public.agregar_marcacion($1, $2, 'entrada', now() + interval '1 day', $3)", [ids.beto, ids.Centro, motivo]),
    /posterior al momento actual/,
  );
});

test("las marcaciones del propio empleado no generan registros de auditoría", async () => {
  await marcar("beto", "entrada");
  const [m] = await marcacionesDe("beto");
  assert.equal((await auditoriaDe(m.id)).length, 0);
});

test("el empleado no ve la auditoría", async () => {
  const { rows } = await as("ana", "select * from public.auditoria");
  assert.equal(rows.length, 0);
});
