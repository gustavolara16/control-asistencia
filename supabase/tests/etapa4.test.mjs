// Pruebas de la Etapa 4: marcación con QR + GPS.
// Uso: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, rejects } from "./helpers.mjs";

let as;
let ids;
const qr = {};

// Coordenadas del local "Centro" y puntos de prueba.
const CENTRO = { lat: -34.6037, lon: -58.3816 };
const A_30_M = { lat: -34.60343, lon: -58.3816 }; // ~30 m al norte
const A_1_KM = { lat: -34.5947, lon: -58.3816 }; // ~1 km al norte

before(async () => {
  const base = await crearBase();
  ({ as, ids } = base);

  await base.crearUsuario("admin");
  for (const nombre of ["ana", "beto", "carla"]) {
    await base.crearUsuario(nombre, { appMeta: { usuario: nombre } });
  }
  await as("postgres", "update public.perfiles set rol = 'admin' where id = $1", [ids.admin]);

  const { rows } = await as(
    "admin",
    `insert into public.locales (nombre, latitud, longitud, radio_metros)
     values ('Centro', $1, $2, 100), ('Norte', -34.55, -58.45, 100), ('SinGPS', null, null, 100)
     returning id, nombre`,
    [CENTRO.lat, CENTRO.lon],
  );
  for (const r of rows) ids[r.nombre] = r.id;
  for (const nombre of ["Centro", "Norte", "SinGPS"]) {
    qr[nombre] = (await as("admin", "select public.qr_token_local($1) as t", [ids[nombre]])).rows[0].t;
  }

  await as(
    "admin",
    `insert into public.empleado_locales (perfil_id, local_id)
     values ($1, $4), ($1, $5), ($2, $4), ($3, $6)`,
    [ids.ana, ids.beto, ids.carla, ids.Centro, ids.Norte, ids.SinGPS],
  );
});

const marcar = (who, token, tipo, punto = CENTRO, precision = 20) =>
  as(who, "select public.registrar_marcacion($1, $2, $3, $4, $5) as r", [token, tipo, punto?.lat, punto?.lon, precision]);

// Mueve las marcaciones de alguien al pasado (para simular el paso del tiempo).
const retroceder = (who, intervalo) =>
  as("postgres", `update public.marcaciones set registrada_en = registrada_en - interval '${intervalo}' where perfil_id = $1`, [
    ids[who],
  ]);

test("los empleados no pueden leer el código QR; el admin sí", async () => {
  await rejects(as("ana", "select qr_token from public.locales"), /permission denied/);
  await rejects(as("ana", "select * from public.locales"), /permission denied/);
  await rejects(as("ana", "select public.qr_token_local($1)", [ids.Centro]), /Solo un administrador/);
  const { rows } = await as("ana", "select id, nombre from public.locales order by nombre");
  assert.deepEqual(rows.map((r) => r.nombre), ["Centro", "Norte"]);
  assert.match(qr.Centro, /^[0-9a-f]{64}$/);
});

test("los empleados no pueden modificar el código QR", async () => {
  await rejects(as("admin", "update public.locales set qr_token = 'x'"), /permission denied/);
  await rejects(as("ana", "select public.regenerar_qr_local($1)", [ids.Centro]), /Solo un administrador/);
});

test("marca entrada dentro del radio, con la hora del servidor", async () => {
  const { rows } = await marcar("ana", qr.Centro, "entrada", A_30_M);
  const r = rows[0].r;
  assert.equal(r.tipo, "entrada");
  assert.equal(r.local, "Centro");
  assert.ok(r.distancia_metros >= 25 && r.distancia_metros <= 35, `distancia ${r.distancia_metros}`);
  const m = (await as("ana", "select origen, dentro_del_radio, creada_por, registrada_en from public.marcaciones")).rows[0];
  assert.equal(m.origen, "qr_gps");
  assert.equal(m.dentro_del_radio, true);
  assert.equal(m.creada_por, ids.ana);
  assert.ok(Math.abs(new Date(m.registrada_en).getTime() - Date.now()) < 60_000);
});

test("no permite dos marcaciones en menos de un minuto", async () => {
  await rejects(marcar("ana", qr.Centro, "salida"), /menos de un minuto/);
});

test("no permite una segunda entrada sin salida", async () => {
  await retroceder("ana", "2 hours");
  await rejects(marcar("ana", qr.Centro, "entrada"), /entrada registrada sin salida/);
});

test("la salida debe ser en el mismo local que la entrada", async () => {
  await rejects(marcar("ana", qr.Norte, "salida", { lat: -34.55, lon: -58.45 }), /otro local/);
});

test("marca la salida", async () => {
  const { rows } = await marcar("ana", qr.Centro, "salida");
  assert.equal(rows[0].r.tipo, "salida");
});

test("no permite salida sin entrada abierta", async () => {
  await retroceder("ana", "2 hours");
  await rejects(marcar("ana", qr.Centro, "salida"), /No tenés una entrada abierta/);
});

test("una entrada olvidada de hace más de 18 h no bloquea la siguiente", async () => {
  await marcar("ana", qr.Centro, "entrada");
  await retroceder("ana", "20 hours");
  const { rows } = await marcar("ana", qr.Centro, "entrada");
  assert.equal(rows[0].r.tipo, "entrada");
});

test("rechaza marcar lejos del local", async () => {
  await rejects(marcar("beto", qr.Centro, "entrada", A_1_KM), /Estás a \d+ m del local Centro/);
});

test("rechaza si falta la ubicación o es muy imprecisa", async () => {
  await rejects(marcar("beto", qr.Centro, "entrada", null), /Necesitamos tu ubicación/);
  await rejects(marcar("beto", qr.Centro, "entrada", CENTRO, 800), /muy imprecisa/);
});

test("el margen por imprecisión del GPS tiene un tope", async () => {
  // A 150 m con precisión ±60 m: 150 <= 100 + 60 → se acepta.
  const a150 = { lat: -34.60235, lon: -58.3816 };
  const { rows } = await marcar("beto", qr.Centro, "entrada", a150, 60);
  assert.equal(rows[0].r.tipo, "entrada");
});

test("rechaza QR inválido y locales no asignados", async () => {
  await rejects(marcar("carla", "0".repeat(64), "entrada"), /QR no es válido/);
  await rejects(marcar("carla", qr.Centro, "entrada"), /No estás asignado al local Centro/);
});

test("un local sin coordenadas no exige ubicación", async () => {
  const { rows } = await marcar("carla", qr.SinGPS, "entrada", null);
  assert.equal(rows[0].r.tipo, "entrada");
});

test("un local desactivado no acepta marcaciones", async () => {
  await as("admin", "update public.locales set activo = false where id = $1", [ids.SinGPS]);
  await retroceder("carla", "2 hours");
  await rejects(marcar("carla", qr.SinGPS, "salida", null), /QR no es válido/);
});

test("una cuenta desactivada no puede marcar", async () => {
  await as("admin", "update public.perfiles set activo = false where id = $1", [ids.beto]);
  await retroceder("beto", "2 hours");
  await rejects(marcar("beto", qr.Centro, "salida"), /desactivada/);
});

test("al regenerar el QR, el anterior deja de servir", async () => {
  const anterior = qr.Centro;
  const nuevo = (await as("admin", "select public.regenerar_qr_local($1) as t", [ids.Centro])).rows[0].t;
  assert.notEqual(nuevo, anterior);
  await retroceder("ana", "2 hours");
  await rejects(marcar("ana", anterior, "salida"), /QR no es válido/);
  assert.equal((await marcar("ana", nuevo, "salida")).rows[0].r.tipo, "salida");
});

test("anon no puede marcar", async () => {
  await rejects(as("anon", "select public.registrar_marcacion('x', 'entrada')"), /permission denied/);
});
