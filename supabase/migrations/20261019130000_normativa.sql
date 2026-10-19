-- =============================================================================
-- Normativa de asistencia.
--
-- - normativa: el texto vigente (una sola fila). Lo leen todos; lo cambia un
--   administrador. Cada cambio sube la versión y queda en auditoría.
-- - normativa_lecturas: constancia de que cada empleado leyó una versión.
--   Solo se registra con confirmar_lectura_normativa() (siempre la versión
--   vigente, a nombre de quien confirma) y no se puede modificar ni borrar.
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

create table if not exists public.normativa (
  id smallint primary key default 1 check (id = 1),
  texto text not null check (char_length(btrim(texto)) between 1 and 60000),
  version integer not null default 1,
  actualizada_por uuid references public.perfiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.normativa_lecturas (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  version integer not null,
  leida_en timestamptz not null default now(),
  primary key (perfil_id, version)
);

-- Versión, fecha y autor los pone la base (no se pueden falsear desde la app).
create or replace function public.versionar_normativa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := 1;
  new.version := case when tg_op = 'UPDATE' then old.version + 1 else 1 end;
  new.updated_at := now();
  new.actualizada_por := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists normativa_versionar on public.normativa;
create trigger normativa_versionar
  before insert or update on public.normativa
  for each row execute function public.versionar_normativa();

drop trigger if exists normativa_auditoria on public.normativa;
create trigger normativa_auditoria
  after insert or update on public.normativa
  for each row execute function public.registrar_auditoria();

-- El empleado confirma que leyó la versión vigente.
create or replace function public.confirmar_lectura_normativa()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not exists (select 1 from public.perfiles where id = (select auth.uid()) and activo) then
    raise exception 'Tu cuenta no está activa.';
  end if;
  select version into v_version from public.normativa where id = 1;
  if v_version is null then
    raise exception 'Todavía no hay una normativa publicada.';
  end if;
  insert into public.normativa_lecturas (perfil_id, version)
  values ((select auth.uid()), v_version)
  on conflict (perfil_id, version) do nothing;
  return v_version;
end;
$$;

revoke all on public.normativa, public.normativa_lecturas from public, anon, authenticated;
grant select on public.normativa, public.normativa_lecturas to authenticated;
grant insert (texto), update (texto) on public.normativa to authenticated;

revoke execute on function public.versionar_normativa() from public, anon, authenticated;
revoke execute on function public.confirmar_lectura_normativa() from public, anon;
grant execute on function public.confirmar_lectura_normativa() to authenticated;

alter table public.normativa enable row level security;
alter table public.normativa_lecturas enable row level security;

drop policy if exists "normativa: la ven todos" on public.normativa;
create policy "normativa: la ven todos" on public.normativa
  for select to authenticated
  using (true);

drop policy if exists "normativa: admin crea" on public.normativa;
create policy "normativa: admin crea" on public.normativa
  for insert to authenticated
  with check ((select public.es_admin()));

drop policy if exists "normativa: admin edita" on public.normativa;
create policy "normativa: admin edita" on public.normativa
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

drop policy if exists "lecturas: ver propias o admin" on public.normativa_lecturas;
create policy "lecturas: ver propias o admin" on public.normativa_lecturas
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.es_admin()));
