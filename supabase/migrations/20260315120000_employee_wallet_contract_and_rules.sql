-- Carnet laboral: identidad estable de contrato en document_types y matriz required_document_rules.
-- Aplicar desde shell; luego sincronizar a anima/viso según convención.

-- 1. Identidad estable del tipo "Contrato" en document_types
alter table public.document_types
  add column if not exists system_key text;

create unique index if not exists document_types_system_key_key
  on public.document_types (system_key)
  where system_key is not null;

comment on column public.document_types.system_key is 'Clave estable para tipos especiales, ej. employment_contract para contrato laboral.';

-- Marcar el tipo "Contrato laboral" existente (por nombre) como contrato
update public.document_types
set system_key = 'employment_contract'
where name = 'Contrato laboral'
  and system_key is null;

-- 2. Matriz de documentos requeridos por trabajador (sede/rol/global)
create table if not exists public.required_document_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites (id) on delete cascade,
  role text,
  document_type_id uuid not null references public.document_types (id) on delete cascade,
  is_required boolean not null default true,
  active boolean not null default true,
  display_order integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.required_document_rules is 'Reglas de documentos requeridos para elegibilidad carnet laboral; site_id/role null = global.';

create index if not exists required_document_rules_site_role_active
  on public.required_document_rules (site_id, role, active)
  where active = true;

create index if not exists required_document_rules_document_type_id
  on public.required_document_rules (document_type_id);

alter table public.required_document_rules enable row level security;

-- Políticas: lectura para autenticados; escritura para owner/gerente_general/gerente (alineado con document_types)
create policy required_document_rules_select
  on public.required_document_rules
  for select
  to authenticated
  using (true);

create policy required_document_rules_insert
  on public.required_document_rules
  for insert
  to authenticated
  with check (
    public.is_owner()
    or public.is_global_manager()
    or (public.current_employee_role() = 'gerente')
  );

create policy required_document_rules_update
  on public.required_document_rules
  for update
  to authenticated
  using (
    public.is_owner()
    or public.is_global_manager()
    or (public.current_employee_role() = 'gerente')
  )
  with check (
    public.is_owner()
    or public.is_global_manager()
    or (public.current_employee_role() = 'gerente')
  );

create policy required_document_rules_delete
  on public.required_document_rules
  for delete
  to authenticated
  using (
    public.is_owner()
    or public.is_global_manager()
    or (public.current_employee_role() = 'gerente')
  );
