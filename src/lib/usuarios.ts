// Los empleados ingresan con un "usuario" (ej.: juan.perez). Supabase Auth
// necesita un email, así que se usa uno interno con el dominio reservado
// ".invalid" (RFC 2606): no existe y nunca recibe correos.
// IMPORTANTE: no cambiar este dominio una vez que haya empleados creados.
export const DOMINIO_USUARIOS = "empleados.asistencia.invalid";

const FORMATO_USUARIO = /^[a-z0-9._-]{3,30}$/;

export function normalizarUsuario(valor: string): string {
  return valor.trim().toLowerCase();
}

export function esUsuarioValido(usuario: string): boolean {
  return FORMATO_USUARIO.test(usuario);
}

export function emailDeUsuario(usuario: string): string {
  return `${usuario}@${DOMINIO_USUARIOS}`;
}

// En el login se acepta un usuario (empleados) o un email (administradores).
export function emailParaLogin(identificador: string): string {
  const valor = identificador.trim();
  return valor.includes("@") ? valor : emailDeUsuario(normalizarUsuario(valor));
}

export const LARGO_MINIMO_CONTRASENA = 8;
