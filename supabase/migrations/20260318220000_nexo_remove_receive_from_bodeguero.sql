begin;

delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and rp.role = 'bodeguero'
  and ap.code = 'inventory.remissions.receive';

commit;
