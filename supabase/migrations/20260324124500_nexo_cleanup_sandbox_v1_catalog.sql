begin;

-- Limpieza segura de sandbox v1 (categorias + productos + dependencias por FK directas a products)
-- Objetivo: eliminar solo datos de prueba SBXV1 / SANDBOX V1.

do $$
declare
  v_root_id uuid;
  r record;
begin
  select id into v_root_id
  from public.product_categories
  where lower(coalesce(slug, '')) = 'sbx-v1-root'
     or lower(coalesce(name, '')) = 'sandbox v1'
  order by created_at nulls last
  limit 1;

  if v_root_id is null then
    raise notice 'Sandbox root category not found. Nothing to clean.';
    return;
  end if;

  create temporary table tmp_sbx_categories(id uuid primary key) on commit drop;

  with recursive cat_tree as (
    select id
    from public.product_categories
    where id = v_root_id
    union all
    select c.id
    from public.product_categories c
    join cat_tree t on c.parent_id = t.id
  )
  insert into tmp_sbx_categories(id)
  select distinct id from cat_tree;

  create temporary table tmp_sbx_products(id uuid primary key) on commit drop;

  insert into tmp_sbx_products(id)
  select p.id
  from public.products p
  where p.category_id in (select id from tmp_sbx_categories)
     or lower(coalesce(p.sku, '')) like 'sbxv1-%'
     or lower(coalesce(p.name, '')) like 'sandbox v1%';

  -- Eliminar filas en todas las tablas con FK directa (columna unica) a public.products(id)
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.products'::regclass
      and n.nspname = 'public'
      and cardinality(con.conkey) = 1
      and c.relname <> 'products'
  loop
    execute format(
      'delete from %I.%I where %I in (select id from tmp_sbx_products)',
      r.schema_name,
      r.table_name,
      r.column_name
    );
  end loop;

  -- Eliminar productos sandbox
  delete from public.products p
  where p.id in (select id from tmp_sbx_products);

  -- Eliminar categorias sandbox (hojas primero)
  with recursive ordered_tree as (
    select c.id, c.parent_id, 1 as lvl
    from public.product_categories c
    where c.id = v_root_id
    union all
    select ch.id, ch.parent_id, ot.lvl + 1
    from public.product_categories ch
    join ordered_tree ot on ch.parent_id = ot.id
  )
  delete from public.product_categories pc
  where pc.id in (
    select id from ordered_tree order by lvl desc
  );

  raise notice 'Sandbox cleanup completed.';
end $$;

commit;
