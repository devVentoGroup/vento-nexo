begin;

alter table public.product_cost_events
  drop constraint if exists product_cost_events_source_chk;

alter table public.product_cost_events
  add constraint product_cost_events_source_chk
  check (source in ('entry', 'adjust', 'production'));

commit;
