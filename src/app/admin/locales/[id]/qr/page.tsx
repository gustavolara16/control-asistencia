import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { regenerarQrLocal } from "@/actions/locales";
import { claseTarjeta } from "@/components/ui/estilos";
import { esUrlLocal, obtenerUrlApp } from "@/lib/app-url";
import { requireAdmin } from "@/lib/auth";
import { esUuid } from "@/lib/formularios";
import { urlDeMarcacion } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import { BotonImprimir, BotonRegenerar } from "./botones";

export const metadata: Metadata = {
  title: "Código QR del local",
};

export default function QrLocalPage({ params }: PageProps<"/admin/locales/[id]/qr">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      {params.then(({ id }) => (
        <QrLocal id={id} />
      ))}
    </Suspense>
  );
}

async function QrLocal({ id }: { id: string }) {
  await requireAdmin();
  if (!esUuid(id)) notFound();

  const supabase = await createClient();
  const [localRes, codigoRes] = await Promise.all([
    supabase.from("locales").select("id, nombre, activo, latitud").eq("id", id).maybeSingle(),
    supabase.rpc("qr_token_local", { p_local_id: id }),
  ]);
  if (localRes.error || codigoRes.error) throw new Error("No se pudo cargar el código QR.");
  if (!localRes.data || !codigoRes.data) notFound();

  const local = localRes.data as { id: string; nombre: string; activo: boolean; latitud: number | null };
  const urlApp = await obtenerUrlApp();
  const direccion = urlDeMarcacion(urlApp, codigoRes.data as string);
  // SVG generado en el servidor a partir de nuestra propia dirección.
  const svg = await QRCode.toString(direccion, { type: "svg", errorCorrectionLevel: "M", margin: 1 });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/locales/${local.id}`} className="text-sm text-brand hover:underline">
          ← Volver a {local.nombre}
        </Link>
        <BotonImprimir />
      </div>

      {esUrlLocal(urlApp) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          <strong>Todavía no lo imprimas:</strong> este QR apunta a <code>{urlApp}</code>, que solo funciona en esta
          computadora. Cuando la app esté publicada en internet, este código va a apuntar a la dirección definitiva.
        </p>
      )}
      {!local.activo && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          Este local está desactivado: el QR no va a funcionar hasta que lo actives.
        </p>
      )}
      {local.latitud == null && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          Este local no tiene ubicación cargada: se va a poder marcar sin verificar la distancia.
        </p>
      )}

      {/* Hoja para imprimir y pegar en el local. */}
      <section
        className={`${claseTarjeta} mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center print:max-w-none print:border-0 print:shadow-none`}
      >
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">Control de asistencia</p>
        <h1 className="text-3xl font-bold text-slate-900">{local.nombre}</h1>
        <div className="w-full max-w-xs" dangerouslySetInnerHTML={{ __html: svg }} />
        <ol className="flex flex-col gap-1 text-left text-sm text-slate-700">
          <li>1. Abrí la cámara del celular (o el botón “Marcar” de la app).</li>
          <li>2. Apuntá a este código y tocá el enlace.</li>
          <li>3. Tocá “Marcar ENTRADA” o “Marcar SALIDA”.</li>
        </ol>
      </section>

      <section className={`${claseTarjeta} flex max-w-2xl flex-col gap-3 print:hidden`}>
        <h2 className="font-semibold text-slate-900">¿Se filtró una foto del QR?</h2>
        <p className="text-sm text-slate-600">
          Podés generar un código nuevo. El QR impreso actual <strong>deja de funcionar</strong> y vas a tener que
          imprimir y pegar el nuevo.
        </p>
        <form action={regenerarQrLocal.bind(null, local.id)}>
          <BotonRegenerar />
        </form>
      </section>
    </>
  );
}
