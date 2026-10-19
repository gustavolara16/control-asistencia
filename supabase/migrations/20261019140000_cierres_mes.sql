-- =============================================================================
-- Cierre mensual de tardanzas (Art. 32 de la normativa).
--
-- El 1° de cada mes se guarda el resultado del mes anterior: tardanzas por
-- empleado, sus días y la sanción que correspondía. Queda fijo aunque después
-- cambien los horarios. Un administrador puede volver a guardarlo (por
-- ejemplo, después de aprobar una corrección).
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

create table if not exists public.cierres_mes (
  mes text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  origen text not null check (origen in ('automatico', 'manual')),
  -- null cuando lo guardó el sistema automáticamente
  guardado_por uuid references public.perfiles (id) on delete set null,
  guardado_en timestamptz not null default now()
);

create table if not exists public.cierres_tardanzas (
  mes text not null references public.cierres_mes (mes) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  tardanzas integer not null check (tardanzas > 0),
  minutos_tarde integer not null check (minutos_tarde >= 0),
  -- [{ "fecha": "AAAA-MM-DD", "minutos": 12, "local_id": "…" }, …]
  detalle jsonb not null check (jsonb_typeof(detalle) = 'array'),
  sancion text check (char_length(sancion) <= 200),
  primary key (mes, perfil_id)
);

-- Guarda (o reemplaza) el cierre de un mes en una sola operación. Corre con
-- los permisos de quien la llama: un administrador (RLS) o el servidor.
create or replace function public.guardar_cierre_mes(p_mes text, p_filas jsonb, p_origen text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_cantidad integer;
begin
  if p_origen not in ('automatico', 'manual') then
    raise exception 'Origen de cierre inválido.';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Datos de cierre inválidos.';
  end if;

  insert into public.cierres_mes (mes, origen, guardado_por, guardado_en)
  values (p_mes, p_origen, (select auth.uid()), now())
  on conflict (mes) do update
    set origen = excluded.origen, guardado_por = excluded.guardado_por, guardado_en = excluded.guardado_en;

  delete from public.cierres_tardanzas where mes = p_mes;
  insert into public.cierres_tardanzas (mes, perfil_id, tardanzas, minutos_tarde, detalle, sancion)
  select p_mes, (f ->> 'perfil_id')::uuid, (f ->> 'tardanzas')::integer, (f ->> 'minutos_tarde')::integer,
         f -> 'detalle', nullif(f ->> 'sancion', '')
  from jsonb_array_elements(p_filas) as f;

  get diagnostics v_cantidad = row_count;
  return v_cantidad;
end;
$$;

revoke all on public.cierres_mes, public.cierres_tardanzas from public, anon, authenticated;
grant select, insert, delete on public.cierres_mes, public.cierres_tardanzas to authenticated;
grant update (origen, guardado_por, guardado_en) on public.cierres_mes to authenticated;

revoke execute on function public.guardar_cierre_mes(text, jsonb, text) from public, anon;
grant execute on function public.guardar_cierre_mes(text, jsonb, text) to authenticated;

-- El cierre automático lo guarda el servidor con la clave secreta (rol service_role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.cierres_mes, public.cierres_tardanzas to service_role;
    grant execute on function public.guardar_cierre_mes(text, jsonb, text) to service_role;
  end if;
end;
$$;

alter table public.cierres_mes enable row level security;
alter table public.cierres_tardanzas enable row level security;

drop policy if exists "cierres_mes: solo admin" on public.cierres_mes;
create policy "cierres_mes: solo admin" on public.cierres_mes
  for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

drop policy if exists "cierres_tardanzas: solo admin" on public.cierres_tardanzas;
create policy "cierres_tardanzas: solo admin" on public.cierres_tardanzas
  for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
