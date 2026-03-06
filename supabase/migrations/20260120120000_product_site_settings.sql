create table if not exists public.product_site_settings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  is_active boolean not null default true,
  default_area_kind text references public.area_kinds(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, site_id)
);

-- Si la tabla ya existia sin default_area_kind (p. ej. creada antes por otro medio), añadirla
alter table public.product_site_settings
  add column if not exists default_area_kind text references public.area_kinds(code);

comment on table public.product_site_settings is 'Catalogo activo por sede para productos (sin depender de stock).';
comment on column public.product_site_settings.default_area_kind is 'Area de solicitud sugerida para remisiones.';

create trigger trg_product_site_settings_updated_at
before update on public.product_site_settings
for each row execute function public._set_updated_at();

alter table public.product_site_settings enable row level security;

create policy "product_site_settings_select_staff"
on public.product_site_settings
for select
using (public.is_employee());

create policy "product_site_settings_write_owner"
on public.product_site_settings
for all
using (public.is_owner() or public.is_global_manager())
with check (public.is_owner() or public.is_global_manager());
