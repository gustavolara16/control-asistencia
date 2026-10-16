"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const ENLACES = [
  { href: "/admin", texto: "Resumen" },
  { href: "/admin/locales", texto: "Locales" },
  { href: "/admin/empleados", texto: "Empleados" },
];

// La ruta actual solo se conoce al abrir la página: mientras tanto se muestran
// los enlaces sin resaltar.
export function AdminNav() {
  return (
    <Suspense fallback={<Enlaces pathname={null} />}>
      <EnlacesConRuta />
    </Suspense>
  );
}

function EnlacesConRuta() {
  return <Enlaces pathname={usePathname()} />;
}

function Enlaces({ pathname }: { pathname: string | null }) {
  return (
    <nav className="border-b border-slate-200 bg-white print:hidden">
      <ul className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4">
        {ENLACES.map(({ href, texto }) => {
          const activo = pathname !== null && (href === "/admin" ? pathname === href : pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap ${
                  activo
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
