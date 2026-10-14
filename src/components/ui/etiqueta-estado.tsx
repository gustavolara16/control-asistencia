export function EtiquetaEstado({ activo }: { activo: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
