begin;

update public.app_update_policies
set
  store_url = 'https://apps.apple.com/us/app/anima-vento-group/id6758404929',
  updated_at = now()
where app_key = 'vento_anima'
  and platform = 'ios';

commit;
