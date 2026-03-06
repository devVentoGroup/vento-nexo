begin;

create table if not exists public.site_production_pick_order (
  site_id uuid not null references public.sites(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_production_pick_order_priority_chk check (priority > 0),
  primary key (site_id, location_id)
);

create index if not exists idx_site_production_pick_order_active
  on public.site_production_pick_order(site_id, is_active, priority);

commit;
