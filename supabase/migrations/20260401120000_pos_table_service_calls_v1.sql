begin;

create table if not exists pos.pos_table_call_devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  table_id uuid not null references pos.pos_tables(id) on delete cascade,
  device_type text not null
    check (device_type in ('rf_button', 'qr', 'manual', 'gateway_virtual')),
  device_vendor text,
  device_model text,
  device_code text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, device_code)
);

create index if not exists pos_table_call_devices_table_idx
  on pos.pos_table_call_devices(table_id);

create index if not exists pos_table_call_devices_site_active_idx
  on pos.pos_table_call_devices(site_id, is_active);

create table if not exists pos.pos_table_service_calls (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  zone_id uuid references pos.pos_zones(id) on delete set null,
  table_id uuid not null references pos.pos_tables(id) on delete cascade,
  session_id uuid references pos.pos_sessions(id) on delete set null,
  device_id uuid references pos.pos_table_call_devices(id) on delete set null,
  source_type text not null
    check (source_type in ('button', 'qr', 'manual', 'system')),
  request_type text not null
    check (request_type in ('attention', 'bill', 'order', 'cancel', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'acknowledged', 'resolved', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'critical')),
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  assigned_to uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pos_table_service_calls_terminal_timestamps_chk
    check (
      not (status = 'resolved' and resolved_at is null)
      and not (status = 'cancelled' and cancelled_at is null)
    )
);

create index if not exists pos_table_service_calls_site_status_created_idx
  on pos.pos_table_service_calls(site_id, status, created_at desc);

create index if not exists pos_table_service_calls_table_status_created_idx
  on pos.pos_table_service_calls(table_id, status, created_at desc);

create index if not exists pos_table_service_calls_zone_status_created_idx
  on pos.pos_table_service_calls(zone_id, status, created_at desc);

create index if not exists pos_table_service_calls_session_idx
  on pos.pos_table_service_calls(session_id);

drop trigger if exists trg_pos_table_call_devices_updated_at on pos.pos_table_call_devices;
create trigger trg_pos_table_call_devices_updated_at
before update on pos.pos_table_call_devices
for each row execute function public.update_updated_at();

drop trigger if exists trg_pos_table_service_calls_updated_at on pos.pos_table_service_calls;
create trigger trg_pos_table_service_calls_updated_at
before update on pos.pos_table_service_calls
for each row execute function public.update_updated_at();

alter table pos.pos_table_call_devices enable row level security;
alter table pos.pos_table_service_calls enable row level security;

drop policy if exists pos_table_call_devices_select_site_staff on pos.pos_table_call_devices;
create policy pos_table_call_devices_select_site_staff
on pos.pos_table_call_devices
for select
to authenticated
using (
  public.is_employee()
  and public.can_access_site(site_id)
);

drop policy if exists pos_table_call_devices_write_site_staff on pos.pos_table_call_devices;
create policy pos_table_call_devices_write_site_staff
on pos.pos_table_call_devices
for all
to authenticated
using (
  public.is_employee()
  and public.can_access_site(site_id)
)
with check (
  public.is_employee()
  and public.can_access_site(site_id)
);

drop policy if exists pos_table_service_calls_select_site_staff on pos.pos_table_service_calls;
create policy pos_table_service_calls_select_site_staff
on pos.pos_table_service_calls
for select
to authenticated
using (
  public.is_employee()
  and public.can_access_site(site_id)
);

drop policy if exists pos_table_service_calls_insert_site_staff on pos.pos_table_service_calls;
create policy pos_table_service_calls_insert_site_staff
on pos.pos_table_service_calls
for insert
to authenticated
with check (
  public.is_employee()
  and public.can_access_site(site_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists pos_table_service_calls_update_site_staff on pos.pos_table_service_calls;
create policy pos_table_service_calls_update_site_staff
on pos.pos_table_service_calls
for update
to authenticated
using (
  public.is_employee()
  and public.can_access_site(site_id)
)
with check (
  public.is_employee()
  and public.can_access_site(site_id)
);

grant select, insert, update, delete on pos.pos_table_call_devices to authenticated, service_role;
grant select, insert, update, delete on pos.pos_table_service_calls to authenticated, service_role;

create or replace view public.pos_table_call_devices
with (security_invoker = true)
as
select * from pos.pos_table_call_devices;

create or replace view public.pos_table_service_calls
with (security_invoker = true)
as
select * from pos.pos_table_service_calls;

comment on table pos.pos_table_call_devices is 'Dispositivos o fuentes de llamado asociados a mesas del salon.';
comment on table pos.pos_table_service_calls is 'Eventos operativos de llamado de mesa: atencion, cuenta, orden o urgencia.';
comment on view public.pos_table_call_devices is 'Compat view. Canonical table lives in pos.pos_table_call_devices.';
comment on view public.pos_table_service_calls is 'Compat view. Canonical table lives in pos.pos_table_service_calls.';

grant select, insert, update, delete on public.pos_table_call_devices to authenticated, service_role;
grant select, insert, update, delete on public.pos_table_service_calls to authenticated, service_role;

commit;
