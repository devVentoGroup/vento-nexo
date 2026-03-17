begin;

update public.product_site_settings pss
set audience = 'BOTH',
    updated_at = now()
from public.products p
where p.id = pss.product_id
  and p.sku like 'SBXV1-%'
  and pss.site_id in (
    select id
    from public.sites
    where code in ('CP', 'SAU')
  );

commit;
