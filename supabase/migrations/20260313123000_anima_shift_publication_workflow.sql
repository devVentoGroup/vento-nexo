alter table if exists public.employee_shifts
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.employees(id) on delete set null;

update public.employee_shifts
set
  published_at = coalesce(published_at, updated_at, created_at, now()),
  published_by = coalesce(published_by, created_by)
where published_at is null;

create index if not exists idx_employee_shifts_published_date
  on public.employee_shifts (site_id, shift_date, published_at desc);

comment on column public.employee_shifts.published_at is
  'Timestamp when the shift was officially published to the employee-facing schedule.';

comment on column public.employee_shifts.published_by is
  'Employee who published the shift to ANIMA.';
