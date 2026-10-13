import type { Metadata } from "next";
import { logout } from "@/actions/auth";

export const metadata: Metadata = {
  title: "Sin acceso",
};

export default function SinAccesoPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Cuenta sin acceso</h1>
        <p className="text-slate-600">
          Tu cuenta está desactivada o todavía no fue habilitada. Consultá con el administrador.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-brand text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
