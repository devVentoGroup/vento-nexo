-- Foundation: tables/types for Soporte (support_tickets/support_messages)
-- Needed before migrations that ALTER support_tickets (e.g. 20260316120000...).

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'support_ticket_status'
  ) then
    create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
  end if;
end $$;

create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() not null,
  created_by uuid not null,
  site_id uuid,
  category text default 'attendance'::text not null,
  title text not null,
  description text,
  status public.support_ticket_status default 'open'::public.support_ticket_status not null,
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint support_tickets_pkey primary key (id)
);

create table if not exists public.support_messages (
  id uuid default gen_random_uuid() not null,
  ticket_id uuid not null,
  author_id uuid not null,
  body text not null,
  created_at timestamptz default now() not null,
  constraint support_messages_pkey primary key (id)
);

