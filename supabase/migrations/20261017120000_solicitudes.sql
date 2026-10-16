-- =============================================================================
-- Etapa 7 · Pedidos de corrección de los empleados.
--
-- El empleado pide corregir la hora de una marcación suya o agregar una que
-- faltó. El administrador la aprueba (se aplica el cambio, con auditoría) o la
-- rechaza con una respuesta.
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

-- Reglas de los pedidos, sin importar desde dónde se creen. (Quién puede
-- crearlos y sobre qué marcaciones y locales ya lo controlan las políticas RLS).
create or replace function public.validar_solicitud_correccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pedidos a nombre de otro o sobre marcaciones ajenas: los rechazan las
  -- políticas RLS (que se evalúan después). No se valida nada más para no
  -- revelar datos de otros empleados en los mensajes de error.
  if new.perfil_id is distinct from (select auth.uid())
     or (new.marcacion_id is not null and not exists (
       select 1 from public.marcaciones where id = new.marcacion_id and perfil_id = new.perfil_id
     )) then
    return new;
  end if;

  new.estado := 'pendiente';
  new.revisada_por := null;
  new.revisada_en := null;
  new.respuesta := null;
  new.motivo := btrim(new.motivo);

  if new.fecha_hora_propuesta > now() then
    raise exception 'La hora que pedís no puede ser posterior al momento actual.';
  end if;
  if new.fecha_hora_propuesta < now() - interval '31 days' then
    raise exception 'Solo se pueden pedir correcciones de los últimos 31 días.';
  end if;
  if new.marcacion_id is not null then
    if exists (select 1 from public.marcaciones where id = new.marcacion_id and anulada) then
      raise exception 'Esa marcación fue anulada.';
    end if;
    if exists (
      select 1 from public.solicitudes_correccion
       where marcacion_id = new.marcacion_id and estado = 'pendiente'
    ) then
      raise exception 'Ya hay un pedido pendiente para esa marcación.';
    end if;
  end if;
  if (
    select count(*) from public.solicitudes_correccion
     where perfil_id = new.perfil_id and estado = 'pendiente'
  ) >= 10 then
    raise exception 'Tenés 10 pedidos pendientes. Esperá a que el administrador los revise.';
  end if;
  return new;
end;
$$;

drop trigger if exists solicitudes_validar on public.solicitudes_correccion;
create trigger solicitudes_validar before insert on public.solicitudes_correccion
  for each row execute function public.validar_solicitud_correccion();

-- Aprueba o rechaza un pedido. Al aprobar, aplica la corrección.
create or replace function public.resolver_solicitud(
  p_solicitud_id bigint,
  p_aprobar boolean,
  p_respuesta text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_correccion%rowtype;
  v_respuesta text := nullif(btrim(coalesce(p_respuesta, '')), '');
  v_motivo text;
begin
  if not (select public.es_admin()) then
    raise exception 'Solo un administrador puede resolver pedidos de corrección.';
  end if;
  if p_aprobar is null then
    raise exception 'Indicá si el pedido se aprueba o se rechaza.';
  end if;
  if not p_aprobar and v_respuesta is null then
    raise exception 'Para rechazar, escribí el motivo (lo va a ver el empleado).';
  end if;
  if char_length(v_respuesta) > 500 then
    raise exception 'La respuesta puede tener hasta 500 caracteres.';
  end if;

  select * into v_solicitud from public.solicitudes_correccion where id = p_solicitud_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_solicitud.estado <> 'pendiente' then
    raise exception 'Este pedido ya fue resuelto.';
  end if;

  if p_aprobar then
    v_motivo := left(format('Pedido de corrección #%s: %s', v_solicitud.id, v_solicitud.motivo), 500);
    perform set_config('app.motivo', v_motivo, true);
    if v_solicitud.marcacion_id is not null then
      update public.marcaciones
         set registrada_en = v_solicitud.fecha_hora_propuesta, nota = v_motivo
       where id = v_solicitud.marcacion_id and not anulada;
      if not found then
        raise exception 'La marcación fue anulada: rechazá el pedido.';
      end if;
    else
      insert into public.marcaciones (perfil_id, local_id, tipo, registrada_en, origen, nota, creada_por)
      values (
        v_solicitud.perfil_id, v_solicitud.local_id, v_solicitud.tipo,
        v_solicitud.fecha_hora_propuesta, 'admin', v_motivo, (select auth.uid())
      );
    end if;
  end if;

  perform set_config('app.motivo', case when p_aprobar then 'Pedido aprobado' else 'Pedido rechazado' end, true);
  update public.solicitudes_correccion
     set estado = case when p_aprobar then 'aprobada'::public.estado_solicitud else 'rechazada'::public.estado_solicitud end,
         revisada_por = (select auth.uid()),
         revisada_en = now(),
         respuesta = v_respuesta
   where id = v_solicitud.id;
end;
$$;

revoke execute on function public.validar_solicitud_correccion() from public, anon, authenticated;
revoke execute on function public.resolver_solicitud(bigint, boolean, text) from public, anon;
grant execute on function public.resolver_solicitud(bigint, boolean, text) to authenticated;
