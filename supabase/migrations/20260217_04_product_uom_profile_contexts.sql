begin;

alter table if exists public.product_uom_profiles
  add column if not exists usage_context text;

update public.product_uom_profiles
set usage_context = coalesce(nullif(trim(lower(usage_context)), ''), 'general');

alter table public.product_uom_profiles
  alter column usage_context set default 'general';

alter table public.product_uom_profiles
  alter column usage_context set not null;

alter table public.product_uom_profiles
  drop constraint if exists product_uom_profiles_usage_context_chk;

alter table public.product_uom_profiles
  add constraint product_uom_profiles_usage_context_chk
  check (usage_context in ('general', 'purchase', 'remission'));

drop index if exists public.ux_product_uom_profiles_default_per_product;

create unique index if not exists ux_product_uom_profiles_default_per_product_context
  on public.product_uom_profiles(product_id, usage_context)
  where is_default = true and is_active = true;

create index if not exists idx_product_uom_profiles_product_context
  on public.product_uom_profiles(product_id, usage_context, is_active, is_default);

commit;
