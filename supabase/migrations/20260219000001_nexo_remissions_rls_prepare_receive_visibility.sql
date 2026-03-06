begin;

-- 1) RLS visibility: allow read access with remissions base permission OR prepare/receive permissions.
drop policy if exists "restock_requests_select_permission" on public.restock_requests;
create policy "restock_requests_select_permission" on public.restock_requests
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.remissions', from_site_id)
    or public.has_permission('nexo.inventory.remissions', to_site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.all_sites')
  );

drop policy if exists "restock_request_items_select_permission" on public.restock_request_items;
create policy "restock_request_items_select_permission" on public.restock_request_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.all_sites')
        )
    )
  );

-- 2) Role grants: bodeguero can view/prepare/receive remissions, but cannot request.
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  )
on conflict do nothing;

delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and rp.role = 'bodeguero'
  and ap.code = 'inventory.remissions.request';

commit;
