export function AvisoClaveSecreta() {
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Para crear empleados, cambiar contraseñas y bloquear cuentas falta configurar la clave secreta de
      Supabase (<code>SUPABASE_SECRET_KEY</code>) en el archivo <code>.env.local</code>.
    </p>
  );
}
