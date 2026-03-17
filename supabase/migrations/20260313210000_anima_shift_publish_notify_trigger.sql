-- Disparar notificación push al empleado cuando se publica o actualiza un turno (desde ANIMA o VISO).
-- Usa pg_net para llamar a la Edge Function shift-publish-notify sin depender del cliente.
-- Requiere: 1) app_config con shift_notify_function_url y shift_notify_internal_secret,
--          2) INTERNAL_NOTIFY_SECRET igual al valor de shift_notify_internal_secret en los secrets de la Edge Function.

create extension if not exists pg_net;

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
  notify_type text;
begin
  if new.published_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null and old.published_at = new.published_at
     and old.employee_id = new.employee_id and old.shift_date = new.shift_date
     and old.start_time = new.start_time and old.end_time = new.end_time then
    return new;
  end if;

  select coalesce(value #>> '{}', '') into fn_url from public.app_config where key = 'shift_notify_function_url' limit 1;
  if trim(fn_url) = '' then
    return new;
  end if;

  select coalesce(value #>> '{}', '') into secret from public.app_config where key = 'shift_notify_internal_secret' limit 1;
  if trim(secret) = '' then
    return new;
  end if;

  notify_type := case when tg_op = 'INSERT' then 'published' else 'updated' end;
  payload := jsonb_build_object(
    'employee_id', new.employee_id,
    'shift_id', new.id,
    'shift_date', new.shift_date,
    'start_time', coalesce(nullif(trim(new.start_time), ''), '08:00'),
    'end_time', coalesce(nullif(trim(new.end_time), ''), '14:00'),
    'type', notify_type
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

comment on function public.notify_shift_published() is 'Llama a la Edge Function shift-publish-notify cuando se publica/actualiza un turno (ANIMA o VISO).';

drop trigger if exists trg_employee_shifts_notify_published on public.employee_shifts;
create trigger trg_employee_shifts_notify_published
  after insert or update on public.employee_shifts
  for each row
  execute function public.notify_shift_published();

-- URL de la Edge Function (cada proyecto debe actualizarla). Secreto aleatorio; copiar el valor a INTERNAL_NOTIFY_SECRET en secrets de la función.
insert into public.app_config (key, value)
values
  ('shift_notify_function_url', '""'),
  ('shift_notify_internal_secret', to_jsonb(gen_random_uuid()::text))
on conflict (key) do update set value = case when app_config.key = 'shift_notify_internal_secret' then app_config.value else excluded.value end;
