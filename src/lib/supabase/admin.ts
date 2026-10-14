import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

// Cliente con la clave secreta: IGNORA las políticas RLS.
// Usarlo solo en Server Actions, después de verificar requireAdmin(), y solo
// para lo que la clave pública no puede hacer (crear usuarios, cambiar
// contraseñas, bloquear cuentas). Para leer y escribir datos, usar el cliente
// normal (lib/supabase/server.ts), que respeta las políticas RLS.
export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Falta SUPABASE_SECRET_KEY en .env.local.");
  }
  const { url } = getSupabaseEnv();
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
