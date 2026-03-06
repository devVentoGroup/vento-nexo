begin;

alter table if exists public.production_batches
  add column if not exists destination_location_id uuid;

alter table if exists public.production_batches
  add column if not exists recipe_consumed boolean not null default false;

do $$
begin
  if to_regclass('public.inventory_locations') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'production_batches_destination_location_id_fkey'
     ) then
    alter table public.production_batches
      add constraint production_batches_destination_location_id_fkey
      foreign key (destination_location_id)
      references public.inventory_locations(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.production_batch_consumptions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  ingredient_product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  required_qty numeric not null default 0,
  consumed_qty numeric not null default 0,
  stock_unit_code text not null references public.inventory_units(code),
  movement_id uuid null references public.inventory_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  constraint production_batch_consumptions_required_qty_chk check (required_qty >= 0),
  constraint production_batch_consumptions_consumed_qty_chk check (consumed_qty >= 0)
);

create unique index if not exists ux_production_batch_consumptions_batch_ingredient_location
  on public.production_batch_consumptions(batch_id, ingredient_product_id, location_id);

create index if not exists idx_production_batch_consumptions_batch
  on public.production_batch_consumptions(batch_id);

create index if not exists idx_production_batch_consumptions_ingredient
  on public.production_batch_consumptions(ingredient_product_id, created_at desc);

create index if not exists idx_production_batch_consumptions_location
  on public.production_batch_consumptions(location_id);

commit;
