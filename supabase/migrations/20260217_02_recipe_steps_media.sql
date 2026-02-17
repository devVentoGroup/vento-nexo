begin;

alter table if exists public.recipe_steps
  add column if not exists step_image_url text;

alter table if exists public.recipe_steps
  add column if not exists step_video_url text;

comment on column public.recipe_steps.step_image_url is
  'Foto opcional para documentar visualmente el paso de la receta.';

comment on column public.recipe_steps.step_video_url is
  'URL opcional de video para el paso de la receta (YouTube, Drive u origen interno).';

commit;
