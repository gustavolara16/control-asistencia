# Control de Asistencia para Locales

Aplicación web instalable (PWA) para registrar entradas y salidas del personal
de varios locales y administrar la asistencia desde un único panel.

**Tecnologías:** Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Auth + PostgreSQL).

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear un proyecto en [Supabase](https://supabase.com) y copiar la configuración:

   ```bash
   copy .env.example .env.local
   ```

   Completar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (Supabase → Project Settings → API Keys).

3. Levantar el entorno de desarrollo y abrir <http://localhost:3000>:

   ```bash
   npm run dev
   ```

## Scripts

| Comando             | Qué hace                                     |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                       |
| `npm run build`     | Compilación de producción                    |
| `npm run start`     | Sirve la compilación de producción           |
| `npm run lint`      | Revisión de código con ESLint                |
| `npm run typecheck` | Verificación de tipos de TypeScript          |
| `npm run icons`     | Regenera los íconos PNG de la app            |

## Estructura

```
src/
  actions/          Server Actions (login, logout…)
  app/              Rutas (App Router), manifest e íconos
  components/       Componentes reutilizables
  lib/
    auth.ts         requireUser(): verificación del usuario en el servidor
    env.ts          Variables de entorno
    supabase/       Clientes de Supabase (navegador, servidor, proxy)
  proxy.ts          Renueva la sesión y protege rutas
public/             sw.js (service worker), offline.html, íconos
scripts/            Utilidades (generación de íconos)
supabase/           Migraciones SQL (próxima etapa)
```

## Reglas de seguridad del proyecto

- La clave secreta / `service_role` de Supabase **nunca** lleva prefijo `NEXT_PUBLIC_`
  ni se importa desde código de cliente.
- El acceso a los datos se controla con políticas **RLS** en Supabase.
- El proxy solo hace una redirección optimista; cada página y acción protegida
  verifica al usuario en el servidor con `requireUser()`.
- La fecha y hora de las marcaciones la genera el servidor/base de datos, nunca el celular.
- El service worker no guarda en caché páginas autenticadas ni datos de asistencia.
