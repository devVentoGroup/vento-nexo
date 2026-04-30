-- Assign one operational inventory LOC to each worker per site.
-- Used by NEXO kiosk withdrawals to convert an operational withdrawal into an internal transfer.

create table if not exists public.employee_inventory_location_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  purpose text not null default 'kiosk_withdraw',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_inventory_location_assignments_purpose_chk
    check (purpose in ('kiosk_withdraw')),
  constraint employee_inventory_location_assignments_unique_active
    unique (employee_id, site_id, purpose)
);

create index if not exists idx_employee_inventory_location_assignments_employee
  on public.employee_inventory_location_assignments(employee_id, is_active);

create index if not exists idx_employee_inventory_location_assignments_location
  on public.employee_inventory_location_assignments(location_id, is_active);

create or replace function public.enforce_employee_inventory_location_assignment_site()
returns trigger
language plpgsql
as $$
declare
  v_employee_site uuid;
  v_location_site uuid;
begin
  select site_id into v_employee_site
  from public.employees
  where id = new.employee_id;

  select site_id into v_location_site
  from public.inventory_locations
  where id = new.location_id;

  if v_location_site is null then
    raise exception 'LOC invalido para asignacion de trabajador.';
  end if;

  if v_employee_site is distinct from new.site_id then
    if not exists (
      select 1
      from public.employee_sites es
      where es.employee_id = new.employee_id
        and es.site_id = new.site_id
        and es.is_active = true
    ) then
      raise exception 'El trabajador no pertenece a la sede seleccionada.';
    end if;
  end if;

  if v_location_site <> new.site_id then
    raise exception 'El LOC no pertenece a la sede seleccionada.';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_inventory_location_assignment_site
  on public.employee_inventory_location_assignments;

create trigger trg_employee_inventory_location_assignment_site
before insert or update of employee_id, site_id, location_id, is_active
on public.employee_inventory_location_assignments
for each row
execute function public.enforce_employee_inventory_location_assignment_site();

alter table public.employee_inventory_location_assignments enable row level security;

drop policy if exists employee_inventory_location_assignments_select_staff
  on public.employee_inventory_location_assignments;
create policy employee_inventory_location_assignments_select_staff
on public.employee_inventory_location_assignments
for select
using (
  (public.is_employee() and public.can_access_site(site_id))
  or public.has_permission('nexo.inventory.transfers', site_id)
  or public.has_permission('nexo.inventory.withdraw', site_id)
);

drop policy if exists employee_inventory_location_assignments_manage_staff
  on public.employee_inventory_location_assignments;
create policy employee_inventory_location_assignments_manage_staff
on public.employee_inventory_location_assignments
for all
using (
  (public.is_employee() and public.can_access_site(site_id))
  or public.has_permission('nexo.inventory.transfers', site_id)
)
with check (
  (public.is_employee() and public.can_access_site(site_id))
  or public.has_permission('nexo.inventory.transfers', site_id)
);

comment on table public.employee_inventory_location_assignments is
  'Asignacion operativa de trabajador a LOC de inventario. NEXO usa purpose=kiosk_withdraw para traslados desde quiosco.';
