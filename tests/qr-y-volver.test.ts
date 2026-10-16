// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { esCodigoQrValido, extraerCodigoQr, urlDeMarcacion } from "../src/lib/qr.ts";
import { esDestinoVolverValido } from "../src/lib/volver.ts";

const CODIGO = "a".repeat(32) + "0123456789abcdef0123456789abcdef";

test("arma y vuelve a leer la dirección del QR", () => {
  const url = urlDeMarcacion("https://asistencia.ejemplo.com", CODIGO);
  assert.equal(url, `https://asistencia.ejemplo.com/marcar?qr=${CODIGO}`);
  assert.equal(extraerCodigoQr(url), CODIGO);
  assert.equal(extraerCodigoQr(`  ${CODIGO}  `), CODIGO);
});

test("ignora QR que no son de un local", () => {
  assert.equal(extraerCodigoQr("https://otro-sitio.com/promo"), null);
  assert.equal(extraerCodigoQr("hola"), null);
  assert.equal(extraerCodigoQr(`https://x.com/marcar?qr=${CODIGO.toUpperCase()}`), null);
  assert.equal(esCodigoQrValido(CODIGO.slice(1)), false);
});

test("después del login solo se puede volver a /marcar", () => {
  assert.equal(esDestinoVolverValido("/marcar"), true);
  assert.equal(esDestinoVolverValido(`/marcar?qr=${CODIGO}`), true);
  for (const malicioso of [
    "https://sitio-malo.com",
    "//sitio-malo.com",
    "/marcar?qr=x&otro=1",
    `/marcar?qr=${CODIGO}#x`,
    "/admin",
    "/marcar/../admin",
    null,
  ]) {
    assert.equal(esDestinoVolverValido(malicioso), false, String(malicioso));
  }
});
