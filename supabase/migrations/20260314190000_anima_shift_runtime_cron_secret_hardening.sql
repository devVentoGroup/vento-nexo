begin;

create table if not exists public.internal_job_secrets (
  key text primary key,
  secret_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.internal_job_secrets is
  'Secretos internos usados por jobs del sistema y edge functions. No exponer a clientes.';

alter table public.internal_job_secrets enable row level security;

revoke all on table public.internal_job_secrets from anon, authenticated;
grant select on table public.internal_job_secrets to service_role;

insert into public.internal_job_secrets (key, secret_value)
values ('shift_runtime_processor_cron', gen_random_uuid()::text)
on conflict (key) do nothing;

create or replace function public.run_shift_runtime_processor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  cron_secret text;
begin
  select coalesce(value #>> '{}', '')
  into fn_url
  from public.app_config
  where key = 'shift_runtime_processor_url'
  limit 1;

  if trim(fn_url) = '' then
    return;
  end if;

  select coalesce(secret_value, '')
  into cron_secret
  from public.internal_job_secrets
  where key = 'shift_runtime_processor_cron'
  limit 1;

  perform net.http_post(
    trim(fn_url),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', trim(coalesce(cron_secret, ''))
    )
  );
end;
$$;

comment on function public.run_shift_runtime_processor() is
  'Dispara la Edge Function shift-runtime-processor con secreto interno para recordatorios y autocierres programados.';

commit;
