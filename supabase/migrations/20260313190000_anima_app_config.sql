-- Config global de la app ANIMA: locale, timezone, feature flags, textos clave.
-- La app y las edge functions leen esta tabla; sin filas se usan valores por defecto/env.
create table if not exists public.app_config (
  key text not null primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.app_config is 'Config global ANIMA: locale, timezone, feature_flags, textos (key/value). Sin filas la app usa defaults.';

alter table public.app_config enable row level security;

create policy app_config_select_authenticated
  on public.app_config for select to authenticated using (true);

-- Opcional: permitir lectura anónima para config pública (ej. pantalla de login)
create policy app_config_select_anon
  on public.app_config for select to anon using (true);

-- Seed inicial: locale y timezone por defecto; feature_flags vacío; se pueden añadir textos después.
insert into public.app_config (key, value)
values
  ('locale', '"es-CO"'),
  ('timezone', '"America/Bogota"'),
  ('feature_flags', '{}')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
