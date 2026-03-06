-- Sedes por defecto para Vento OS (Centro, Saudo, Vento Café)
-- Si ya existen por code, no se insertan.

insert into public.sites (code, name, type, site_type, site_kind, is_active)
values
  ('CP', 'Centro de producción', 'operacional', 'production_center'::public.site_type, 'warehouse', true),
  ('SAU', 'Saudo', 'operacional', 'satellite'::public.site_type, 'store', true),
  ('VCF', 'Vento Café', 'operacional', 'satellite'::public.site_type, 'store', true)
on conflict (code) do nothing;
