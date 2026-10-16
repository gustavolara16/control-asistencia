-- =============================================================================
-- Etapa 6 · Correcciones de marcaciones por el administrador.
--
-- Las marcaciones nunca se borran: se anulan, se corrige su hora o se agregan
-- a mano, siempre con un motivo. Cada cambio queda en public.auditoria con el
-- dato anterior, el nuevo, quién lo hizo y el motivo.
--
-- Se aplica con: npm run db:migrar   (se puede ejecutar más de una vez)
-- =============================================================================

set lock_timeout = '10s';

-- Las altas manuales también quedan en la auditoría (las del empleado no hace
-- falta: ya guardan quién, cuándo, dónde y desde qué ubicación).
drop trigger if exists marcaciones_auditoria_alta_manual on public.marcaciones;
create trigger marcaciones_auditoria_alta_manual after insert on public.marcaciones
  for each row when (new.origen = 'admin') execute function public.registrar_auditoria();

-- Valida que quien llama sea administrador y que el motivo sea razonable.
-- Deja el motivo en app.motivo para que lo tome el trigger de auditoría.
create or replace function public.preparar_correccion(p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not (select public.es_admin()) then
    raise exception 'Solo un administrador puede corregir marcaciones.';
  end if;
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 500 then
    raise exception 'Escribí el motivo de la corrección (entre 5 y 500 caracteres).';
  end if;
  perform set_config('app.motivo', v_motivo, true);
  return v_motivo;
end;
$$;

-- Anula una marcación: deja de contar para la asistencia, pero se conserva.
create or replace function public.anular_marcacion(p_marcacion_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.preparar_correccion(p_motivo);
begin
  update public.marcaciones
     set anulada = true, nota = v_motivo
   where id = p_marcacion_id and not anulada;
  if not found then
    raise exception 'La marcación no existe o ya estaba anulada.';
  end if;
end;
$$;

-- Corrige la hora de una marcación (la hora anterior queda en la auditoría).
create or replace function public.corregir_hora_marcacion(
  p_marcacion_id bigint,
  p_registrada_en timestamptz,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.preparar_correccion(p_motivo);
begin
  if p_registrada_en is null or p_registrada_en > now() then
    raise exception 'La nueva hora no puede ser posterior al momento actual.';
  end if;
  update public.marcaciones
     set registrada_en = p_registrada_en, nota = v_motivo
   where id = p_marcacion_id and not anulada;
  if not found then
    raise exception 'La marcación no existe o está anulada.';
  end if;
end;
$$;

-- Agrega una marcación que faltó (por ejemplo, una salida olvidada).
create or replace function public.agregar_marcacion(
  p_perfil_id uuid,
  p_local_id uuid,
  p_tipo public.tipo_marcacion,
  p_registrada_en timestamptz,
  p_motivo text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.preparar_correccion(p_motivo);
  v_id bigint;
begin
  if not exists (select 1 from public.perfiles where id = p_perfil_id and rol = 'empleado') then
    raise exception 'El empleado no existe.';
  end if;
  if not exists (select 1 from public.locales where id = p_local_id) then
    raise exception 'El local no existe.';
  end if;
  if p_tipo is null then
    raise exception 'Elegí si es una entrada o una salida.';
  end if;
  if p_registrada_en is null or p_registrada_en > now() then
    raise exception 'La hora no puede ser posterior al momento actual.';
  end if;

  insert into public.marcaciones (perfil_id, local_id, tipo, registrada_en, origen, nota, creada_por)
  values (p_perfil_id, p_local_id, p_tipo, p_registrada_en, 'admin', v_motivo, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones (cada una verifica además que sea administrador)
-- -----------------------------------------------------------------------------
revoke execute on function public.preparar_correccion(text) from public, anon, authenticated;
revoke execute on function public.anular_marcacion(bigint, text),
  public.corregir_hora_marcacion(bigint, timestamptz, text),
  public.agregar_marcacion(uuid, uuid, public.tipo_marcacion, timestamptz, text)
  from public, anon;
grant execute on function public.anular_marcacion(bigint, text),
  public.corregir_hora_marcacion(bigint, timestamptz, text),
  public.agregar_marcacion(uuid, uuid, public.tipo_marcacion, timestamptz, text)
  to authenticated;
