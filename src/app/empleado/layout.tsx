import { AppHeader } from "@/components/app-header";

// El layout no verifica permisos: cada página lo hace con requirePerfil().
export default function EmpleadoLayout({ children }: LayoutProps<"/empleado">) {
  return (
    <>
      <AppHeader titulo="Mi asistencia" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-6">{children}</main>
    </>
  );
}
