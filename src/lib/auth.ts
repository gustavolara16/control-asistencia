import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
};

// Punto único para obtener el usuario autenticado en el servidor.
// Toda página o acción protegida debe pasar por acá (no confiar solo en el proxy).
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const { sub, email } = data.claims;
  return { id: sub, email: typeof email === "string" ? email : null };
}
