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
    'vento_anima',
    'ios',
    '1.1.0',
    '1.1.0',
    false,
    'https://apps.apple.com/app/id0000000000',
    'Actualización disponible',
    'Hay una nueva versión de ANIMA.',
    true
  ),
  (
    'vento_anima',
    'android',
    '1.1.0',
    '1.1.0',
    false,
    'https://play.google.com/store/apps/details?id=com.vento.anima',
    'Actualización disponible',
    'Hay una nueva versión de ANIMA.',
    true
  ),
  (
    'vento_anima_dev',
    'ios',
    '0.0.0',
    null,
    false,
    null,
    'Build de desarrollo',
    'Política de actualización desactivada para build dev.',
    false
  ),
  (
    'vento_anima_dev',
    'android',
    '0.0.0',
    null,
    false,
    null,
    'Build de desarrollo',
    'Política de actualización desactivada para build dev.',
    false
  )
on conflict (app_key, platform) do update
set
  min_version = excluded.min_version,
  latest_version = excluded.latest_version,
  force_update = excluded.force_update,
  title = excluded.title,
  message = excluded.message,
  is_enabled = excluded.is_enabled,
  store_url = coalesce(public.app_update_policies.store_url, excluded.store_url),
  updated_at = now();

commit;
