begin;

create extension if not exists pg_net;

insert into public.app_config (key, value)
values
  (
    'shift_runtime_processor_url',
    to_jsonb('https://clzdpinthhtknkmefsxx.supabase.co/functions/v1/shift-runtime-processor'::text)
  )
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

create or replace function public.run_shift_runtime_processor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
begin
  select coalesce(value #>> '{}', '')
  into fn_url
  from public.app_config
  where key = 'shift_runtime_processor_url'
  limit 1;

  if trim(fn_url) = '' then
    return;
  end if;

  perform net.http_post(
    trim(fn_url),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );
end;
$$;

comment on function public.run_shift_runtime_processor() is
  'Dispara la Edge Function shift-runtime-processor para recordatorios de cierre y autocierres programados.';

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    begin
      if not exists (
        select 1
        from cron.job
        where jobname = 'anima_shift_runtime_processor_every_5m'
      ) then
        perform cron.schedule(
          'anima_shift_runtime_processor_every_5m',
          '*/5 * * * *',
          $cron$select public.run_shift_runtime_processor();$cron$
        );
      end if;
    exception
      when undefined_table then
        raise notice 'pg_cron extension exists but cron.job is unavailable in this environment.';
      when insufficient_privilege then
        raise notice 'Skipping pg_cron schedule due to insufficient privilege.';
    end;
  end if;
end
$$;

commit;
