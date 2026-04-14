-- Eliminar definitivamente area_kinds.galleteria.
-- Se remapean referencias a 'general' para no romper FKs.

begin;

insert into public.area_kinds (code, name, description, is_active)
values ('general', 'General', 'Area generica', true)
on conflict (code) do nothing;

-- Tablas núcleo con FK directo a area_kinds(code)
update public.areas
set kind = 'general'
where kind = 'galleteria';

update public.products
set production_area_kind = 'general'
where production_area_kind = 'galleteria';

update public.production_request_items
set production_area_kind = 'general'
where production_area_kind = 'galleteria';

update public.restock_request_items
set production_area_kind = 'general'
where production_area_kind = 'galleteria';

update public.product_site_settings
set default_area_kind = 'general'
where default_area_kind = 'galleteria';

update public.role_permissions
set scope_area_kind = 'general'
where scope_area_kind = 'galleteria';

update public.employee_permissions
set scope_area_kind = 'general'
where scope_area_kind = 'galleteria';

-- Tablas nuevas/optativas que pueden no existir en algunos entornos.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'site_area_purpose_rules'
  ) then
    execute $sql$
      update public.site_area_purpose_rules
      set area_kind = 'general'
      where area_kind = 'galleteria'
    $sql$;
  end if;
end
$$;

delete from public.area_kinds
where code = 'galleteria';

commit;

