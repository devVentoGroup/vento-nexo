create table if not exists public.inventory_location_positions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  parent_position_id uuid references public.inventory_location_positions(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'section',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_location_positions_kind_check
    check (kind in ('section', 'shelf', 'level', 'zone', 'bin')),
  constraint inventory_location_positions_code_not_blank
    check (length(trim(code)) > 0),
  constraint inventory_location_positions_name_not_blank
    check (length(trim(name)) > 0)
);

create unique index if not exists inventory_location_positions_location_code_uidx
  on public.inventory_location_positions (location_id, code);

create index if not exists inventory_location_positions_site_idx
  on public.inventory_location_positions (site_id);

create index if not exists inventory_location_positions_location_idx
  on public.inventory_location_positions (location_id);

create index if not exists inventory_location_positions_parent_idx
  on public.inventory_location_positions (parent_position_id);

drop trigger if exists update_inventory_location_positions_updated_at
  on public.inventory_location_positions;

create trigger update_inventory_location_positions_updated_at
  before update on public.inventory_location_positions
  for each row
  execute function public.update_updated_at();

alter table public.inventory_location_positions enable row level security;

drop policy if exists "inventory_location_positions_select_site"
  on public.inventory_location_positions;
create policy "inventory_location_positions_select_site"
  on public.inventory_location_positions
  for select
  using (public.is_employee() and public.can_access_site(site_id));

drop policy if exists "inventory_location_positions_write_manager"
  on public.inventory_location_positions;
create policy "inventory_location_positions_write_manager"
  on public.inventory_location_positions
  for all
  using (
    public.is_owner()
    or public.is_global_manager()
    or (public.is_manager() and public.can_access_site(site_id))
  )
  with check (
    public.is_owner()
    or public.is_global_manager()
    or (public.is_manager() and public.can_access_site(site_id))
  );

grant all on table public.inventory_location_positions to anon;
grant all on table public.inventory_location_positions to authenticated;
grant all on table public.inventory_location_positions to service_role;

comment on table public.inventory_location_positions is
  'Sububicaciones internas dentro de un LOC operativo. No reemplazan al LOC; sirven para reportes, quioscos y detalle interno.';

comment on column public.inventory_location_positions.location_id is
  'LOC operativo visible para el trabajador, por ejemplo Bodega.';

comment on column public.inventory_location_positions.parent_position_id is
  'Permite jerarquia interna como Bodega > Estanteria 03 > Nivel 05.';

do $$
declare
  v_site_id uuid;
  v_location_id uuid;
  v_shelf_id uuid;
  v_i integer;
  v_level integer;
  v_code text;
begin
  select id
    into v_site_id
  from public.sites
  where code = 'CENTRO_PROD'
     or name ilike '%Centro%Produccion%'
  order by case when code = 'CENTRO_PROD' then 0 else 1 end
  limit 1;

  if v_site_id is null then
    return;
  end if;

  select id
    into v_location_id
  from public.inventory_locations
  where site_id = v_site_id
    and code = 'LOC-CP-BOD-MAIN'
  limit 1;

  if v_location_id is null then
    return;
  end if;

  for v_i in 1..12 loop
    v_code := 'EST-' || lpad(v_i::text, 2, '0');

    insert into public.inventory_location_positions (
      site_id,
      location_id,
      parent_position_id,
      code,
      name,
      kind,
      sort_order,
      is_active
    )
    values (
      v_site_id,
      v_location_id,
      null,
      v_code,
      'Estanteria ' || v_i,
      'shelf',
      v_i,
      true
    )
    on conflict (location_id, code) do update
      set name = excluded.name,
          kind = excluded.kind,
          sort_order = excluded.sort_order,
          is_active = true,
          updated_at = now()
    returning id into v_shelf_id;

    for v_level in 1..6 loop
      insert into public.inventory_location_positions (
        site_id,
        location_id,
        parent_position_id,
        code,
        name,
        kind,
        sort_order,
        is_active
      )
      values (
        v_site_id,
        v_location_id,
        v_shelf_id,
        v_code || '-NIVEL-' || lpad(v_level::text, 2, '0'),
        'Nivel ' || v_level,
        'level',
        v_level,
        true
      )
      on conflict (location_id, code) do update
        set parent_position_id = excluded.parent_position_id,
            name = excluded.name,
            kind = excluded.kind,
            sort_order = excluded.sort_order,
            is_active = true,
            updated_at = now();
    end loop;
  end loop;

  insert into public.inventory_location_positions (
    site_id,
    location_id,
    parent_position_id,
    code,
    name,
    kind,
    sort_order,
    is_active
  )
  values
    (v_site_id, v_location_id, null, 'ENLATADOS-BEBIDAS', 'Enlatados y bebidas', 'zone', 101, true),
    (v_site_id, v_location_id, null, 'EMPAQUES', 'Empaques', 'zone', 102, true)
  on conflict (location_id, code) do update
    set parent_position_id = excluded.parent_position_id,
        name = excluded.name,
        kind = excluded.kind,
        sort_order = excluded.sort_order,
        is_active = true,
        updated_at = now();
end $$;
