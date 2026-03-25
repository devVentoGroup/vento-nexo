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
    '1.1.2',
    '1.1.2',
    true,
    'https://apps.apple.com/us/app/anima-vento-group/id6758404929',
    'Actualización obligatoria',
    'Debes actualizar ANIMA a la versión 1.1.2 para continuar.',
    true
  ),
  (
    'vento_anima',
    'android',
    '1.1.2',
    '1.1.2',
    true,
    'https://play.google.com/store/apps/details?id=com.vento.anima',
    'Actualización obligatoria',
    'Debes actualizar ANIMA a la versión 1.1.2 para continuar.',
    true
  )
on conflict (app_key, platform) do update
set
  min_version = excluded.min_version,
  latest_version = excluded.latest_version,
  force_update = excluded.force_update,
  store_url = excluded.store_url,
  title = excluded.title,
  message = excluded.message,
  is_enabled = excluded.is_enabled,
  updated_at = now();

commit;
