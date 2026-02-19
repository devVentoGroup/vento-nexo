begin;

alter table if exists public.product_site_settings
  add column if not exists audience text;

update public.product_site_settings
set audience = coalesce(nullif(trim(upper(audience)), ''), 'BOTH');

alter table public.product_site_settings
  alter column audience set default 'BOTH';

alter table public.product_site_settings
  alter column audience set not null;

alter table public.product_site_settings
  drop constraint if exists product_site_settings_audience_chk;

alter table public.product_site_settings
  add constraint product_site_settings_audience_chk
  check (audience in ('SAUDO', 'VCF', 'BOTH', 'INTERNAL'));

create index if not exists idx_product_site_settings_site_active_audience
  on public.product_site_settings(site_id, is_active, audience);

do $$
begin
  if exists (
    select 1
    from (
      select product_id, site_id, count(*) as dup_count
      from public.product_site_settings
      group by 1, 2
      having count(*) > 1
    ) as dup_rows
  ) then
    raise notice 'Skipping unique index ux_product_site_settings_product_site due to duplicated product/site rows.';
  else
    execute $sql$
      create unique index if not exists ux_product_site_settings_product_site
      on public.product_site_settings(product_id, site_id)
    $sql$;
  end if;
end
$$;

commit;
