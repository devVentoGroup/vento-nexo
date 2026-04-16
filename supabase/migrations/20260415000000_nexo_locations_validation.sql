-- NEXO Locations Validation: Auditoría física de LOCs (Fase 1)
-- Agregar permiso de validacion de LOCs en NEXO
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.validation', 'Validacion de LOCs', 'Auditoria y validacion de ubicaciones fisicas'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Crear tabla para registrar validaciones
create table if not exists public.locations_validation (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  
  -- Estado de validacion
  status text not null default 'pending',
  check (status in ('pending', 'validated', 'failed', 'requires_action')),
  
  -- Datos auditados
  code_verified boolean not null default false,
  code_location_description text,
  
  capacity_verified boolean not null default false,
  capacity_units_actual integer,
  capacity_weight_kg_actual decimal(10,2),
  
  dimensions_verified boolean not null default false,
  dimension_length_cm integer,
  dimension_width_cm integer,
  dimension_height_cm integer,
  
  environment_verified boolean not null default false,
  environment_type_verified text,
  temperature_celsius decimal(5,2),
  humidity_percent decimal(5,2),
  
  accessibility_level text,
  check (accessibility_level in ('easy', 'restricted', 'hazard')),
  
  equipment_available text[],
  shelving_type text,
  surface_condition text,
  
  -- Problemas encontrados
  issues jsonb,
  required_actions text,
  
  -- Auditor info
  auditor_id uuid not null references public.employees(id),
  auditor_notes text,
  
  -- Fotos/evidencia
  photo_urls text[],
  
  -- Timestamps
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.locations_validation is 'Auditoría física de ubicaciones (LOCs) de inventario. Almacena resultados de validaciones in-situ.';
comment on column public.locations_validation.status is 'Estado de validación: pending (en auditoría), validated (OK), failed (no pasa), requires_action (necesita arreglo)';

-- Indices para busquedas rapidas
create index if not exists idx_locations_validation_site_id on public.locations_validation(site_id);
create index if not exists idx_locations_validation_status on public.locations_validation(status);
create index if not exists idx_locations_validation_location_id on public.locations_validation(location_id);
create index if not exists idx_locations_validation_validated_at on public.locations_validation(validated_at);

-- RLS para locations_validation
alter table public.locations_validation enable row level security;

-- Propietarios y gerentes_generales: ver todas las validaciones
create policy "owners_managers_all_validation"
  on public.locations_validation
  for all
  using (
    public.is_owner()
    or public.is_global_manager()
  );

-- Gerentes: ver validaciones de sus sitios
create policy "managers_site_validation"
  on public.locations_validation
  for all
  using (
    public.is_manager()
    and site_id in (
      select site_id from public.employee_sites 
      where employee_id = public.current_user_id()
    )
  );

-- Auditores: ver/modificar sus propias validaciones
create policy "auditors_own_validation"
  on public.locations_validation
  for all
  using (auditor_id = public.current_user_id());

-- Asignar permiso inventory.validation a propietario
insert into public.role_permissions (role, permission_id, scope_type)
select 'propietario', ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;

-- Asignar permiso inventory.validation a gerente_general
insert into public.role_permissions (role, permission_id, scope_type)
select 'gerente_general', ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;

-- Asignar permiso inventory.validation a gerente (site scope)
insert into public.role_permissions (role, permission_id, scope_type)
select 'gerente', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;

-- Asignar permiso inventory.validation a bodeguero (site scope)
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;
