import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";

// Muestra el contenido solo a administradores (verificado en el servidor).
export function SoloAdmin({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
      <Verificar>{children}</Verificar>
    </Suspense>
  );
}

async function Verificar({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
