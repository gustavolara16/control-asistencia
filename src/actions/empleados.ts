"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { esUuid, leerTexto, type EstadoFormulario } from "@/lib/formularios";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  emailDeUsuario,
  esUsuarioValido,
  LARGO_MINIMO_CONTRASENA,
  normalizarUsuario,
} from "@/lib/usuarios";

const SIN_CLAVE_SECRETA =
  "Falta configurar la clave secreta de Supabase (SUPABASE_SECRET_KEY) para administrar usuarios.";

// Bloqueo "permanente" de la cuenta en Supabase Auth (100 años).
const BLOQUEO_PERMANENTE = "876000h";

function leerNombre(formData: FormData): string | null {
  const nombre = leerTexto(formData, "nombre_completo");
  return nombre && nombre.length <= 120 ? nombre : null;
}

function leerContrasena(formData: FormData): { contrasena: string } | { error: string } {
  const contrasena = String(formData.get("contrasena") ?? "");
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    return { error: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` };
  }
  if (contrasena.length > 72) return { error: "La contraseña es demasiado larga (máximo 72 caracteres)." };
  return { contrasena };
}

function leerLocales(formData: FormData): string[] {
  return [...new Set(formData.getAll("locales").filter(esUuid))];
}

/** Verifica (con RLS) que el perfil exista y sea un empleado. */
async function obtenerEmpleado(perfilId: string) {
  if (!esUuid(perfilId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("id, rol, activo")
    .eq("id", perfilId)
    .eq("rol", "empleado")
    .maybeSingle();
  return data;
}

export async function crearEmpleado(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!isAdminClientConfigured()) return { error: SIN_CLAVE_SECRETA };

  const nombre = leerNombre(formData);
  const usuario = normalizarUsuario(leerTexto(formData, "usuario"));
  const contrasena = leerContrasena(formData);
  const locales = leerLocales(formData);

  if (!nombre) return { error: "El nombre es obligatorio (máximo 120 caracteres)." };
  if (!esUsuarioValido(usuario)) {
    return { error: "El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto, guion o guion bajo." };
  }
  if ("error" in contrasena) return contrasena;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: emailDeUsuario(usuario),
    password: contrasena.contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
    // app_metadata solo lo puede escribir el servidor: de ahí sale el usuario del perfil.
    app_metadata: { usuario },
  });

  if (error || !data.user) {
    if (error?.code === "weak_password") {
      return { error: "La contraseña es demasiado débil. Probá con una más larga." };
    }
    if (error?.code === "email_exists" || error?.code === "user_already_exists") {
      return { error: "Ese usuario ya existe. Elegí otro." };
    }
    console.error("crearEmpleado: error de Supabase Auth", error?.code, error?.message);
    return { error: "No se pudo crear el empleado. Intentá de nuevo." };
  }

  const perfilId = data.user.id;
  // El perfil lo crea un trigger; por las dudas se completa el usuario también acá.
  await admin.from("perfiles").update({ usuario, nombre_completo: nombre }).eq("id", perfilId);

  if (locales.length > 0) {
    const supabase = await createClient();
    await supabase.from("empleado_locales").insert(locales.map((localId) => ({ perfil_id: perfilId, local_id: localId })));
  }

  redirect(`/admin/empleados/${perfilId}`);
}

export async function actualizarNombreEmpleado(
  perfilId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  const nombre = leerNombre(formData);
  if (!nombre) return { error: "El nombre es obligatorio (máximo 120 caracteres)." };
  if (!(await obtenerEmpleado(perfilId))) return { error: "No se encontró el empleado." };

  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ nombre_completo: nombre }).eq("id", perfilId);
  if (error) return { error: "No se pudo guardar el nombre." };

  refresh();
  return { ok: "Nombre guardado." };
}

export async function guardarLocalesEmpleado(
  perfilId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!(await obtenerEmpleado(perfilId))) return { error: "No se encontró el empleado." };

  const elegidos = new Set(leerLocales(formData));
  const supabase = await createClient();
  const { data: actuales, error: errorLectura } = await supabase
    .from("empleado_locales")
    .select("local_id")
    .eq("perfil_id", perfilId);
  if (errorLectura) return { error: "No se pudieron leer los locales asignados." };

  const asignados = new Set((actuales ?? []).map((fila) => fila.local_id as string));
  const quitar = [...asignados].filter((id) => !elegidos.has(id));
  const agregar = [...elegidos].filter((id) => !asignados.has(id));

  if (quitar.length > 0) {
    // Al quitar un local también se borran los turnos del empleado en ese local.
    const { error } = await supabase.from("empleado_locales").delete().eq("perfil_id", perfilId).in("local_id", quitar);
    if (error) return { error: "No se pudieron quitar los locales." };
  }
  if (agregar.length > 0) {
    const { error } = await supabase
      .from("empleado_locales")
      .insert(agregar.map((localId) => ({ perfil_id: perfilId, local_id: localId })));
    if (error) return { error: "No se pudieron asignar los locales." };
  }

  refresh();
  return { ok: "Locales guardados." };
}

export async function restablecerContrasena(
  perfilId: string,
  _prev: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireAdmin();
  if (!isAdminClientConfigured()) return { error: SIN_CLAVE_SECRETA };
  if (!(await obtenerEmpleado(perfilId))) return { error: "No se encontró el empleado." };

  const contrasena = leerContrasena(formData);
  if ("error" in contrasena) return contrasena;

  const { error } = await createAdminClient().auth.admin.updateUserById(perfilId, {
    password: contrasena.contrasena,
  });
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? "La contraseña es demasiado débil. Probá con una más larga."
          : "No se pudo cambiar la contraseña.",
    };
  }
  return { ok: "Contraseña actualizada. Pasásela al empleado." };
}

export async function cambiarEstadoEmpleado(perfilId: string, activo: boolean): Promise<void> {
  await requireAdmin();
  if (!(await obtenerEmpleado(perfilId))) return;

  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", perfilId);
  if (error) throw new Error("No se pudo cambiar el estado del empleado.");

  // Además se bloquea la cuenta en Supabase Auth, para que no pueda ingresar.
  if (isAdminClientConfigured()) {
    await createAdminClient().auth.admin.updateUserById(perfilId, {
      ban_duration: activo ? "none" : BLOQUEO_PERMANENTE,
    });
  }

  refresh();
}
