begin;

create table if not exists public.inventory_form_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_key text not null,
  entity_id text,
  site_id uuid references public.sites(id) on delete set null,
  step_id text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  entity_scope text generated always as (coalesce(entity_id, '')) stored,
  site_scope uuid generated always as (
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored
);

comment on table public.inventory_form_drafts is
  'Borradores por usuario para formularios graduales de inventario.';

create unique index if not exists ux_inventory_form_drafts_scope
  on public.inventory_form_drafts (user_id, form_key, entity_scope, site_scope);

create index if not exists idx_inventory_form_drafts_user_form_updated
  on public.inventory_form_drafts (user_id, form_key, updated_at desc);

create index if not exists idx_inventory_form_drafts_expires_at
  on public.inventory_form_drafts (expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_inventory_form_drafts_updated_at'
  ) then
    create trigger trg_inventory_form_drafts_updated_at
      before update on public.inventory_form_drafts
      for each row execute function public.update_updated_at();
  end if;
end
$$;

alter table public.inventory_form_drafts enable row level security;

drop policy if exists inventory_form_drafts_select_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_insert_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_update_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_delete_own on public.inventory_form_drafts;

create policy inventory_form_drafts_select_own
  on public.inventory_form_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy inventory_form_drafts_insert_own
  on public.inventory_form_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy inventory_form_drafts_update_own
  on public.inventory_form_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy inventory_form_drafts_delete_own
  on public.inventory_form_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.purge_inventory_form_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.inventory_form_drafts
  where expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.purge_inventory_form_drafts is
  'Limpia borradores expirados de formularios de inventario.';

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
        where jobname = 'purge_inventory_form_drafts_daily'
      ) then
        perform cron.schedule(
          'purge_inventory_form_drafts_daily',
          '15 3 * * *',
          $$select public.purge_inventory_form_drafts();$$
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

