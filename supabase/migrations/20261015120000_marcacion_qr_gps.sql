-- =============================================================================
-- Etapa 4 · Marcación de entrada y salida con QR + GPS.
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

-- -----------------------------------------------------------------------------
-- Código secreto del QR de cada local
-- -----------------------------------------------------------------------------
-- 64 caracteres aleatorios. Lo que se imprime en el QR es una dirección web que
-- lo incluye. Si se filtra, el administrador lo regenera y el impreso anterior
-- deja de servir.
alter table public.locales
  add column if not exists qr_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Los usuarios pueden leer todas las columnas de locales MENOS qr_token
-- (las políticas RLS siguen decidiendo qué filas ve cada uno).
revoke select, insert, update on public.locales from authenticated;
grant select (id, nombre, direccion, latitud, longitud, radio_metros, tolerancia_minutos, activo, created_at, updated_at)
  on public.locales to authenticated;
grant insert (nombre, direccion, latitud, longitud, radio_metros, tolerancia_minutos, activo)
  on public.locales to authenticated;
grant update (nombre, direccion, latitud, longitud, radio_metros, tolerancia_minutos, activo)
  on public.locales to authenticated;

-- El administrador obtiene el código para imprimir el QR.
create or replace function public.qr_token_local(p_local_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not (select public.es_admin()) then
    raise exception 'Solo un administrador puede ver el código QR.';
  end if;
  select qr_token into v_token from public.locales where id = p_local_id;
  return v_token;
end;
$$;

-- Genera un código nuevo (el QR impreso anterior deja de funcionar).
create or replace function public.regenerar_qr_local(p_local_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not (select public.es_admin()) then
    raise exception 'Solo un administrador puede regenerar el código QR.';
  end if;
  update public.locales
     set qr_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
   where id = p_local_id
  returning qr_token into v_token;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Distancia en metros entre dos coordenadas (fórmula de Haversine)
-- -----------------------------------------------------------------------------
create or replace function public.distancia_metros(
  lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- -----------------------------------------------------------------------------
-- Registrar una marcación (la única forma de crear marcaciones desde la app)
-- -----------------------------------------------------------------------------
-- Todas las reglas se validan acá, en el servidor. La hora es now() de la base.
-- Los mensajes de error están pensados para mostrarse tal cual al empleado.
create or replace function public.registrar_marcacion(
  p_qr_token text,
  p_tipo public.tipo_marcacion,
  p_latitud double precision default null,
  p_longitud double precision default null,
  p_precision_metros double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_local public.locales%rowtype;
  v_ultima public.marcaciones%rowtype;
  v_hay_ultima boolean;
  v_entrada_abierta boolean;
  v_distancia double precision;
  v_dentro boolean;
  v_nueva public.marcaciones%rowtype;
begin
  if v_uid is null then
    raise exception 'Tu sesión no es válida. Volvé a ingresar.';
  end if;
  if not exists (select 1 from public.perfiles where id = v_uid and activo) then
    raise exception 'Tu cuenta está desactivada.';
  end if;

  select * into v_local from public.locales where qr_token = p_qr_token and activo;
  if not found then
    raise exception 'El código QR no es válido o el local está desactivado.';
  end if;
  if not exists (
    select 1 from public.empleado_locales where perfil_id = v_uid and local_id = v_local.id
  ) then
    raise exception 'No estás asignado al local %.', v_local.nombre;
  end if;

  -- Ubicación: solo si el local tiene coordenadas cargadas.
  if v_local.latitud is not null then
    if p_latitud is null or p_longitud is null then
      raise exception 'Necesitamos tu ubicación para marcar. Activá el GPS y permití el acceso a la ubicación.';
    end if;
    if p_latitud not between -90 and 90 or p_longitud not between -180 and 180 then
      raise exception 'La ubicación recibida no es válida.';
    end if;
    if p_precision_metros is not null and p_precision_metros > 500 then
      raise exception 'La señal de ubicación es muy imprecisa (± % m). Esperá unos segundos e intentá de nuevo.',
        round(p_precision_metros);
    end if;
    v_distancia := public.distancia_metros(v_local.latitud, v_local.longitud, p_latitud, p_longitud);
    -- Margen por la imprecisión del GPS, con un tope de 100 m.
    v_dentro := v_distancia <= v_local.radio_metros + least(greatest(coalesce(p_precision_metros, 0), 0), 100);
    if not v_dentro then
      raise exception 'Estás a % m del local %. Acercate para poder marcar.', round(v_distancia), v_local.nombre;
    end if;
  end if;

  -- Evita que dos pedidos simultáneos del mismo empleado se pisen.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select * into v_ultima
    from public.marcaciones
   where perfil_id = v_uid and not anulada
   order by registrada_en desc
   limit 1;
  v_hay_ultima := found;

  if v_hay_ultima and v_ultima.registrada_en > now() - interval '1 minute' then
    raise exception 'Ya registraste una marcación hace menos de un minuto.';
  end if;

  -- Una entrada sin salida de hace más de 18 h se considera olvidada.
  v_entrada_abierta := v_hay_ultima and v_ultima.tipo = 'entrada'
                       and v_ultima.registrada_en > now() - interval '18 hours';

  if p_tipo = 'entrada' and v_entrada_abierta then
    raise exception 'Ya tenés una entrada registrada sin salida. Marcá la salida primero.';
  end if;
  if p_tipo = 'salida' and not v_entrada_abierta then
    raise exception 'No tenés una entrada abierta. Si te olvidaste de marcar, pedí una corrección.';
  end if;
  if p_tipo = 'salida' and v_ultima.local_id <> v_local.id then
    raise exception 'Tu entrada fue en otro local. Marcá la salida en ese local.';
  end if;

  insert into public.marcaciones (
    perfil_id, local_id, tipo, origen, latitud, longitud,
    precision_metros, distancia_metros, dentro_del_radio, creada_por
  ) values (
    v_uid, v_local.id, p_tipo, 'qr_gps', p_latitud, p_longitud,
    p_precision_metros, v_distancia, v_dentro, v_uid
  )
  returning * into v_nueva;

  return jsonb_build_object(
    'id', v_nueva.id,
    'tipo', v_nueva.tipo,
    'registrada_en', v_nueva.registrada_en,
    'local', v_local.nombre,
    'distancia_metros', round(v_distancia)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke execute on function public.qr_token_local(uuid), public.regenerar_qr_local(uuid),
  public.registrar_marcacion(text, public.tipo_marcacion, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.qr_token_local(uuid), public.regenerar_qr_local(uuid),
  public.registrar_marcacion(text, public.tipo_marcacion, double precision, double precision, double precision)
  to authenticated;
revoke execute on function public.distancia_metros(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
