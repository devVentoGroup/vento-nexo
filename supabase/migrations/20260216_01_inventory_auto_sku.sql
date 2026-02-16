begin;

create sequence if not exists public.inventory_sku_seq
  start with 1
  increment by 1
  minvalue 1
  cache 1;

create or replace function public.generate_inventory_sku(
  p_product_type text default null,
  p_inventory_kind text default null,
  p_name text default null
)
returns text
language plpgsql
as $$
declare
  v_type text;
  v_name text;
  v_seq bigint;
begin
  v_type := case
    when lower(coalesce(trim(p_inventory_kind), '')) = 'asset' then 'EQP'
    when lower(coalesce(trim(p_product_type), '')) = 'venta' then 'VEN'
    when lower(coalesce(trim(p_product_type), '')) = 'preparacion' then 'PRE'
    else 'INS'
  end;

  v_name := upper(coalesce(trim(p_name), ''));
  v_name := translate(v_name,
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc'
  );
  v_name := regexp_replace(v_name, '[^A-Z0-9]+', '', 'g');
  v_name := left(nullif(v_name, ''), 6);
  if v_name is null then
    v_name := 'ITEM';
  end if;

  v_seq := nextval('public.inventory_sku_seq');

  return v_type || '-' || v_name || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

create unique index if not exists ux_products_sku_unique_global
  on public.products ((lower(trim(sku))))
  where sku is not null and trim(sku) <> '';

alter table public.products
  drop constraint if exists products_sku_format_chk;

alter table public.products
  add constraint products_sku_format_chk
  check (
    sku is null
    or trim(sku) = ''
    or upper(trim(sku)) ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
  ) not valid;

commit;

