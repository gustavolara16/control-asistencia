// Tarea programada de Netlify: el 1° de cada mes a las 12:00 UTC (09:00 en
// Buenos Aires) guarda el cierre de tardanzas del mes anterior. Solo llama a
// la app; el cálculo lo hace /api/cierre-mensual.
export default async function cierreMensual() {
  const sitio = process.env.URL;
  const secreto = process.env.CIERRE_SECRET;
  if (!sitio || !secreto) {
    console.error("cierre-mensual: falta URL o CIERRE_SECRET");
    return;
  }
  const respuesta = await fetch(`${sitio}/api/cierre-mensual`, {
    method: "POST",
    headers: { authorization: `Bearer ${secreto}` },
  });
  console.log("cierre-mensual:", respuesta.status, await respuesta.text());
}

export const config = { schedule: "0 12 1 * *" };
