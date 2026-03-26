begin;

alter table if exists public.product_uom_profiles
  drop constraint if exists product_uom_profiles_source_chk;

alter table if exists public.product_uom_profiles
  add constraint product_uom_profiles_source_chk
  check (source in ('manual', 'supplier_primary', 'recipe_portion'));

commit;

