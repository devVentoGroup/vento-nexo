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
  check (audience in ('SAUDO', 'VCF', 'BOTH'));

create index if not exists idx_product_site_settings_site_active_audience
  on public.product_site_settings(site_id, is_active, audience);

commit;
