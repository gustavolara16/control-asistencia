// Pruebas de la Etapa 7: pedidos de corrección de los empleados.
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
  const { rows } = await as("admin", "insert into public.locales (nombre) values ('Centro'), ('Norte') returning id, nombre");
  for (const r of rows) ids[r.nombre] = r.id;
  qr = (await as("admin", "select public.qr_token_local($1) as t", [ids.Centro])).rows[0].t;
  await as("admin", "insert into public.empleado_locales (perfil_id, local_id) values ($1, $3), ($2, $3)", [
    ids.ana,
    ids.beto,
    ids.Centro,
  ]);
  await as("ana", "select public.registrar_marcacion($1, 'entrada')", [qr]);
  ids.entradaAna = (await as("ana", "select id from public.marcaciones")).rows[0].id;
});

const pedirHora = (who, marcacionId, cuando, motivo = "Llegué antes, falló el GPS") =>
  as(
    who,
    "insert into public.solicitudes_correccion (perfil_id, marcacion_id, fecha_hora_propuesta, motivo) values ($1, $2, $3, $4) returning id",
    [ids[who], marcacionId, cuando, motivo],
  ).then((r) => r.rows[0].id);
const pedirAlta = (who, local, tipo, cuando, motivo = "Me olvidé de marcar") =>
  as(
    who,
    "insert into public.solicitudes_correccion (perfil_id, local_id, tipo, fecha_hora_propuesta, motivo) values ($1, $2, $3, $4, $5) returning id",
    [ids[who], local, tipo, cuando, motivo],
  ).then((r) => r.rows[0].id);
const haceHoras = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test("el pedido valida la hora y no deja duplicar pedidos pendientes", async () => {
  await rejects(pedirHora("ana", ids.entradaAna, new Date(Date.now() + 3600e3).toISOString()), /posterior al momento actual/);
  await rejects(pedirHora("ana", ids.entradaAna, haceHoras(24 * 40)), /últimos 31 días/);
  const id = await pedirHora("ana", ids.entradaAna, haceHoras(1));
  ids.pedidoHora = id;
  await rejects(pedirHora("ana", ids.entradaAna, haceHoras(2)), /Ya hay un pedido pendiente/);
});

test("el empleado no puede pedir en locales donde no trabaja ni resolver pedidos", async () => {
  await rejects(pedirAlta("ana", ids.Norte, "salida", haceHoras(1)), /row-level security/);
  await rejects(as("ana", "select public.resolver_solicitud($1, true)", [ids.pedidoHora]), /Solo un administrador/);
  await rejects(as("anon", "select public.resolver_solicitud($1, true)", [ids.pedidoHora]), /permission denied/);
  await rejects(as("ana", "update public.solicitudes_correccion set estado = 'aprobada'"), /permission denied/);
});

test("aprobar un cambio de hora corrige la marcación y queda auditado", async () => {
  const pedida = (await as("admin", "select fecha_hora_propuesta from public.solicitudes_correccion where id = $1", [ids.pedidoHora]))
    .rows[0].fecha_hora_propuesta;
  await as("admin", "select public.resolver_solicitud($1, true)", [ids.pedidoHora]);

  const { rows } = await as("ana", "select registrada_en, nota from public.marcaciones where id = $1", [ids.entradaAna]);
  assert.equal(rows[0].registrada_en.toISOString(), pedida.toISOString());
  assert.match(rows[0].nota, /^Pedido de corrección #\d+: Llegué antes/);

  const [pedido] = (await as("ana", "select estado, revisada_por from public.solicitudes_correccion where id = $1", [ids.pedidoHora]))
    .rows;
  assert.equal(pedido.estado, "aprobada");
  assert.equal(pedido.revisada_por, ids.admin);

  const auditoria = await as(
    "admin",
    "select tabla, motivo from public.auditoria where (tabla = 'marcaciones' and registro_id = $1) or (tabla = 'solicitudes_correccion' and registro_id = $2) order by id",
    [String(ids.entradaAna), String(ids.pedidoHora)],
  );
  assert.deepEqual(
    auditoria.rows.map((r) => r.tabla),
    ["marcaciones", "solicitudes_correccion"],
  );
  assert.match(auditoria.rows[0].motivo, /Pedido de corrección/);

  await rejects(as("admin", "select public.resolver_solicitud($1, false, 'otra vez')", [ids.pedidoHora]), /ya fue resuelto/);
});

test("aprobar un alta agrega la marcación faltante", async () => {
  const id = await pedirAlta("ana", ids.Centro, "salida", haceHoras(0.5), "Me olvidé de marcar la salida");
  await as("admin", "select public.resolver_solicitud($1, true, 'Ok')", [id]);
  const { rows } = await as("ana", "select tipo, origen from public.marcaciones order by registrada_en");
  assert.deepEqual(
    rows.map((r) => [r.tipo, r.origen]),
    [
      ["entrada", "qr_gps"],
      ["salida", "admin"],
    ],
  );
});

test("rechazar exige una respuesta y no cambia las marcaciones", async () => {
  const id = await pedirAlta("beto", ids.Centro, "entrada", haceHoras(3));
  await rejects(as("admin", "select public.resolver_solicitud($1, false)", [id]), /escribí el motivo/);
  await as("admin", "select public.resolver_solicitud($1, false, 'Ese día no tenías turno')", [id]);
  const [pedido] = (await as("beto", "select estado, respuesta from public.solicitudes_correccion")).rows;
  assert.deepEqual([pedido.estado, pedido.respuesta], ["rechazada", "Ese día no tenías turno"]);
  assert.equal((await as("beto", "select * from public.marcaciones")).rows.length, 0);
});

test("no se puede aprobar el cambio de hora de una marcación anulada", async () => {
  await as("beto", "select public.registrar_marcacion($1, 'entrada')", [qr]);
  const marcacion = (await as("beto", "select id from public.marcaciones")).rows[0].id;
  const id = await pedirHora("beto", marcacion, haceHoras(1));
  await as("admin", "select public.anular_marcacion($1, 'Marcó por error')", [marcacion]);
  await rejects(as("admin", "select public.resolver_solicitud($1, true)", [id]), /fue anulada/);
  await rejects(pedirHora("beto", marcacion, haceHoras(2)), /fue anulada/);
});

test("como máximo 10 pedidos pendientes por empleado", async () => {
  for (let i = 0; i < 10; i++) {
    await pedirAlta("ana", ids.Centro, "entrada", haceHoras(5 + i));
  }
  await rejects(pedirAlta("ana", ids.Centro, "entrada", haceHoras(20)), /10 pedidos pendientes/);
});
