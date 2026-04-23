begin;

create or replace function public.create_inventory_count_session_with_lines(
  p_site_id uuid,
  p_scope_type text,
  p_scope_zone text,
  p_scope_location_id uuid,
  p_name text,
  p_created_by uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_scope_type text := lower(coalesce(nullif(trim(p_scope_type), ''), 'site'));
  v_scope_zone text := nullif(trim(coalesce(p_scope_zone, '')), '');
  v_session_id uuid;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'p_lines debe ser un arreglo JSON';
  end if;

  if v_scope_type not in ('site', 'zone', 'loc') then
    raise exception 'scope_type inválido: %', v_scope_type;
  end if;
  if v_scope_type = 'loc' and p_scope_location_id is null then
    raise exception 'scope_location_id requerido para scope_type=loc';
  end if;
  if v_scope_type = 'zone' and v_scope_zone is null then
    raise exception 'scope_zone requerido para scope_type=zone';
  end if;

  create temporary table tmp_count_lines_input (
    product_id uuid not null,
    quantity numeric not null
  ) on commit drop;

  insert into tmp_count_lines_input (product_id, quantity)
  select
    (entry ->> 'product_id')::uuid as product_id,
    (entry ->> 'quantity')::numeric as quantity
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) entry
  where coalesce((entry ->> 'quantity')::numeric, 0) > 0;

  select count(*) into v_count from tmp_count_lines_input;
  if v_count = 0 then
    raise exception 'Al menos una línea con cantidad > 0';
  end if;

  insert into public.inventory_count_sessions (
    site_id,
    status,
    scope_type,
    scope_zone,
    scope_location_id,
    name,
    created_by
  )
  values (
    p_site_id,
    'open',
    v_scope_type,
    case when v_scope_type = 'zone' then v_scope_zone else null end,
    case when v_scope_type = 'loc' then p_scope_location_id else null end,
    coalesce(
      nullif(trim(p_name), ''),
      case
        when v_scope_type = 'zone' then format('Conteo zona %s', v_scope_zone)
        when v_scope_type = 'loc' then 'Conteo por LOC'
        else 'Conteo'
      end
    ),
    p_created_by
  )
  returning id into v_session_id;

  if v_scope_type = 'loc' then
    insert into public.inventory_count_lines (
      session_id,
      product_id,
      quantity_counted,
      current_qty_at_open
    )
    select
      v_session_id,
      li.product_id,
      li.quantity,
      coalesce(loc.current_qty, 0)
    from tmp_count_lines_input li
    left join public.inventory_stock_by_location loc
      on loc.location_id = p_scope_location_id
     and loc.product_id = li.product_id;
  elsif v_scope_type = 'zone' then
    insert into public.inventory_count_lines (
      session_id,
      product_id,
      quantity_counted,
      current_qty_at_open
    )
    select
      v_session_id,
      li.product_id,
      li.quantity,
      coalesce(sum(loc.current_qty), 0)
    from tmp_count_lines_input li
    left join public.inventory_locations il
      on il.site_id = p_site_id
     and il.zone = v_scope_zone
    left join public.inventory_stock_by_location loc
      on loc.location_id = il.id
     and loc.product_id = li.product_id
    group by li.product_id, li.quantity;
  else
    insert into public.inventory_count_lines (
      session_id,
      product_id,
      quantity_counted,
      current_qty_at_open
    )
    select
      v_session_id,
      li.product_id,
      li.quantity,
      coalesce(site.current_qty, 0)
    from tmp_count_lines_input li
    left join public.inventory_stock_by_site site
      on site.site_id = p_site_id
     and site.product_id = li.product_id;
  end if;

  return jsonb_build_object(
    'countSessionId', v_session_id,
    'count', v_count
  );
end;
$$;

create or replace function public.apply_inventory_site_count(
  p_site_id uuid,
  p_user_id uuid,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'p_lines debe ser un arreglo JSON';
  end if;

  create temporary table tmp_site_count_lines (
    product_id uuid not null,
    quantity numeric not null
  ) on commit drop;

  insert into tmp_site_count_lines (product_id, quantity)
  select
    (entry ->> 'product_id')::uuid as product_id,
    (entry ->> 'quantity')::numeric as quantity
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) entry
  where coalesce((entry ->> 'quantity')::numeric, 0) > 0;

  select count(*) into v_count from tmp_site_count_lines;
  if v_count = 0 then
    raise exception 'Al menos una línea con cantidad > 0';
  end if;

  insert into public.inventory_movements (
    site_id,
    product_id,
    movement_type,
    quantity,
    input_qty,
    input_unit_code,
    conversion_factor_to_stock,
    stock_unit_code,
    note,
    created_by
  )
  select
    p_site_id,
    l.product_id,
    'count',
    l.quantity,
    l.quantity,
    coalesce(p.stock_unit_code, p.unit, 'un'),
    1,
    coalesce(p.stock_unit_code, p.unit, 'un'),
    p_note,
    p_user_id
  from tmp_site_count_lines l
  left join public.products p on p.id = l.product_id;

  insert into public.inventory_stock_by_site (
    site_id,
    product_id,
    current_qty,
    updated_at
  )
  select
    p_site_id,
    l.product_id,
    l.quantity,
    now()
  from tmp_site_count_lines l
  on conflict (site_id, product_id) do update
    set current_qty = excluded.current_qty,
        updated_at = excluded.updated_at;

  return jsonb_build_object('count', v_count);
end;
$$;

create or replace function public.close_inventory_count_session(
  p_session_id uuid,
  p_closed_by uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_session record;
  v_count integer := 0;
begin
  select *
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sesión no encontrada';
  end if;
  if coalesce(v_session.status, '') <> 'open' then
    raise exception 'Sesión debe estar abierta';
  end if;

  create temporary table tmp_count_current (
    product_id uuid primary key,
    current_qty numeric not null
  ) on commit drop;

  if coalesce(v_session.scope_type, '') = 'loc' and v_session.scope_location_id is not null then
    insert into tmp_count_current (product_id, current_qty)
    select l.product_id, coalesce(s.current_qty, 0)
    from public.inventory_count_lines l
    left join public.inventory_stock_by_location s
      on s.location_id = v_session.scope_location_id
     and s.product_id = l.product_id
    where l.session_id = p_session_id;
  elsif coalesce(v_session.scope_type, '') = 'zone' and coalesce(v_session.scope_zone, '') <> '' then
    insert into tmp_count_current (product_id, current_qty)
    select
      l.product_id,
      coalesce(sum(s.current_qty), 0) as current_qty
    from public.inventory_count_lines l
    left join public.inventory_locations il
      on il.site_id = v_session.site_id
     and il.zone = v_session.scope_zone
    left join public.inventory_stock_by_location s
      on s.location_id = il.id
     and s.product_id = l.product_id
    where l.session_id = p_session_id
    group by l.product_id;
  else
    insert into tmp_count_current (product_id, current_qty)
    select l.product_id, coalesce(s.current_qty, 0)
    from public.inventory_count_lines l
    left join public.inventory_stock_by_site s
      on s.site_id = v_session.site_id
     and s.product_id = l.product_id
    where l.session_id = p_session_id;
  end if;

  update public.inventory_count_lines l
  set
    current_qty_at_close = coalesce(c.current_qty, 0),
    quantity_delta = coalesce(l.quantity_counted, 0) - coalesce(c.current_qty, 0)
  from tmp_count_current c
  where l.session_id = p_session_id
    and l.product_id = c.product_id;

  update public.inventory_count_sessions
  set
    status = 'closed',
    closed_at = now(),
    closed_by = p_closed_by
  where id = p_session_id;

  select count(*) into v_count
  from public.inventory_count_lines
  where session_id = p_session_id;

  return jsonb_build_object('sessionId', p_session_id, 'count', v_count);
end;
$$;

create or replace function public.apply_inventory_count_adjustments(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_session record;
  v_line record;
  v_stock_unit_code text;
  v_applied integer := 0;
begin
  select *
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sesión no encontrada';
  end if;
  if coalesce(v_session.status, '') <> 'closed' then
    raise exception 'Sesión debe estar cerrada';
  end if;

  for v_line in
    select l.id, l.product_id, coalesce(l.quantity_delta, 0) as delta
    from public.inventory_count_lines l
    where l.session_id = p_session_id
      and coalesce(l.quantity_delta, 0) <> 0
      and l.adjustment_applied_at is null
    for update
  loop
    select coalesce(p.stock_unit_code, p.unit, 'un')
    into v_stock_unit_code
    from public.products p
    where p.id = v_line.product_id;

    insert into public.inventory_movements (
      site_id,
      product_id,
      movement_type,
      quantity,
      input_qty,
      input_unit_code,
      conversion_factor_to_stock,
      stock_unit_code,
      note,
      created_by
    )
    values (
      v_session.site_id,
      v_line.product_id,
      'adjustment',
      v_line.delta,
      abs(v_line.delta),
      v_stock_unit_code,
      1,
      v_stock_unit_code,
      format('Ajuste por conteo sesión %s', p_session_id),
      p_user_id
    );

    if coalesce(v_session.scope_type, '') = 'loc' and v_session.scope_location_id is not null then
      perform public.upsert_inventory_stock_by_location(
        v_session.scope_location_id,
        v_line.product_id,
        v_line.delta
      );
    end if;

    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_session.site_id, v_line.product_id, greatest(0, v_line.delta), now())
    on conflict (site_id, product_id) do update
      set current_qty = greatest(0, coalesce(public.inventory_stock_by_site.current_qty, 0) + v_line.delta),
          updated_at = now();

    update public.inventory_count_lines
    set adjustment_applied_at = now()
    where id = v_line.id;

    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('sessionId', p_session_id, 'applied', v_applied);
end;
$$;

grant execute on function public.create_inventory_count_session_with_lines(uuid, text, text, uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.apply_inventory_site_count(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.close_inventory_count_session(uuid, uuid) to authenticated;
grant execute on function public.apply_inventory_count_adjustments(uuid, uuid) to authenticated;

commit;
