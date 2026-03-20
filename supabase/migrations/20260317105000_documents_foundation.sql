-- Foundation: asegurar que exista public.documents antes de migraciones Anima
-- que crean políticas sobre public.documents.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'document_status'
  ) then
    create type public.document_status as enum ('pending_review', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.documents (
  id uuid default gen_random_uuid() not null,
  scope public.document_scope not null,
  owner_employee_id uuid not null,
  target_employee_id uuid,
  site_id uuid,
  title text not null,
  description text,
  status public.document_status default 'pending_review'::public.document_status not null,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  storage_path text,
  file_name text,
  file_size_bytes integer,
  file_mime text default 'application/pdf'::text,
  expiry_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  document_type_id uuid,
  issue_date date,
  constraint documents_pkey primary key (id),
  constraint documents_scope_target_check check (
    (scope = 'site'::public.document_scope and site_id is not null)
    or (scope <> 'site'::public.document_scope)
  ),
  constraint documents_scope_target_employee_check check (
    (scope = 'employee'::public.document_scope and target_employee_id is not null)
    or (scope <> 'employee'::public.document_scope)
  )
);

