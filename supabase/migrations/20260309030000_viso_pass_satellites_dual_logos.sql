begin;

alter table public.pass_satellites
  add column if not exists card_logo_url text,
  add column if not exists header_logo_url text;

commit;
