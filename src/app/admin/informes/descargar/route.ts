import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fechaLocal } from "@/lib/fechas";
import { esUuid } from "@/lib/formularios";
import { generarCsv, leerPeriodo } from "@/lib/informes";
import { cargarInforme, planillaDetalle, planillaResumen } from "@/lib/informes-datos";
import { createClient } from "@/lib/supabase/server";

// Descarga del informe como planilla (CSV que abre Excel).
export async function GET(request: NextRequest) {
  await requireAdmin();
  const parametros = request.nextUrl.searchParams;
  const ahora = new Date();
  const { desde, hasta } = leerPeriodo(parametros.get("desde"), parametros.get("hasta"), fechaLocal(ahora).fecha);
  const local = parametros.get("local");
  const detalle = parametros.get("tipo") === "detalle";

  const supabase = await createClient();
  const informe = await cargarInforme(supabase, { desde, hasta, localId: esUuid(local) ? local : null, ahora });
  const csv = generarCsv(detalle ? planillaDetalle(informe) : planillaResumen(informe));
  const nombre = `asistencia-${detalle ? "detalle" : "resumen"}-${desde}-a-${hasta}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
