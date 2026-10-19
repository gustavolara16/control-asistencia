-- =============================================================================
-- Avisos (notificaciones) para los administradores cuando un empleado marca.
--
-- - suscripciones_push: cada celular o computadora donde un administrador
--   activó los avisos (datos que entrega el navegador; no son contraseñas).
-- - preferencias_avisos: qué quiere recibir cada administrador.
--
-- Cada administrador solo ve y cambia lo suyo. Los avisos los manda el
-- servidor (con la clave secreta) después de registrar una marcación.
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

create table if not exists public.suscripciones_push (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  dispositivo text not null default '' check (char_length(dispositivo) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists suscripciones_push_perfil_idx on public.suscripciones_push (perfil_id);

create table if not exists public.preferencias_avisos (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  -- todas: cada entrada · tarde: solo las llegadas tarde · ninguna
  entradas text not null default 'todas' check (entradas in ('todas', 'tarde', 'ninguna')),
  salidas boolean not null default false,
  -- null: todos los locales (incluidos los que se creen después)
  locales uuid[] check (locales is null or cardinality(locales) between 1 and 200),
  updated_at timestamptz not null default now()
);

drop trigger if exists preferencias_avisos_updated_at on public.preferencias_avisos;
create trigger preferencias_avisos_updated_at
  before update on public.preferencias_avisos
  for each row execute function public.set_updated_at();

-- Permisos: solo lo necesario, y siempre filtrado por las políticas RLS.
revoke all on public.suscripciones_push, public.preferencias_avisos from public, anon, authenticated;
grant select, delete on public.suscripciones_push to authenticated;
grant insert (perfil_id, endpoint, p256dh, auth, dispositivo) on public.suscripciones_push to authenticated;
grant update (p256dh, auth, dispositivo) on public.suscripciones_push to authenticated;
grant select on public.preferencias_avisos to authenticated;
grant insert (perfil_id, entradas, salidas, locales) on public.preferencias_avisos to authenticated;
grant update (entradas, salidas, locales) on public.preferencias_avisos to authenticated;

alter table public.suscripciones_push enable row level security;
alter table public.preferencias_avisos enable row level security;

drop policy if exists "suscripciones: admin, solo las suyas" on public.suscripciones_push;
create policy "suscripciones: admin, solo las suyas" on public.suscripciones_push
  for all to authenticated
  using (perfil_id = (select auth.uid()) and (select public.es_admin()))
  with check (perfil_id = (select auth.uid()) and (select public.es_admin()));

drop policy if exists "preferencias: admin, solo las suyas" on public.preferencias_avisos;
create policy "preferencias: admin, solo las suyas" on public.preferencias_avisos
  for all to authenticated
  using (perfil_id = (select auth.uid()) and (select public.es_admin()))
  with check (perfil_id = (select auth.uid()) and (select public.es_admin()));
