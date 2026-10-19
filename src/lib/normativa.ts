// Normativa de asistencia: formato del texto y escala de sanciones por
// llegadas tarde (Art. 32). Sin acceso a la base, para poder probarlo.

/**
 * Bloques del texto. Formato (pensado para escribirlo a mano):
 * - "## Título" → título de sección.
 * - Líneas que empiezan con "|" → tabla ("| A | B |"; la primera fila es el encabezado).
 * - Cualquier otra línea → párrafo. Si empieza con "Artículo N. (Nombre)", eso va resaltado.
 */
export type BloqueNormativa =
  | { tipo: "titulo"; texto: string }
  | { tipo: "parrafo"; destacado: string | null; texto: string }
  | { tipo: "tabla"; encabezado: string[]; filas: string[][] };

const ARTICULO = /^(Art[íi]culo\s+\d+[°º]?\.?\s*(?:\([^)]*\))?)\s*(.*)$/i;

export function parsearNormativa(texto: string): BloqueNormativa[] {
  const bloques: BloqueNormativa[] = [];
  let tabla: string[][] | null = null;

  const cerrarTabla = () => {
    if (tabla && tabla.length > 0) bloques.push({ tipo: "tabla", encabezado: tabla[0], filas: tabla.slice(1) });
    tabla = null;
  };

  for (const original of texto.split(/\r?\n/)) {
    const linea = original.trim();
    if (linea.startsWith("|")) {
      const celdas = linea.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (celdas.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separador "|---|---|"
      (tabla ??= []).push(celdas);
      continue;
    }
    cerrarTabla();
    if (linea === "") continue;
    if (linea.startsWith("#")) {
      bloques.push({ tipo: "titulo", texto: linea.replace(/^#+\s*/, "") });
      continue;
    }
    const articulo = ARTICULO.exec(linea);
    bloques.push(
      articulo && articulo[2]
        ? { tipo: "parrafo", destacado: articulo[1], texto: articulo[2] }
        : { tipo: "parrafo", destacado: null, texto: linea },
    );
  }
  cerrarTabla();
  return bloques;
}

/** Escala del Art. 32: tardanzas injustificadas en el mes calendario. */
export const ESCALA_TARDANZAS = [
  { desde: 2, sancion: "Llamado de atención por escrito" },
  { desde: 3, sancion: "Apercibimiento con constancia en el legajo" },
  { desde: 4, sancion: "Suspensión de un (1) día" },
  { desde: 5, sancion: "Suspensión de dos (2) a tres (3) días" },
] as const;

/** Sanción que corresponde según la cantidad de tardanzas del mes (null si ninguna). */
export function sancionPorTardanzas(tardanzas: number): string | null {
  let sancion: string | null = null;
  for (const escalon of ESCALA_TARDANZAS) if (tardanzas >= escalon.desde) sancion = escalon.sancion;
  return sancion;
}

/** Próximo escalón de la escala (null si ya está en el último). */
export function proximaSancion(tardanzas: number): { desde: number; sancion: string } | null {
  return ESCALA_TARDANZAS.find((e) => e.desde > tardanzas) ?? null;
}

/** Primer y último día de un mes "AAAA-MM" ("AAAA-MM-DD"). */
export function diasDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function esMesValido(mes: unknown): mes is string {
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Mes anterior o siguiente ("AAAA-MM"). */
export function sumarMeses(mes: string, meses: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 1 + meses, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function nombreDelMes(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return `${MESES[numero - 1]} de ${anio}`;
}
