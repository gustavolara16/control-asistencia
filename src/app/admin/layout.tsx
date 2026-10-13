import { AppHeader } from "@/components/app-header";

// El layout no verifica permisos: cada página lo hace con requireAdmin().
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <AppHeader titulo="Administración" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </>
  );
}
