-- =============================================================================
-- Etapa 3 · Usuarios de empleados y guardado del horario semanal.
--
-- Cómo aplicarla: Supabase → SQL Editor → New query → pegar todo → Run.
-- =============================================================================

-- Nombre de usuario con el que ingresa el empleado (ej.: juan.perez).
-- Los administradores pueden no tenerlo (ingresan con su email).
alter table public.perfiles
  add column usuario text unique check (usuario ~ '^[a-z0-9._-]{3,30}$');

-- El usuario se toma de app_metadata, que solo puede escribir el servidor con
-- la clave secreta. Nunca de user_metadata, que el propio usuario puede modificar.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre_completo, usuario)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 120),
    nullif(new.raw_app_meta_data ->> 'usuario', '')
  );
  return new;
end;
$$;

-- Reemplaza todo el horario semanal de un empleado en una sola transacción.
-- p_turnos: [{"local_id": "...", "dia_semana": 1, "hora_entrada": "09:00", "hora_salida": "13:00"}, ...]
-- Se ejecuta con los permisos de quien la llama: las políticas RLS exigen ser admin.
create function public.reemplazar_horarios(p_perfil_id uuid, p_turnos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.es_admin()) then
    raise exception 'Solo un administrador puede modificar horarios.';
  end if;
  if jsonb_typeof(p_turnos) <> 'array' then
    raise exception 'Formato de turnos inválido.';
  end if;

  delete from public.horarios where perfil_id = p_perfil_id;

  insert into public.horarios (perfil_id, local_id, dia_semana, hora_entrada, hora_salida)
  select p_perfil_id, t.local_id, t.dia_semana, t.hora_entrada, t.hora_salida
  from jsonb_to_recordset(p_turnos)
    as t(local_id uuid, dia_semana smallint, hora_entrada time, hora_salida time);
end;
$$;

revoke execute on function public.reemplazar_horarios(uuid, jsonb) from public, anon;
grant execute on function public.reemplazar_horarios(uuid, jsonb) to authenticated;
