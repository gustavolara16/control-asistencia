// Después de ingresar, se puede volver a la pantalla de marcar (por ejemplo,
// si el empleado escaneó el QR sin tener la sesión iniciada).
// Solo se acepta ese destino exacto, para que el login no pueda usarse para
// redirigir a otros sitios.
const DESTINO_PERMITIDO = /^\/marcar(\?qr=[0-9a-f]{64})?$/;

export function esDestinoVolverValido(valor: unknown): valor is string {
  return typeof valor === "string" && DESTINO_PERMITIDO.test(valor);
}
