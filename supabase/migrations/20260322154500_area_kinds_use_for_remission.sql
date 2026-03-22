-- Proposito por tipo de area: remisiones (NEXO v2).
-- Permite filtrar areas operativas por flujo sin perder la segmentacion por sede.

alter table if exists public.area_kinds
  add column if not exists use_for_remission boolean not null default false;

update public.area_kinds
set use_for_remission = true
where code in ('mostrador', 'bar', 'cocina', 'general');

comment on column public.area_kinds.use_for_remission
  is 'Si true, esta area se puede usar en flujos de remision (solicitud/alistamiento).';
