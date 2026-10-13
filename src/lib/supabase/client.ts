import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";

// Cliente para Client Components. Solo usa la clave pública:
// lo que cada usuario puede leer o escribir lo deciden las políticas RLS.
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
