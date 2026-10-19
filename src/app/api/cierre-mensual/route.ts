import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fechaLocal } from "@/lib/fechas";
import { sumarMeses } from "@/lib/normativa";
import { guardarCierre } from "@/lib/normativa-datos";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

// Cierre mensual automático: lo llama la tarea programada de Netlify
// (netlify/functions/cierre-mensual.mts) el 1° de cada mes. No hay sesión de
// usuario: se autoriza con la clave CIERRE_SECRET, que solo conoce el servidor.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CIERRE_SECRET?.trim();
  if (!secreto || secreto.length < 32) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!isAdminClientConfigured()) return Response.json({ error: "Falta SUPABASE_SECRET_KEY." }, { status: 500 });

  const ahora = new Date();
  const mes = sumarMeses(fechaLocal(ahora).fecha.slice(0, 7), -1);
  // El cliente con la clave secreta lee los datos de todos los empleados.
  const supabase = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>;

  // Si un administrador ya lo guardó a mano, no se pisa.
  const { data: existente, error } = await supabase.from("cierres_mes").select("origen").eq("mes", mes).maybeSingle();
  if (error) return Response.json({ error: "No se pudo leer el cierre." }, { status: 500 });
  if (existente) return Response.json({ mes, resultado: "ya estaba guardado" });

  const empleados = await guardarCierre(supabase, mes, "automatico", ahora);
  console.info(`cierre-mensual: ${mes} guardado (${empleados} empleados con tardanzas)`);
  return Response.json({ mes, resultado: "guardado", empleadosConTardanzas: empleados });
}
