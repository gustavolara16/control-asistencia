import { logout } from "@/actions/auth";

// Encabezado común de las pantallas con sesión iniciada.
export function AppHeader({ titulo }: { titulo: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <p className="font-semibold text-slate-900">
          <span className="text-brand">Asistencia</span>
          <span className="text-slate-400"> · </span>
          {titulo}
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
