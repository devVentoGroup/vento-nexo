begin;

do $$
declare
  parent_category_id uuid;
begin
  select pc.id
  into parent_category_id
  from public.product_categories pc
  where pc.slug = 'bases-de-reposteria-y-rellenos'
    and pc.site_id is null
    and coalesce(pc.domain, '') = ''
    and pc.applies_to_kinds @> array['preparacion']::text[]
  order by pc.created_at asc
  limit 1;

  -- En BD vacía (reset local) el padre legacy aún no existe: viene de datos previos o de migraciones posteriores.
  -- No fallar la cadena de migraciones; 20260318150000 asume estas hojas solo si ya había catálogo legacy.
  if parent_category_id is null then
    raise notice 'Skip nexo_preparaciones_dulces_categories: sin padre bases-de-reposteria-y-rellenos (preparacion)';
    return;
  end if;

  insert into public.product_categories (
    id,
    name,
    slug,
    description,
    display_order,
    is_active,
    created_at,
    updated_at,
    domain,
    site_id,
    parent_id,
    applies_to_kinds
  )
  select
    gen_random_uuid(),
    'Coberturas y salsas dulces',
    'coberturas-y-salsas-dulces',
    'Bocadillo liquido, coulis, siropes y otras coberturas dulces de apoyo para producto final.',
    554,
    true,
    now(),
    now(),
    null,
    null,
    parent_category_id,
    array['preparacion']::text[]
  where not exists (
    select 1
    from public.product_categories pc
    where pc.parent_id = parent_category_id
      and lower(pc.slug) = 'coberturas-y-salsas-dulces'
  );

  insert into public.product_categories (
    id,
    name,
    slug,
    description,
    display_order,
    is_active,
    created_at,
    updated_at,
    domain,
    site_id,
    parent_id,
    applies_to_kinds
  )
  select
    gen_random_uuid(),
    'Toppings e inclusiones dulces',
    'toppings-e-inclusiones-dulces',
    'Frutos caramelizados, crujientes y otras inclusiones dulces para acabado y armado.',
    555,
    true,
    now(),
    now(),
    null,
    null,
    parent_category_id,
    array['preparacion']::text[]
  where not exists (
    select 1
    from public.product_categories pc
    where pc.parent_id = parent_category_id
      and lower(pc.slug) = 'toppings-e-inclusiones-dulces'
  );
end $$;

commit;
