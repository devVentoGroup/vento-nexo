alter table public.recipe_cards
  add column if not exists process_config jsonb not null default '{}'::jsonb;

comment on column public.recipe_cards.process_config is
  'Configuracion dinamica de proceso por receta: empaque al vacio, coccion controlada, conservacion especial y etiquetado.';
