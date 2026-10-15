import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/types/db";

export type SessionUser = {
  id: string;
  email: string | null;
};

export type Perfil = SessionUser & {
  nombreCompleto: string;
  rol: Rol;
};

// Punto único para obtener el usuario autenticado en el servidor.
// Toda página o acción protegida debe pasar por acá (no confiar solo en el proxy).
// `cache` evita repetir la verificación dentro de un mismo request.
export const requireUser = cache(async (): Promise<SessionUser> => {
  // La sesión se valida contra la hora actual (vencimiento del token), así que
  // nunca se prepara por adelantado: siempre se evalúa al recibir el pedido.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const { sub, email } = data.claims;
  return { id: sub, email: typeof email === "string" ? email : null };
});

// Usuario autenticado con su perfil activo. Si la cuenta está desactivada
// (o todavía no tiene perfil), lo manda a /sin-acceso.
export const requirePerfil = cache(async (): Promise<Perfil> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perfiles")
    .select("nombre_completo, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar el perfil del usuario.");
  }
  if (!data || !data.activo) {
    redirect("/sin-acceso");
  }

  return { ...user, nombreCompleto: data.nombre_completo, rol: data.rol };
});

export async function requireAdmin(): Promise<Perfil> {
  const perfil = await requirePerfil();
  if (perfil.rol !== "admin") {
    redirect("/empleado");
  }
  return perfil;
}
