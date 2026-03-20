begin;

-- 1) New explicit permission: edit own pending remissions.
insert into public.app_permissions (app_id, code, name, description)
select
  id,
  'inventory.remissions.edit_own_pending',
  'Remisiones: Editar propia pendiente',
  'Editar una remision propia mientras siga en estado pending'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

-- 2) Grant this permission to satellite operator roles.
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select
  r.role,
  ap.id,
  'site_type'::public.permission_scope_type,
  'satellite'::public.site_type
from public.app_permissions ap
join public.apps a
  on a.id = ap.app_id
join (
  values
    ('cajero'),
    ('barista'),
    ('cocinero')
) as r(role)
  on true
where a.code = 'nexo'
  and ap.code = 'inventory.remissions.edit_own_pending'
on conflict do nothing;

-- 3) Parent request update:
-- managers still update by operational permissions;
-- creators can update only their own request, only while pending,
-- and only if they have the explicit DB permission.
drop policy if exists "restock_requests_update_permission" on public.restock_requests;
create policy "restock_requests_update_permission" on public.restock_requests
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
    or (
      created_by = auth.uid()
      and status = 'pending'
      and to_site_id is not null
      and public.has_permission('nexo.inventory.remissions.edit_own_pending', to_site_id)
    )
  )
  with check (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
    or (
      created_by = auth.uid()
      and status = 'pending'
      and to_site_id is not null
      and public.has_permission('nexo.inventory.remissions.edit_own_pending', to_site_id)
    )
  );

-- 4) Parent request delete:
-- remove creator hardcode; only cancel-capable roles can delete/cancel.
drop policy if exists "restock_requests_delete_permission" on public.restock_requests;
create policy "restock_requests_delete_permission" on public.restock_requests
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.cancel')
  );

-- 5) Child items insert:
-- creators can add items only to their own pending request with the explicit permission.
drop policy if exists "restock_request_items_insert_permission" on public.restock_request_items;
create policy "restock_request_items_insert_permission" on public.restock_request_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
          or (
            r.created_by = auth.uid()
            and r.status = 'pending'
            and r.to_site_id is not null
            and public.has_permission('nexo.inventory.remissions.edit_own_pending', r.to_site_id)
          )
        )
    )
  );

-- 6) Child items update:
-- same rule for editing line items.
drop policy if exists "restock_request_items_update_permission" on public.restock_request_items;
create policy "restock_request_items_update_permission" on public.restock_request_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
          or (
            r.created_by = auth.uid()
            and r.status = 'pending'
            and r.to_site_id is not null
            and public.has_permission('nexo.inventory.remissions.edit_own_pending', r.to_site_id)
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
          or (
            r.created_by = auth.uid()
            and r.status = 'pending'
            and r.to_site_id is not null
            and public.has_permission('nexo.inventory.remissions.edit_own_pending', r.to_site_id)
          )
        )
    )
  );

-- 7) Child items delete:
-- remove creator hardcode and replace it with the same explicit permission rule.
drop policy if exists "restock_request_items_delete_permission" on public.restock_request_items;
create policy "restock_request_items_delete_permission" on public.restock_request_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.cancel')
          or public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or (
            r.created_by = auth.uid()
            and r.status = 'pending'
            and r.to_site_id is not null
            and public.has_permission('nexo.inventory.remissions.edit_own_pending', r.to_site_id)
          )
        )
    )
  );

commit;