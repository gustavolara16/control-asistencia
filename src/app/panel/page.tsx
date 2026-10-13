import type { Metadata } from "next";
import { Suspense } from "react";
import { logout } from "@/actions/auth";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Panel",
};

// Página provisoria. En la próxima etapa redirigirá al panel de
// administrador o de empleado según el rol guardado en la base de datos.
export default function PanelPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Panel</h1>
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <SessionInfo />
      </Suspense>
    </main>
  );
}

async function SessionInfo() {
  const user = await requireUser();

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-slate-700">
        Sesión iniciada como <span className="font-medium text-slate-900">{user.email ?? "usuario"}</span>.
      </p>
      <p className="text-sm text-slate-500">
        Próximamente: panel de administrador o de empleado según tu rol.
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </form>
    </section>
  );
}
