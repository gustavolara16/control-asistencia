"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailParaLogin } from "@/lib/usuarios";

export type LoginState = {
  error?: string;
  usuario?: string;
};

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Ingresá tu usuario y tu contraseña.", usuario };
  }
  if (!isSupabaseConfigured()) {
    return { error: "El sistema todavía no está configurado.", usuario };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: emailParaLogin(usuario), password });

  if (error) {
    // Mensaje genérico: no revelar si el usuario existe ni si está bloqueado.
    return { error: "Usuario o contraseña incorrectos.", usuario };
  }

  redirect("/panel");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
