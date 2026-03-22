-- Asignación de áreas por propósito para cada trabajador y sede.
-- Permite separar área operativa vs área de remisión.

create table if not exists public.employee_area_purpose_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  purpose text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, site_id, purpose),
  constraint employee_area_purpose_assignments_purpose_chk
    check (purpose in ('operational', 'remission'))
);

create index if not exists idx_employee_area_purpose_assignments_lookup
  on public.employee_area_purpose_assignments(employee_id, site_id, purpose, is_active);

drop trigger if exists trg_employee_area_purpose_assignments_updated_at on public.employee_area_purpose_assignments;
create trigger trg_employee_area_purpose_assignments_updated_at
before update on public.employee_area_purpose_assignments
for each row execute function public._set_updated_at();

alter table public.employee_area_purpose_assignments enable row level security;

drop policy if exists "employee_area_purpose_assignments_select_authenticated" on public.employee_area_purpose_assignments;
create policy "employee_area_purpose_assignments_select_authenticated"
on public.employee_area_purpose_assignments
for select
to authenticated
using (true);

drop policy if exists "employee_area_purpose_assignments_write_authenticated" on public.employee_area_purpose_assignments;
create policy "employee_area_purpose_assignments_write_authenticated"
on public.employee_area_purpose_assignments
to authenticated
using (true)
with check (true);

comment on table public.employee_area_purpose_assignments is
  'Asignación de áreas por propósito (operational/remission) por trabajador y sede.';
comment on column public.employee_area_purpose_assignments.purpose is
  'Propósito operativo de la asignación: operational o remission.';
