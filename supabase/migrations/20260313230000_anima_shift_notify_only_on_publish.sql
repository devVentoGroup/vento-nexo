-- Notificar solo cuando se PUBLICA el horario (published_at pasa de null a valor), no al asignar en borrador ni al editar ya publicado.

create or replace function public.notify_shift_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  secret text;
  payload jsonb;
begin
  -- Solo notificar en el momento de publicar:
  -- INSERT con published_at ya puesto, o UPDATE donde published_at pasaba de null a no null.
  if new.published_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null then
    return new;  -- ya estaba publicado; no notificar por ediciones posteriores
  end if;

  select coalesce(value #>> '{}', '') into fn_url from public.app_config where key = 'shift_notify_function_url' limit 1;
  if trim(fn_url) = '' then
    return new;
  end if;

  select coalesce(value #>> '{}', '') into secret from public.app_config where key = 'shift_notify_internal_secret' limit 1;
  if trim(secret) = '' then
    return new;
  end if;

  payload := jsonb_build_object(
    'employee_id', new.employee_id,
    'shift_id', new.id,
    'shift_date', new.shift_date,
    'start_time', coalesce(nullif(trim(new.start_time), ''), '08:00'),
    'end_time', coalesce(nullif(trim(new.end_time), ''), '14:00'),
    'type', 'published'
  );

  perform net.http_post(
    trim(fn_url),
    payload,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', trim(secret)
    )
  );

  return new;
exception
  when others then
    return new;
end;
$$;

comment on function public.notify_shift_published() is 'Notifica al empleado solo cuando se publica el turno (published_at pasa de null a valor). No en borrador ni al editar ya publicado.';
