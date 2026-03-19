begin;

-- Conductor: despacho (transit) + recepción, sin flujo de preparación de bodega.
-- La UI usa inventory.remissions.prepare vs transit según role_permissions, no por nombre de rol en código.

delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and ap.code = 'inventory.remissions.prepare'
  and rp.role = 'conductor';

commit;
