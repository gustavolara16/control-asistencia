-- =============================================================================
-- Etapa 2 · Esquema inicial: perfiles, locales, horarios, marcaciones,
-- solicitudes de corrección y auditoría, con seguridad a nivel de fila (RLS).
--
-- Fechas: se guardan en UTC (timestamptz). La zona horaria del negocio es
-- America/Argentina/Buenos_Aires y se aplica al mostrar y al calcular.
--
-- Cómo aplicarla: Supabase → SQL Editor → New query → pegar todo → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'empleado');
create type public.tipo_marcacion as enum ('entrada', 'salida');
create type public.estado_solicitud as enum ('pendiente', 'aprobada', 'rechazada');

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

-- Un perfil por cada usuario de Supabase Auth (empleados y administradores).
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null default '' check (char_length(nombre_completo) <= 120),
  rol public.rol_usuario not null default 'empleado',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(nombre) between 1 and 80),
  direccion text check (char_length(direccion) <= 200),
  latitud double precision check (latitud between -90 and 90),
  longitud double precision check (longitud between -180 and 180),
  -- Distancia máxima (en metros) para considerar que la marcación se hizo en el local.
  radio_metros integer not null default 100 check (radio_metros between 10 and 2000),
  -- Minutos de tolerancia antes de considerar una llegada como tardanza.
  tolerancia_minutos integer not null default 10 check (tolerancia_minutos between 0 and 120),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitud is null) = (longitud is null))
);

-- Qué empleados trabajan en qué locales (un empleado puede tener varios).
create table public.empleado_locales (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (perfil_id, local_id)
);
create index empleado_locales_local_idx on public.empleado_locales (local_id);

-- Turnos semanales. Un día sin turnos es día de descanso.
-- Se permiten varios turnos por día (turno cortado). Si hora_salida es menor
-- que hora_entrada, el turno termina al día siguiente.
-- Solo se puede asignar un turno en un local al que el empleado está asignado.
create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null,
  local_id uuid not null,
  dia_semana smallint not null check (dia_semana between 1 and 7), -- 1 = lunes … 7 = domingo
  hora_entrada time not null,
  hora_salida time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hora_entrada <> hora_salida),
  foreign key (perfil_id, local_id) references public.empleado_locales (perfil_id, local_id) on delete cascade
);
create index horarios_perfil_dia_idx on public.horarios (perfil_id, dia_semana);
create index horarios_local_idx on public.horarios (local_id);

-- Entradas y salidas. La hora la genera la base de datos, nunca el celular.
-- Nadie las inserta, modifica ni borra directamente: solo a través de
-- funciones del servidor que validan las reglas (próximas etapas).
create table public.marcaciones (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete restrict,
  local_id uuid not null references public.locales (id) on delete restrict,
  tipo public.tipo_marcacion not null,
  -- Momento de la marcación (un administrador puede corregirlo; queda en auditoría).
  registrada_en timestamptz not null default now(),
  -- 'qr_gps': la hizo el empleado; 'admin': la cargó un administrador.
  origen text not null check (origen in ('qr_gps', 'admin')),
  -- Señal de ubicación informada por el celular (orientativa, no infalible).
  latitud double precision check (latitud between -90 and 90),
  longitud double precision check (longitud between -180 and 180),
  precision_metros real check (precision_metros >= 0),
  distancia_metros real check (distancia_metros >= 0),
  dentro_del_radio boolean,
  anulada boolean not null default false,
  nota text check (char_length(nota) <= 500),
  creada_por uuid references public.perfiles (id) on delete set null,
  -- Momento real en que se guardó el registro (no cambia nunca).
  created_at timestamptz not null default now()
);
create index marcaciones_perfil_fecha_idx on public.marcaciones (perfil_id, registrada_en desc);
create index marcaciones_local_fecha_idx on public.marcaciones (local_id, registrada_en desc);

-- Pedidos de corrección hechos por los empleados.
-- Con marcacion_id: corregir una marcación existente.
-- Sin marcacion_id: agregar una marcación que faltó (requiere tipo y local).
create table public.solicitudes_correccion (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete restrict,
  marcacion_id bigint references public.marcaciones (id) on delete restrict,
  local_id uuid references public.locales (id) on delete restrict,
  tipo public.tipo_marcacion,
  fecha_hora_propuesta timestamptz not null,
  motivo text not null check (char_length(motivo) between 5 and 500),
  estado public.estado_solicitud not null default 'pendiente',
  revisada_por uuid references public.perfiles (id) on delete set null,
  revisada_en timestamptz,
  respuesta text check (char_length(respuesta) <= 500),
  created_at timestamptz not null default now(),
  check (marcacion_id is not null or (tipo is not null and local_id is not null))
);
create index solicitudes_perfil_idx on public.solicitudes_correccion (perfil_id, created_at desc);
create index solicitudes_estado_idx on public.solicitudes_correccion (estado, created_at desc);

-- Historial de cambios. Solo lo escriben los triggers; nadie puede editarlo.
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  -- Usuario que hizo el cambio (null si se hizo desde el panel de Supabase).
  realizado_por uuid,
  realizado_en timestamptz not null default now(),
  motivo text
);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id, realizado_en desc);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- ¿El usuario actual es un administrador activo?
create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and rol = 'admin' and activo
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Crea el perfil de cada usuario nuevo. El rol SIEMPRE empieza como 'empleado':
-- nunca se toma de los metadatos, porque el usuario podría manipularlos.
create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre_completo)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 120)
  );
  return new;
end;
$$;

-- Impide dejar el sistema sin ningún administrador activo.
create function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (
       select 1 from public.perfiles
       where rol = 'admin' and activo and id <> old.id
     ) then
    raise exception 'Debe quedar al menos un administrador activo.';
  end if;
  return new;
end;
$$;

-- Registra cada cambio en la tabla auditoria. Las funciones que corrijan
-- datos pueden indicar el motivo con: set_config('app.motivo', '...', true).
create function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.auditoria (
    tabla, registro_id, accion, datos_anteriores, datos_nuevos, realizado_por, motivo
  ) values (
    tg_table_name,
    coalesce(fila ->> 'id', concat_ws(':', fila ->> 'perfil_id', fila ->> 'local_id')),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    (select auth.uid()),
    nullif(current_setting('app.motivo', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger crear_perfil_al_registrar
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.set_updated_at();
create trigger locales_updated_at before update on public.locales
  for each row execute function public.set_updated_at();
create trigger horarios_updated_at before update on public.horarios
  for each row execute function public.set_updated_at();

create trigger perfiles_proteger_ultimo_admin before update on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

create trigger perfiles_auditoria after update on public.perfiles
  for each row execute function public.registrar_auditoria();
create trigger locales_auditoria after insert or update or delete on public.locales
  for each row execute function public.registrar_auditoria();
create trigger empleado_locales_auditoria after insert or delete on public.empleado_locales
  for each row execute function public.registrar_auditoria();
create trigger horarios_auditoria after insert or update or delete on public.horarios
  for each row execute function public.registrar_auditoria();
create trigger marcaciones_auditoria after update or delete on public.marcaciones
  for each row execute function public.registrar_auditoria();
create trigger solicitudes_auditoria after update or delete on public.solicitudes_correccion
  for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- Permisos: los visitantes sin sesión (anon) no acceden a nada; los usuarios
-- con sesión (authenticated) solo a lo que habilitan las políticas RLS.
-- -----------------------------------------------------------------------------
revoke all on public.perfiles, public.locales, public.empleado_locales, public.horarios,
  public.marcaciones, public.solicitudes_correccion, public.auditoria
  from anon, authenticated;

grant select on public.perfiles, public.locales, public.empleado_locales, public.horarios,
  public.marcaciones, public.solicitudes_correccion, public.auditoria
  to authenticated;

-- Del perfil solo se pueden cambiar estas columnas (y solo un admin, por RLS).
grant update (nombre_completo, rol, activo) on public.perfiles to authenticated;
grant insert, update on public.locales to authenticated;
grant insert, delete on public.empleado_locales to authenticated;
grant insert, update, delete on public.horarios to authenticated;
-- El empleado solo puede completar estas columnas al pedir una corrección;
-- estado, revisión y fechas los controla el sistema.
grant insert (perfil_id, marcacion_id, local_id, tipo, fecha_hora_propuesta, motivo)
  on public.solicitudes_correccion to authenticated;
-- marcaciones y auditoria: sin permisos de escritura para nadie desde la app.

revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;
revoke execute on function public.set_updated_at(), public.crear_perfil_nuevo_usuario(),
  public.proteger_ultimo_admin(), public.registrar_auditoria()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- -----------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.locales enable row level security;
alter table public.empleado_locales enable row level security;
alter table public.horarios enable row level security;
alter table public.marcaciones enable row level security;
alter table public.solicitudes_correccion enable row level security;
alter table public.auditoria enable row level security;

-- perfiles: cada uno ve el suyo; el admin ve y edita todos.
create policy "perfiles: ver propio o admin" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));
create policy "perfiles: admin edita" on public.perfiles
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- locales: el empleado ve los locales activos donde trabaja; el admin, todos.
create policy "locales: ver asignados o admin" on public.locales
  for select to authenticated
  using (
    (select public.es_admin())
    or (activo and exists (
      select 1 from public.empleado_locales el
      where el.local_id = locales.id and el.perfil_id = (select auth.uid())
    ))
  );
create policy "locales: admin crea" on public.locales
  for insert to authenticated
  with check ((select public.es_admin()));
create policy "locales: admin edita" on public.locales
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- empleado_locales
create policy "empleado_locales: ver propias o admin" on public.empleado_locales
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.es_admin()));
create policy "empleado_locales: admin asigna" on public.empleado_locales
  for insert to authenticated
  with check ((select public.es_admin()));
create policy "empleado_locales: admin quita" on public.empleado_locales
  for delete to authenticated
  using ((select public.es_admin()));

-- horarios
create policy "horarios: ver propios o admin" on public.horarios
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.es_admin()));
create policy "horarios: admin crea" on public.horarios
  for insert to authenticated
  with check ((select public.es_admin()));
create policy "horarios: admin edita" on public.horarios
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
create policy "horarios: admin borra" on public.horarios
  for delete to authenticated
  using ((select public.es_admin()));

-- marcaciones: solo lectura (propias o admin). Las escrituras llegarán
-- mediante funciones del servidor que validan identidad, QR, GPS y horario.
create policy "marcaciones: ver propias o admin" on public.marcaciones
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.es_admin()));

-- solicitudes_correccion: el empleado crea y ve las suyas; el admin ve todas.
-- La resolución (aprobar/rechazar) se hará con una función del servidor.
create policy "solicitudes: ver propias o admin" on public.solicitudes_correccion
  for select to authenticated
  using (perfil_id = (select auth.uid()) or (select public.es_admin()));
create policy "solicitudes: empleado crea las suyas" on public.solicitudes_correccion
  for insert to authenticated
  with check (
    perfil_id = (select auth.uid())
    and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo)
    and (marcacion_id is null or exists (
      select 1 from public.marcaciones m
      where m.id = solicitudes_correccion.marcacion_id and m.perfil_id = (select auth.uid())
    ))
    and (local_id is null or exists (
      select 1 from public.empleado_locales el
      where el.local_id = solicitudes_correccion.local_id and el.perfil_id = (select auth.uid())
    ))
  );

-- auditoria: solo el admin la consulta.
create policy "auditoria: solo admin" on public.auditoria
  for select to authenticated
  using ((select public.es_admin()));

-- -----------------------------------------------------------------------------
-- Usuarios que ya existían antes de esta migración: crearles su perfil.
-- -----------------------------------------------------------------------------
insert into public.perfiles (id, nombre_completo)
select u.id, left(split_part(coalesce(u.email, ''), '@', 1), 120)
from auth.users u
on conflict (id) do nothing;
