import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";

export default function Home() {
  const configured = isSupabaseConfigured();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Control de Asistencia</h1>
        <p className="text-slate-600">
          Registrá entradas y salidas del personal y administrá la asistencia de todos los locales
          desde un único panel.
        </p>

        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-lg bg-brand text-base font-semibold text-white transition-colors hover:bg-brand-dark sm:w-48"
        >
          Ingresar
        </Link>

        {!configured && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Falta configurar Supabase: copiá <code>.env.example</code> como <code>.env.local</code> y
            completalo.
          </p>
        )}
      </div>
    </main>
  );
}
