begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by product_id, site_id
      order by
        case when coalesce(is_active, false) then 1 else 0 end desc,
        coalesce(updated_at, created_at, now()) desc,
        created_at desc,
        id desc
    ) as rn
  from public.product_site_settings
)
delete from public.product_site_settings p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists ux_product_site_settings_product_site
  on public.product_site_settings(product_id, site_id);

commit;
