begin;

-- Limpieza segura de datos de prueba sandbox/sbx:
-- 1) productos/categorias sandbox + todas sus dependencias FK directas a products
-- 2) LOCs sandbox + filas dependientes por FK directa a inventory_locations

do $$
declare
  r record;
begin
  create temporary table tmp_sbx_categories(id uuid primary key) on commit drop;
  create temporary table tmp_sbx_products(id uuid primary key) on commit drop;
  create temporary table tmp_sbx_locs(id uuid primary key) on commit drop;

  insert into tmp_sbx_categories(id)
  select c.id
  from public.product_categories c
  where lower(coalesce(c.slug, '')) like 'sbx%'
     or lower(coalesce(c.slug, '')) like '%sandbox%'
     or lower(coalesce(c.name, '')) like 'sandbox%'
     or lower(coalesce(c.name, '')) like '% sandbox%';

  insert into tmp_sbx_products(id)
  select p.id
  from public.products p
  where lower(coalesce(p.sku, '')) like 'sbx%'
     or lower(coalesce(p.sku, '')) like 'sandbox%'
     or lower(coalesce(p.name, '')) like 'sandbox%'
     or p.category_id in (select id from tmp_sbx_categories);

  -- Eliminar dependencias con FK directa (1 columna) a products
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

  delete from public.products p
  where p.id in (select id from tmp_sbx_products);

  -- Limpiar LOCs sandbox/sbx
  insert into tmp_sbx_locs(id)
  select l.id
  from public.inventory_locations l
  where lower(coalesce(l.code, '')) like '%sbx%'
     or lower(coalesce(l.code, '')) like '%sandbox%'
     or lower(coalesce(l.zone, '')) like '%sbx%'
     or lower(coalesce(l.zone, '')) like '%sandbox%'
     or lower(coalesce(l.description, '')) like '%sbx%'
     or lower(coalesce(l.description, '')) like '%sandbox%';

  -- Eliminar dependencias con FK directa (1 columna) a inventory_locations
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
      and con.confrelid = 'public.inventory_locations'::regclass
      and n.nspname = 'public'
      and cardinality(con.conkey) = 1
      and c.relname <> 'inventory_locations'
  loop
    execute format(
      'delete from %I.%I where %I in (select id from tmp_sbx_locs)',
      r.schema_name,
      r.table_name,
      r.column_name
    );
  end loop;

  delete from public.inventory_locations l
  where l.id in (select id from tmp_sbx_locs);

  -- Borrar categorias sandbox remanentes (hojas primero)
  with recursive cat_tree as (
    select c.id, c.parent_id, 1 as lvl
    from public.product_categories c
    where c.id in (select id from tmp_sbx_categories)
    union all
    select ch.id, ch.parent_id, ct.lvl + 1
    from public.product_categories ch
    join cat_tree ct on ch.parent_id = ct.id
  )
  delete from public.product_categories pc
  where pc.id in (
    select id
    from cat_tree
    order by lvl desc
  );
end $$;

commit;
