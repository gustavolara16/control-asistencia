import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/env";
import { esDestinoVolverValido } from "@/lib/volver";

// Rutas accesibles sin sesión.
const PUBLIC_PATHS = new Set(["/", "/login"]);

// Renueva la sesión de Supabase en cada request y hace una primera
// redirección según haya o no sesión. Es solo un filtro optimista:
// cada página y acción vuelve a verificar al usuario en el servidor.
export async function updateSession(request: NextRequest) {
  // Sin configuración no hay sesión posible: las rutas protegidas vuelven
  // a la portada, que explica qué falta configurar.
  if (!isSupabaseConfigured()) {
    return PUBLIC_PATHS.has(request.nextUrl.pathname)
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL("/", request.url));
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() valida la firma del token; no usar getSession() para autorizar.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isLoggedIn && !PUBLIC_PATHS.has(pathname)) {
    const destino = `${pathname}${request.nextUrl.search}`;
    const login = esDestinoVolverValido(destino) ? `/login?volver=${encodeURIComponent(destino)}` : "/login";
    return redirectWithCookies(login, request, response);
  }
  if (isLoggedIn && pathname === "/login") {
    return redirectWithCookies("/panel", request, response);
  }

  return response;
}

// Conserva las cookies de sesión renovadas al redirigir.
function redirectWithCookies(path: string, request: NextRequest, response: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}
