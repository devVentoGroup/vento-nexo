-- Foundation: asegúrate de que exista document_scope y document_types
-- antes de migraciones que hacen ALTER/REFERENCES sobre esas tablas.
-- Esto evita que un reset local falle por depender de un esquema "remoto"
-- que no está en el baseline.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'document_scope'
  ) then
    create type public.document_scope as enum ('employee', 'site', 'group');
  end if;
end $$;

create table if not exists public.document_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  scope public.document_scope default 'employee'::public.document_scope not null,
  requires_expiry boolean default false not null,
  validity_months integer,
  reminder_days integer default 7 not null,
  is_active boolean default true not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_order integer default 999 not null,
  constraint document_types_pkey primary key (id)
);

create index if not exists document_types_display_order_idx
  on public.document_types (display_order, name);

create unique index if not exists document_types_name_scope_idx
  on public.document_types (name, scope);

