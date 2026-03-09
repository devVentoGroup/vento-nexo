begin;

insert into club.plans (
  code,
  name,
  currency,
  price_minor,
  billing_period,
  is_active,
  metadata
)
values (
  'club_monthly_co_v1',
  'Vento Club Mensual',
  'COP',
  14900,
  'monthly',
  true,
  jsonb_build_object(
    'country', 'CO',
    'benefit_core', 'cashback_booster'
  )
)
on conflict (code) do update
set
  name = excluded.name,
  currency = excluded.currency,
  price_minor = excluded.price_minor,
  billing_period = excluded.billing_period,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

insert into club.store_products (
  plan_id,
  platform,
  store_product_id,
  is_active,
  metadata
)
select
  p.id,
  t.platform,
  t.store_product_id,
  true,
  '{}'::jsonb
from club.plans p
join (
  values
    ('ios'::text, 'co.ventogroup.ventopass.club.monthly'),
    ('android'::text, 'co.ventogroup.ventopass.club.monthly')
) as t(platform, store_product_id)
  on true
where p.code = 'club_monthly_co_v1'
on conflict (platform, store_product_id) do update
set
  plan_id = excluded.plan_id,
  is_active = excluded.is_active,
  updated_at = now();

insert into club.cashback_rules (
  code,
  percent_bps,
  min_order_total_minor,
  cap_per_order_minor,
  cap_monthly_minor,
  settlement_delay_hours,
  is_active,
  filters
)
values (
  'club_booster_v1',
  250,
  0,
  800000,
  3500000,
  24,
  true,
  '{}'::jsonb
)
on conflict (code) do update
set
  percent_bps = excluded.percent_bps,
  min_order_total_minor = excluded.min_order_total_minor,
  cap_per_order_minor = excluded.cap_per_order_minor,
  cap_monthly_minor = excluded.cap_monthly_minor,
  settlement_delay_hours = excluded.settlement_delay_hours,
  is_active = excluded.is_active,
  filters = excluded.filters,
  updated_at = now();

-- Solo sembrar el acceso beta si el usuario ya existe en auth.users.
insert into club.beta_access (
  user_id,
  enabled,
  role,
  notes
)
select
  u.id,
  true,
  'owner_private_beta',
  'Acceso privado inicial de Vento Club MVP'
from auth.users u
where u.id = '194649ee-3f1c-42ea-a44a-2abd87053c46'::uuid
on conflict (user_id) do update
set
  enabled = excluded.enabled,
  role = excluded.role,
  notes = excluded.notes,
  updated_at = now();

commit;
