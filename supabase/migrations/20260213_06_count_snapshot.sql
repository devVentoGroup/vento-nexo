do $$
begin
  if to_regclass('public.inventory_count_lines') is not null then
    alter table public.inventory_count_lines
      add column if not exists current_qty_at_open numeric;

    update public.inventory_count_lines
    set current_qty_at_open = coalesce(current_qty_at_open, current_qty_at_close, 0)
    where current_qty_at_open is null;
  end if;

  if to_regclass('public.inventory_count_sessions') is not null then
    alter table public.inventory_count_sessions
      add column if not exists scope_zone text;

    with ranked as (
      select
        id,
        row_number() over (
          partition by
            site_id,
            coalesce(scope_type, 'site'),
            coalesce(scope_zone, ''),
            coalesce(scope_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
          order by created_at desc, id desc
        ) as rn
      from public.inventory_count_sessions
      where status = 'open'
    )
    update public.inventory_count_sessions s
    set status = 'closed',
        closed_at = now()
    from ranked r
    where s.id = r.id
      and r.rn > 1;

    create unique index if not exists idx_inventory_count_sessions_open_scope_unique
      on public.inventory_count_sessions (
        site_id,
        coalesce(scope_type, 'site'),
        coalesce(scope_zone, ''),
        coalesce(scope_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      where status = 'open';
  end if;
end
$$;
