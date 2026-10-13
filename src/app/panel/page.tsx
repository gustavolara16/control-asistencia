import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePerfil } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Panel",
};

// Punto de entrada después del login: lleva a cada uno a su panel según el rol.
export default function PanelPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Suspense fallback={<p className="text-slate-500">Cargando…</p>}>
        <RedirigirSegunRol />
      </Suspense>
    </main>
  );
}

async function RedirigirSegunRol(): Promise<never> {
  const perfil = await requirePerfil();
  redirect(perfil.rol === "admin" ? "/admin" : "/empleado");
}
