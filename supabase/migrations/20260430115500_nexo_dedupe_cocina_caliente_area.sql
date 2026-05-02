begin;

do $$
declare
  v_site_id uuid;
  v_keep_area_id uuid;
begin
  select id
    into v_site_id
  from public.sites
  where lower(name) in ('centro de produccion', 'centro de producción')
  order by created_at nulls last, id
  limit 1;

  if v_site_id is null then
    return;
  end if;

  select a.id
    into v_keep_area_id
  from public.areas a
  where a.site_id = v_site_id
    and coalesce(a.is_active, true) = true
    and (
      a.kind = 'cocina_caliente'
      or lower(a.name) = 'cocina caliente'
      or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
    )
  order by
    case when upper(a.code) = 'COC-CAL' then 1 else 0 end,
    a.created_at nulls last,
    a.id
  limit 1;

  if v_keep_area_id is null then
    return;
  end if;

  update public.areas
  set name = 'Cocina caliente',
      kind = 'cocina_caliente',
      is_active = true
  where id = v_keep_area_id;

  update public.inventory_locations loc
  set area_id = v_keep_area_id
  where loc.site_id = v_site_id
    and loc.area_id in (
      select a.id
      from public.areas a
      where a.site_id = v_site_id
        and a.id <> v_keep_area_id
        and (
          a.kind = 'cocina_caliente'
          or lower(a.name) = 'cocina caliente'
          or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
        )
    );

  update public.employees employee
  set area_id = v_keep_area_id
  where employee.site_id = v_site_id
    and employee.area_id in (
      select a.id
      from public.areas a
      where a.site_id = v_site_id
        and a.id <> v_keep_area_id
        and (
          a.kind = 'cocina_caliente'
          or lower(a.name) = 'cocina caliente'
          or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
        )
    );

  delete from public.employee_areas ea
  where ea.area_id in (
      select a.id
      from public.areas a
      where a.site_id = v_site_id
        and a.id <> v_keep_area_id
        and (
          a.kind = 'cocina_caliente'
          or lower(a.name) = 'cocina caliente'
          or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
        )
    )
    and exists (
      select 1
      from public.employee_areas keep
      where keep.employee_id = ea.employee_id
        and keep.area_id = v_keep_area_id
    );

  update public.employee_areas ea
  set area_id = v_keep_area_id
  where ea.area_id in (
    select a.id
    from public.areas a
    where a.site_id = v_site_id
      and a.id <> v_keep_area_id
      and (
        a.kind = 'cocina_caliente'
        or lower(a.name) = 'cocina caliente'
        or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
      )
  );

  update public.employee_area_purpose_assignments assignment
  set area_id = v_keep_area_id,
      updated_at = now()
  where assignment.site_id = v_site_id
    and assignment.area_id in (
      select a.id
      from public.areas a
      where a.site_id = v_site_id
        and a.id <> v_keep_area_id
        and (
          a.kind = 'cocina_caliente'
          or lower(a.name) = 'cocina caliente'
          or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
        )
    );

  update public.recipe_cards recipe
  set area_id = v_keep_area_id
  where recipe.area_id in (
    select a.id
    from public.areas a
    where a.site_id = v_site_id
      and a.id <> v_keep_area_id
      and (
        a.kind = 'cocina_caliente'
        or lower(a.name) = 'cocina caliente'
        or upper(a.code) in ('COCINA_CALIENTE', 'COC-CAL')
      )
  );

  update public.areas duplicate
  set is_active = false,
      name = duplicate.name || ' (duplicada)'
  where duplicate.site_id = v_site_id
    and duplicate.id <> v_keep_area_id
    and coalesce(duplicate.is_active, true) = true
    and (
      duplicate.kind = 'cocina_caliente'
      or lower(duplicate.name) = 'cocina caliente'
      or upper(duplicate.code) in ('COCINA_CALIENTE', 'COC-CAL')
    );
end $$;

commit;
