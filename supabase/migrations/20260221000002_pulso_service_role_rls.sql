begin;

-- Ensure service aliases can use Pulso POS permissions.
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  select 'mesero'::text as role
) r on true
where a.code = 'pulso'
  and ap.code in ('access', 'pos.main')
on conflict do nothing;

-- Ensure cashier and waiter can operate Pulso in production centers too.
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, st.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  select 'cajero'::text as role
  union all
  select 'mesero'::text as role
) r on true
join (
  select 'satellite'::public.site_type as site_type
  union all
  select 'production_center'::public.site_type as site_type
) st on true
where a.code = 'pulso'
  and ap.code in ('access', 'pos.main')
on conflict do nothing;

drop policy if exists "users_select_cashier" on public.users;
create policy "users_select_cashier" on public.users for select to authenticated
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (
        array[
          'propietario'::text,
          'gerente'::text,
          'gerente_general'::text,
          'cajero'::text,
          'mesero'::text
        ]
      )
  ));

drop policy if exists "users_select_cashier_for_qr" on public.users;
create policy "users_select_cashier_for_qr" on public.users for select to authenticated
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (
        array[
          'propietario'::text,
          'gerente'::text,
          'gerente_general'::text,
          'cajero'::text,
          'mesero'::text
        ]
      )
  ));

drop policy if exists "loyalty_redemptions_select_cashier" on public.loyalty_redemptions;
create policy "loyalty_redemptions_select_cashier" on public.loyalty_redemptions for select to authenticated
  using (exists (
    select 1
    from public.employees e
    join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (
        array[
          'propietario'::text,
          'gerente'::text,
          'gerente_general'::text,
          'cajero'::text,
          'mesero'::text
        ]
      )
      and (
        e.site_id = r.site_id
        or exists (
          select 1
          from public.employee_sites es
          where es.employee_id = e.id
            and es.is_active = true
            and es.site_id = r.site_id
        )
      )
  ));

drop policy if exists "loyalty_redemptions_validate_cashier" on public.loyalty_redemptions;
create policy "loyalty_redemptions_validate_cashier" on public.loyalty_redemptions for update to authenticated
  using (
    status = 'pending'::text
    and exists (
      select 1
      from public.employees e
      join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
      where e.id = auth.uid()
        and e.is_active = true
        and e.role = any (
          array[
            'propietario'::text,
            'gerente'::text,
            'gerente_general'::text,
            'cajero'::text,
            'mesero'::text
          ]
        )
        and (
          e.site_id = r.site_id
          or exists (
            select 1
            from public.employee_sites es
            where es.employee_id = e.id
              and es.is_active = true
              and es.site_id = r.site_id
          )
        )
    )
  )
  with check (
    status = 'validated'::text
    and exists (
      select 1
      from public.employees e
      join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
      where e.id = auth.uid()
        and e.is_active = true
        and e.role = any (
          array[
            'propietario'::text,
            'gerente'::text,
            'gerente_general'::text,
            'cajero'::text,
            'mesero'::text
          ]
        )
        and (
          e.site_id = r.site_id
          or exists (
            select 1
            from public.employee_sites es
            where es.employee_id = e.id
              and es.is_active = true
              and es.site_id = r.site_id
          )
        )
    )
  );

commit;
