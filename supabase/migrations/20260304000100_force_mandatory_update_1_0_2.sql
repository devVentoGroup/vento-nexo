begin;

insert into public.app_update_policies (
  app_key,
  platform,
  min_version,
  latest_version,
  force_update,
  store_url,
  title,
  message,
  is_enabled
)
values
  (
    'vento_pass',
    'ios',
    '1.0.2',
    '1.0.2',
    true,
    'https://pass.ventogroup.co',
    'Actualización obligatoria',
    'Para continuar, actualiza Vento Pass a la versión 1.0.2.',
    true
  ),
  (
    'vento_pass',
    'android',
    '1.0.2',
    '1.0.2',
    true,
    'https://pass.ventogroup.co',
    'Actualización obligatoria',
    'Para continuar, actualiza Vento Pass a la versión 1.0.2.',
    true
  )
on conflict (app_key, platform) do update
set
  min_version = excluded.min_version,
  latest_version = excluded.latest_version,
  force_update = excluded.force_update,
  is_enabled = excluded.is_enabled,
  title = excluded.title,
  message = excluded.message,
  store_url = coalesce(public.app_update_policies.store_url, excluded.store_url),
  updated_at = now();

commit;
