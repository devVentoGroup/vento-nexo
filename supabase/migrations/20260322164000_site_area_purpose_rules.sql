-- Reglas por sede + propósito para áreas operativas (NEXO v2)
-- Objetivo: evitar hardcodes por nombre de sede y mover la política a BD.

create table if not exists public.site_area_purpose_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  area_kind text not null references public.area_kinds(code),
  purpose text not null default 'remission',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, area_kind, purpose),
  constraint site_area_purpose_rules_purpose_chk
    check (purpose in ('remission'))
);

create index if not exists idx_site_area_purpose_rules_site_purpose
  on public.site_area_purpose_rules(site_id, purpose, is_enabled);

drop trigger if exists trg_site_area_purpose_rules_updated_at on public.site_area_purpose_rules;
create trigger trg_site_area_purpose_rules_updated_at
before update on public.site_area_purpose_rules
for each row execute function public._set_updated_at();

alter table public.site_area_purpose_rules enable row level security;

drop policy if exists "site_area_purpose_rules_select_authenticated" on public.site_area_purpose_rules;
create policy "site_area_purpose_rules_select_authenticated"
on public.site_area_purpose_rules
for select
to authenticated
using (true);

drop policy if exists "site_area_purpose_rules_write_authenticated" on public.site_area_purpose_rules;
create policy "site_area_purpose_rules_write_authenticated"
on public.site_area_purpose_rules
to authenticated
using (true)
with check (true);

comment on table public.site_area_purpose_rules is
  'Reglas por sede + propósito para habilitar tipos de área operativa (ej. remisiones).';
comment on column public.site_area_purpose_rules.purpose is
  'Propósito operativo. Hoy: remission.';
comment on column public.site_area_purpose_rules.is_enabled is
  'Si true, el area_kind aplica para el propósito en esa sede.';

-- Seed inicial solicitado:
-- Saudo -> solo cocina_bar
-- Molka -> solo mostrador
with target_sites as (
  select id, lower(public._vento_slugify(coalesce(name, ''))) as slug
  from public.sites
  where is_active = true
)
insert into public.site_area_purpose_rules (site_id, area_kind, purpose, is_enabled)
select ts.id, x.area_kind, 'remission', true
from target_sites ts
join (
  values
    ('saudo', 'cocina_bar'),
    ('molka', 'mostrador')
) as x(slug_key, area_kind)
  on ts.slug like '%' || x.slug_key || '%'
on conflict (site_id, area_kind, purpose)
do update set is_enabled = excluded.is_enabled, updated_at = now();
