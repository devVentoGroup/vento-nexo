begin;

-- 1) Canonical applicability model for categories.
alter table if exists public.product_categories
  add column if not exists applies_to_kinds text[];

comment on column public.product_categories.applies_to_kinds is
  'Tipos logicos donde aplica la categoria: insumo, preparacion, venta, equipo.';

-- 2) Normalize legacy domains.
update public.product_categories
set domain = nullif(upper(trim(domain)), '')
where domain is not null;

-- 3) Backfill from real product usage.
with usage_source as (
  select distinct
    p.category_id,
    case
      when lower(coalesce(p.product_type, '')) = 'venta' then 'venta'
      when lower(coalesce(p.product_type, '')) = 'preparacion' then 'preparacion'
      when lower(coalesce(p.product_type, '')) = 'insumo'
        and lower(coalesce(pip.inventory_kind, '')) = 'asset'
        then 'equipo'
      else 'insumo'
    end as kind
  from public.products p
  left join public.product_inventory_profiles pip
    on pip.product_id = p.id
  where p.category_id is not null
),
usage_by_category as (
  select
    usage_source.category_id,
    array_agg(usage_source.kind order by usage_source.kind) as kinds
  from usage_source
  group by usage_source.category_id
)
update public.product_categories pc
set applies_to_kinds = usage_by_category.kinds
from usage_by_category
where usage_by_category.category_id = pc.id;

-- 4) Normalize values and set defaults for categories without direct usage.
--    Important: if products table is empty, fallback to legacy domain semantics:
--    - MENU -> venta
--    - INVENTORY -> insumo/preparacion/equipo
update public.product_categories pc
set applies_to_kinds = normalized.kinds
from (
  select
    id,
    coalesce(
      nullif(
        array(
          select distinct lower(trim(kind_value))
          from unnest(coalesce(applies_to_kinds, array[]::text[])) as kind_value
          where lower(trim(kind_value)) in ('insumo', 'preparacion', 'venta', 'equipo')
          order by 1
        ),
        array[]::text[]
      ),
      case
        when upper(nullif(trim(domain), '')) = 'MENU'
          then array['venta']::text[]
        when upper(nullif(trim(domain), '')) = 'INVENTORY'
          then array['insumo', 'preparacion', 'equipo']::text[]
        when nullif(trim(domain), '') is not null
          then array['venta']::text[]
        else array['insumo', 'preparacion', 'venta', 'equipo']::text[]
      end
    ) as kinds
  from public.product_categories
) as normalized
where normalized.id = pc.id;

-- 4.1) Clean non-sales domains to keep rule "domain only for venta".
update public.product_categories
set domain = null
where nullif(trim(domain), '') is not null
  and not (applies_to_kinds @> array['venta']::text[]);

alter table public.product_categories
  alter column applies_to_kinds
  set default array['insumo', 'preparacion', 'venta', 'equipo']::text[];

alter table public.product_categories
  alter column applies_to_kinds
  set not null;

-- 5) Integrity checks.
alter table public.product_categories
  drop constraint if exists product_categories_applies_to_kinds_nonempty_chk;
alter table public.product_categories
  drop constraint if exists product_categories_applies_to_kinds_allowed_chk;
alter table public.product_categories
  drop constraint if exists product_categories_domain_requires_venta_chk;

alter table public.product_categories
  add constraint product_categories_applies_to_kinds_nonempty_chk
  check (cardinality(applies_to_kinds) > 0);

alter table public.product_categories
  add constraint product_categories_applies_to_kinds_allowed_chk
  check (applies_to_kinds <@ array['insumo', 'preparacion', 'venta', 'equipo']::text[]);

alter table public.product_categories
  add constraint product_categories_domain_requires_venta_chk
  check (
    nullif(trim(domain), '') is null
    or applies_to_kinds @> array['venta']::text[]
  );

-- 6) Remove previous global slug uniqueness and move uniqueness to scoped path.
alter table public.product_categories
  drop constraint if exists product_categories_slug_key;
drop index if exists public.product_categories_slug_key;

create index if not exists idx_product_categories_scope_parent
  on public.product_categories(site_id, parent_id);

create index if not exists idx_product_categories_applies_to_kinds
  on public.product_categories using gin(applies_to_kinds);

create index if not exists idx_product_categories_domain
  on public.product_categories((coalesce(nullif(trim(domain), ''), '*')));

do $$
begin
  if exists (
    select 1
    from (
      select
        coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid) as scope_site,
        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) as scope_parent,
        coalesce(nullif(trim(domain), ''), '*') as scope_domain,
        lower(trim(name)) as scope_name,
        count(*) as dup_count
      from public.product_categories
      group by 1, 2, 3, 4
      having count(*) > 1
    ) as dup_name
  ) then
    raise notice 'Skipping unique index ux_product_categories_scope_parent_name due to duplicated scoped names.';
  else
    execute $sql$
      create unique index if not exists ux_product_categories_scope_parent_name
      on public.product_categories(
        coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(nullif(trim(domain), ''), '*'),
        lower(trim(name))
      )
    $sql$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_categories'
      and column_name = 'slug'
  ) then
    if exists (
      select 1
      from (
        select
          coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid) as scope_site,
          coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) as scope_parent,
          coalesce(nullif(trim(domain), ''), '*') as scope_domain,
          lower(trim(slug)) as scope_slug,
          count(*) as dup_count
        from public.product_categories
        where slug is not null and trim(slug) <> ''
        group by 1, 2, 3, 4
        having count(*) > 1
      ) as dup_slug
    ) then
      raise notice 'Skipping unique index ux_product_categories_scope_parent_slug due to duplicated scoped slugs.';
    else
      execute $sql$
        create unique index if not exists ux_product_categories_scope_parent_slug
        on public.product_categories(
          coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(nullif(trim(domain), ''), '*'),
          lower(trim(slug))
        )
        where slug is not null and trim(slug) <> ''
      $sql$;
    end if;
  end if;
end
$$;

commit;
