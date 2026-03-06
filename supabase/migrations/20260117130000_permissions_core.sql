-- Core permissions model for Vento OS (roles, apps, permissions, scopes).

-- Permission scopes
do $$
begin
  if not exists (select 1 from pg_type where typname = 'permission_scope_type') then
    create type public.permission_scope_type as enum (
      'global',
      'site',
      'site_type',
      'area',
      'area_kind'
    );
  end if;
end$$;

-- Area kinds catalog
create table if not exists public.area_kinds (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.area_kinds is 'Catalogo canonico de tipos de area para produccion y remisiones.';

insert into public.area_kinds (code, name, description) values
  ('contabilidad', 'Contabilidad', 'Contabilidad y finanzas'),
  ('panaderia', 'Panaderia', 'Panaderia'),
  ('bar', 'Bar', 'Bar y bebidas'),
  ('cocina_bar', 'Cocina Bar', 'Cocina de bar'),
  ('caja', 'Caja', 'Caja'),
  ('mostrador', 'Mostrador', 'Mostrador'),
  ('general', 'General', 'Area generica'),
  ('cocina', 'Cocina', 'Cocina'),
  ('cocina_caliente', 'Cocina Caliente', 'Cocina caliente'),
  ('liderazgo', 'Liderazgo', 'Liderazgo'),
  ('logistica', 'Logistica', 'Logistica'),
  ('gerencia', 'Gerencia', 'Gerencia'),
  ('marketing', 'Marketing', 'Marketing'),
  ('reposteria', 'Reposteria', 'Reposteria/Pasteleria'),
  ('salon', 'Salon', 'Salon y servicio'),
  ('bodega', 'Bodega', 'Bodega y almacenamiento')
on conflict (code) do nothing;

-- Normalize areas.kind
update public.areas
set kind = case
  when kind is null or btrim(kind) = '' then 'general'
  when replace(public._vento_slugify(kind), '-', '_') in (
    'contabilidad','panaderia','bar','cocina_bar','caja','mostrador','general','cocina','cocina_caliente',
    'liderazgo','logistica','gerencia','marketing','reposteria','salon','bodega'
  ) then replace(public._vento_slugify(kind), '-', '_')
  when replace(public._vento_slugify(kind), '-', '_') in ('accounting','contador') then 'contabilidad'
  when replace(public._vento_slugify(kind), '-', '_') in ('bakery','baker','panaderia') then 'panaderia'
  when replace(public._vento_slugify(kind), '-', '_') in ('bar_kitchen','kitchen_bar','cocina_bar') then 'cocina_bar'
  when replace(public._vento_slugify(kind), '-', '_') in ('kitchen_hot','hot_kitchen','cocina_caliente') then 'cocina_caliente'
  when replace(public._vento_slugify(kind), '-', '_') in ('kitchen','cocina') then 'cocina'
  when replace(public._vento_slugify(kind), '-', '_') in ('pastry','pasteleria','reposteria') then 'reposteria'
  when replace(public._vento_slugify(kind), '-', '_') in ('warehouse','storage','almacen','bodega') then 'bodega'
  when replace(public._vento_slugify(kind), '-', '_') in ('cashier','caja') then 'caja'
  when replace(public._vento_slugify(kind), '-', '_') in ('counter','mostrador') then 'mostrador'
  when replace(public._vento_slugify(kind), '-', '_') in ('bar','barra') then 'bar'
  when replace(public._vento_slugify(kind), '-', '_') in ('marketing','mercadeo') then 'marketing'
  when replace(public._vento_slugify(kind), '-', '_') in ('logistics','logistica') then 'logistica'
  when replace(public._vento_slugify(kind), '-', '_') in ('management','gerencia','gestion') then 'gerencia'
  when replace(public._vento_slugify(kind), '-', '_') in ('leadership','liderazgo') then 'liderazgo'
  when replace(public._vento_slugify(kind), '-', '_') in ('salon','dining','floor') then 'salon'
  else 'general'
end;

alter table public.areas
  drop constraint if exists areas_kind_fkey;

alter table public.areas
  add constraint areas_kind_fkey
  foreign key (kind) references public.area_kinds(code);

-- Production area kind on products and requests
alter table public.products
  add column if not exists production_area_kind text;

alter table public.products
  alter column production_area_kind set default 'general';

update public.products
set production_area_kind = coalesce(production_area_kind, 'general');

alter table public.products
  drop constraint if exists products_production_area_kind_fkey;

alter table public.products
  add constraint products_production_area_kind_fkey
  foreign key (production_area_kind) references public.area_kinds(code);

alter table public.production_request_items
  add column if not exists production_area_kind text;

alter table public.production_request_items
  alter column production_area_kind set default 'general';

update public.production_request_items pri
set production_area_kind = coalesce(pri.production_area_kind, p.production_area_kind, 'general')
from public.products p
where pri.product_id = p.id;

update public.production_request_items
set production_area_kind = 'general'
where production_area_kind is null;

alter table public.production_request_items
  drop constraint if exists production_request_items_area_kind_fkey;

alter table public.production_request_items
  add constraint production_request_items_area_kind_fkey
  foreign key (production_area_kind) references public.area_kinds(code);

alter table public.restock_request_items
  add column if not exists production_area_kind text;

alter table public.restock_request_items
  alter column production_area_kind set default 'general';

update public.restock_request_items rri
set production_area_kind = coalesce(rri.production_area_kind, p.production_area_kind, 'general')
from public.products p
where rri.product_id = p.id;

update public.restock_request_items
set production_area_kind = 'general'
where production_area_kind is null;

alter table public.restock_request_items
  drop constraint if exists restock_request_items_area_kind_fkey;

alter table public.restock_request_items
  add constraint restock_request_items_area_kind_fkey
  foreign key (production_area_kind) references public.area_kinds(code);

-- Roles catalog
create table if not exists public.roles (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.roles is 'Catalogo canonico de roles de staff.';

insert into public.roles (code, name, description) values
  ('propietario', 'Propietario', 'Dueno y gerente general'),
  ('gerente_general', 'Gerente General', 'Gerencia global multi-sede'),
  ('gerente', 'Gerente', 'Gerente de sede'),
  ('bodeguero', 'Bodeguero', 'Bodega e inventario'),
  ('conductor', 'Conductor', 'Transporte y remisiones'),
  ('cajero', 'Cajero', 'Caja y cobros'),
  ('mesero', 'Mesero', 'Servicio en sala'),
  ('barista', 'Barista', 'Barista'),
  ('cocinero', 'Cocinero', 'Cocina'),
  ('panadero', 'Panadero', 'Panaderia'),
  ('repostero', 'Repostero', 'Reposteria'),
  ('pastelero', 'Pastelero', 'Pasteleria'),
  ('contador', 'Contador', 'Finanzas y contabilidad'),
  ('marketing', 'Marketing', 'Marketing y growth')
on conflict (code) do nothing;

-- Temporarily remove legacy role enforcement trigger to allow normalization
drop trigger if exists trg_enforce_employee_role_site on public.employees;

-- Remove legacy role check before normalization
alter table public.employees
  drop constraint if exists employees_role_check;

-- Normalize legacy roles (employees)
with normalized as (
  select id, replace(public._vento_slugify(role), '-', '_') as slug
  from public.employees
)
update public.employees e
set role = case
  when n.slug in ('propietario', 'owner') then 'propietario'
  when n.slug in ('gerente_general', 'global_manager') then 'gerente_general'
  when n.slug in ('gerente', 'manager', 'admin', 'area_manager') then 'gerente'
  when n.slug in ('bodeguero', 'logistics', 'warehouse', 'bodega', 'almacen') then 'bodeguero'
  when n.slug in ('conductor', 'driver') then 'conductor'
  when n.slug in ('cajero', 'cashier') then 'cajero'
  when n.slug in ('mesero', 'mesera', 'waiter', 'staff', 'personal') then 'mesero'
  when n.slug in ('barista') then 'barista'
  when n.slug in ('cocinero', 'cocinera', 'cook', 'chef') then 'cocinero'
  when n.slug in ('panadero', 'panadera', 'baker') then 'panadero'
  when n.slug in ('repostero', 'repostera', 'pastry') then 'repostero'
  when n.slug in ('pastelero', 'pastelera') then 'pastelero'
  when n.slug in ('contador', 'accountant') then 'contador'
  when n.slug in ('marketing', 'mercadeo') then 'marketing'
  else e.role
end
from normalized n
where e.id = n.id;

-- Normalize legacy roles (staff_invitations)
with normalized as (
  select id, replace(public._vento_slugify(staff_role), '-', '_') as slug
  from public.staff_invitations
  where staff_role is not null
)
update public.staff_invitations s
set staff_role = case
  when n.slug in ('propietario', 'owner') then 'propietario'
  when n.slug in ('gerente_general', 'global_manager') then 'gerente_general'
  when n.slug in ('gerente', 'manager', 'admin', 'area_manager') then 'gerente'
  when n.slug in ('bodeguero', 'logistics', 'warehouse', 'bodega', 'almacen') then 'bodeguero'
  when n.slug in ('conductor', 'driver') then 'conductor'
  when n.slug in ('cajero', 'cashier') then 'cajero'
  when n.slug in ('mesero', 'mesera', 'waiter', 'staff', 'personal') then 'mesero'
  when n.slug in ('barista') then 'barista'
  when n.slug in ('cocinero', 'cocinera', 'cook', 'chef') then 'cocinero'
  when n.slug in ('panadero', 'panadera', 'baker') then 'panadero'
  when n.slug in ('repostero', 'repostera', 'pastry') then 'repostero'
  when n.slug in ('pastelero', 'pastelera') then 'pastelero'
  when n.slug in ('contador', 'accountant') then 'contador'
  when n.slug in ('marketing', 'mercadeo') then 'marketing'
  else s.staff_role
end
from normalized n
where s.id = n.id;

do $$
declare
  v_invalid text;
begin
  select string_agg(distinct role, ', ') into v_invalid
  from public.employees
  where role is not null
    and role not in (select code from public.roles);

  if v_invalid is not null then
    raise exception 'Roles invalidos en employees: %', v_invalid;
  end if;
end$$;

do $$
declare
  v_invalid text;
begin
  select string_agg(distinct staff_role, ', ') into v_invalid
  from public.staff_invitations
  where staff_role is not null
    and staff_role not in (select code from public.roles);

  if v_invalid is not null then
    raise exception 'Roles invalidos en staff_invitations: %', v_invalid;
  end if;
end$$;

-- Enforce roles via FK instead of CHECK constraint
alter table public.employees
  drop constraint if exists employees_role_fkey;

alter table public.employees
  add constraint employees_role_fkey
  foreign key (role) references public.roles(code);

alter table public.staff_invitations
  drop constraint if exists staff_invitations_role_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_role_fkey
  foreign key (staff_role) references public.roles(code);

-- Temporarily remove legacy role enforcement trigger to allow normalization
drop trigger if exists trg_enforce_employee_role_site on public.employees;

-- Update role helper functions to new codes
create or replace function public.is_owner() returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.current_employee_role() = 'propietario';
$$;

create or replace function public.is_global_manager() returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.current_employee_role() = 'gerente_general';
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.current_employee_role() = 'gerente';
$$;

create or replace function public.is_manager_or_owner() returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.current_employee_role() in ('propietario', 'gerente', 'gerente_general');
$$;

create or replace function public.can_access_recipe_scope(p_site_id uuid, p_area_id uuid) returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    public.is_owner()
    or public.is_global_manager()
    or (
      public.current_employee_role() = any (array['gerente'::text, 'bodeguero'::text])
      and p_site_id is not null
      and public.can_access_site(p_site_id)
    )
    or (
      public.is_employee()
      and p_site_id is not null
      and p_area_id is not null
      and public.can_access_site(p_site_id)
      and public.can_access_area(p_area_id)
    );
$$;

-- Allowed roles by site_type (replaces hardcoded lists)
create table if not exists public.role_site_type_rules (
  role text not null references public.roles(code) on delete cascade,
  site_type public.site_type not null,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (role, site_type)
);

insert into public.role_site_type_rules (role, site_type) values
  ('propietario', 'admin'),
  ('gerente_general', 'admin'),
  ('gerente', 'admin'),
  ('contador', 'admin'),
  ('marketing', 'admin'),
  ('propietario', 'production_center'),
  ('gerente_general', 'production_center'),
  ('gerente', 'production_center'),
  ('bodeguero', 'production_center'),
  ('conductor', 'production_center'),
  ('cocinero', 'production_center'),
  ('panadero', 'production_center'),
  ('repostero', 'production_center'),
  ('pastelero', 'production_center'),
  ('propietario', 'satellite'),
  ('gerente_general', 'satellite'),
  ('gerente', 'satellite'),
  ('bodeguero', 'satellite'),
  ('conductor', 'satellite'),
  ('cajero', 'satellite'),
  ('mesero', 'satellite'),
  ('barista', 'satellite'),
  ('cocinero', 'satellite')
on conflict (role, site_type) do nothing;

create or replace function public.enforce_employee_role_site()
returns trigger
language plpgsql
as $$
declare
  st public.site_type;
begin
  select s.site_type into st
  from public.sites s
  where s.id = new.site_id;

  if st is null then
    raise exception 'site_id invalido o sede sin site_type';
  end if;

  if not exists (
    select 1
    from public.role_site_type_rules r
    where r.role = new.role
      and r.site_type = st
      and r.is_allowed = true
  ) then
    raise exception 'Rol "%" no permitido para site_type="%"', new.role, st;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_employee_role_site
  before insert or update of role, site_id on public.employees
  for each row execute function public.enforce_employee_role_site();

-- Apps catalog
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apps is 'Catalogo de aplicaciones Vento OS.';

insert into public.apps (code, name, description) values
  ('shell', 'Vento OS', 'Hub y SSO'),
  ('nexo', 'NEXO', 'Inventario y logistica'),
  ('pass', 'Vento Pass', 'Fidelizacion'),
  ('anima', 'ANIMA', 'Asistencia'),
  ('fogo', 'FOGO', 'Produccion'),
  ('pulso', 'PULSO', 'POS'),
  ('viso', 'VISO', 'Gerencia'),
  ('origo', 'ORIGO', 'Compras'),
  ('aura', 'AURA', 'Marketing')
on conflict (code) do nothing;

-- Permissions catalog
create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, code)
);

comment on table public.app_permissions is 'Catalogo de permisos por app (vistas/acciones).';

-- Base access permission per app
insert into public.app_permissions (app_id, code, name, description)
select id, 'access', 'Access', 'Acceso base a la app'
from public.apps
on conflict (app_id, code) do nothing;

-- NEXO inventory permissions
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.stock', 'Stock', 'Vista de stock por sede'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.movements', 'Movimientos', 'Ledger de movimientos'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.locations', 'LOCs', 'Ubicaciones de inventario'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.lpns', 'LPNs', 'Contenedores LPN y contenido'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.counts', 'Conteos', 'Conteos y ajustes derivados'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.adjustments', 'Ajustes', 'Ajustes manuales controlados'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions', 'Remisiones', 'Solicitudes y remisiones internas'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- FOGO production permissions
insert into public.app_permissions (app_id, code, name, description)
select id, 'production.recipes', 'Recetas', 'Consulta de recetas'
from public.apps where code = 'fogo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'production.orders', 'Ordenes', 'Ordenes de produccion'
from public.apps where code = 'fogo'
on conflict (app_id, code) do nothing;

-- PULSO POS permission
insert into public.app_permissions (app_id, code, name, description)
select id, 'pos.main', 'POS', 'Operacion de punto de venta'
from public.apps where code = 'pulso'
on conflict (app_id, code) do nothing;

-- Role permissions
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null references public.roles(code) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  scope_type public.permission_scope_type not null default 'site',
  scope_site_type public.site_type,
  scope_area_kind text references public.area_kinds(code),
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role, permission_id, scope_type, scope_site_type, scope_area_kind)
);

comment on table public.role_permissions is 'Permisos base por rol.';

-- Employee-specific permissions (overrides)
create table if not exists public.employee_permissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  is_allowed boolean not null default true,
  scope_type public.permission_scope_type not null default 'site',
  scope_site_id uuid references public.sites(id),
  scope_area_id uuid references public.areas(id),
  scope_site_type public.site_type,
  scope_area_kind text references public.area_kinds(code),
  created_at timestamptz not null default now(),
  unique (employee_id, permission_id, scope_type, scope_site_id, scope_area_id, scope_site_type, scope_area_kind)
);

comment on table public.employee_permissions is 'Overrides de permisos por empleado.';

-- Seed role permissions (baseline)
-- propietario/gerente_general: all permissions, global scope
insert into public.role_permissions (role, permission_id, scope_type)
select r.code, ap.id, 'global'::public.permission_scope_type
from public.roles r
join public.app_permissions ap on true
where r.code in ('propietario', 'gerente_general')
on conflict do nothing;

-- gerente: all permissions for their sites
insert into public.role_permissions (role, permission_id, scope_type)
select 'gerente', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
on conflict do nothing;

-- bodeguero: full NEXO inventory in their sites
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.stock',
    'inventory.movements',
    'inventory.locations',
    'inventory.lpns',
    'inventory.counts',
    'inventory.adjustments',
    'inventory.remissions'
  )
on conflict do nothing;

-- conductor: remisiones en NEXO
insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in ('access', 'inventory.remissions')
on conflict do nothing;

-- cajero/mesero: POS only (satellite)
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (select 'cajero'::text as role union all select 'mesero') r on true
where a.code = 'pulso' and ap.code in ('access', 'pos.main')
on conflict do nothing;

-- barista (satellite): recipes + POS
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'barista', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'fogo' and ap.code in ('access', 'production.recipes')
on conflict do nothing;

insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'barista', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'pulso' and ap.code in ('access', 'pos.main')
on conflict do nothing;

-- cocinero (satellite): recipes + POS + remisiones
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'fogo' and ap.code in ('access', 'production.recipes')
on conflict do nothing;

insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'pulso' and ap.code in ('access', 'pos.main')
on conflict do nothing;

insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo' and ap.code in ('access', 'inventory.remissions')
on conflict do nothing;

-- cocinero/production_center: recipes + orders
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'production_center'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'fogo' and ap.code in ('access', 'production.recipes', 'production.orders')
on conflict do nothing;

-- production center roles: recipes + orders
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'production_center'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  select 'panadero'::text as role
  union all select 'repostero'
  union all select 'pastelero'
) r on true
where a.code = 'fogo' and ap.code in ('access', 'production.recipes', 'production.orders')
on conflict do nothing;

-- contador (admin): viso access
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'contador', ap.id, 'site_type'::public.permission_scope_type, 'admin'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'viso' and ap.code = 'access'
on conflict do nothing;

-- marketing (admin): aura access
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'marketing', ap.id, 'site_type'::public.permission_scope_type, 'admin'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'aura' and ap.code = 'access'
on conflict do nothing;

-- Permission scope evaluation helper
create or replace function public.permission_scope_matches(
  p_scope_type public.permission_scope_type,
  p_context_site_id uuid,
  p_context_area_id uuid,
  p_scope_site_id uuid,
  p_scope_area_id uuid,
  p_scope_site_type public.site_type,
  p_scope_area_kind text
)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_site_type public.site_type;
  v_area_kind text;
begin
  if p_scope_type = 'global' then
    return true;
  end if;

  if p_scope_type = 'site' then
    if p_context_site_id is null then
      return false;
    end if;
    if p_scope_site_id is not null and p_scope_site_id <> p_context_site_id then
      return false;
    end if;
    return public.can_access_site(p_context_site_id);
  end if;

  if p_scope_type = 'site_type' then
    if p_context_site_id is null then
      return false;
    end if;
    if not public.can_access_site(p_context_site_id) then
      return false;
    end if;
    select site_type into v_site_type from public.sites where id = p_context_site_id;
    return v_site_type = p_scope_site_type;
  end if;

  if p_scope_type = 'area' then
    if p_context_area_id is null then
      return false;
    end if;
    if p_scope_area_id is not null and p_scope_area_id <> p_context_area_id then
      return false;
    end if;
    return public.can_access_area(p_context_area_id);
  end if;

  if p_scope_type = 'area_kind' then
    if p_context_area_id is null then
      return false;
    end if;
    if not public.can_access_area(p_context_area_id) then
      return false;
    end if;
    select kind into v_area_kind from public.areas where id = p_context_area_id;
    return v_area_kind = p_scope_area_kind;
  end if;

  return false;
end;
$$;

-- Permission check for current user
create or replace function public.has_permission(
  p_permission_code text,
  p_site_id uuid default null,
  p_area_id uuid default null
)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_employee_id uuid;
  v_role text;
  v_permission_id uuid;
  v_site_id uuid;
  v_area_id uuid;
  v_denied boolean;
  v_allowed boolean;
begin
  v_employee_id := auth.uid();
  if v_employee_id is null then
    return false;
  end if;

  select e.role into v_role
  from public.employees e
  where e.id = v_employee_id
    and e.is_active = true;

  if v_role is null then
    return false;
  end if;

  select ap.id into v_permission_id
  from public.app_permissions ap
  join public.apps a on a.id = ap.app_id
  where (a.code || '.' || ap.code) = p_permission_code
    and a.is_active = true
    and ap.is_active = true;

  if v_permission_id is null then
    return false;
  end if;

  v_site_id := coalesce(p_site_id, public.current_employee_site_id());
  v_area_id := p_area_id;

  select exists (
    select 1
    from public.employee_permissions ep
    where ep.employee_id = v_employee_id
      and ep.permission_id = v_permission_id
      and ep.is_allowed = false
      and public.permission_scope_matches(
        ep.scope_type,
        v_site_id,
        v_area_id,
        ep.scope_site_id,
        ep.scope_area_id,
        ep.scope_site_type,
        ep.scope_area_kind
      )
  ) into v_denied;

  if v_denied then
    return false;
  end if;

  select exists (
    select 1
    from public.employee_permissions ep
    where ep.employee_id = v_employee_id
      and ep.permission_id = v_permission_id
      and ep.is_allowed = true
      and public.permission_scope_matches(
        ep.scope_type,
        v_site_id,
        v_area_id,
        ep.scope_site_id,
        ep.scope_area_id,
        ep.scope_site_type,
        ep.scope_area_kind
      )
  ) into v_allowed;

  if v_allowed then
    return true;
  end if;

  select exists (
    select 1
    from public.role_permissions rp
    where rp.role = v_role
      and rp.permission_id = v_permission_id
      and rp.is_allowed = true
      and public.permission_scope_matches(
        rp.scope_type,
        v_site_id,
        v_area_id,
        null,
        null,
        rp.scope_site_type,
        rp.scope_area_kind
      )
  ) into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

-- Update role-based policies to new codes
drop policy if exists "Owners and managers can manage locations" on public.inventory_locations;
create policy "Owners and managers can manage locations" on public.inventory_locations
  using ((exists (
    select 1
    from public.employees e
    join public.employee_sites es on e.id = es.employee_id
    where e.id = auth.uid()
      and es.site_id = inventory_locations.site_id
      and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text])
  )));

drop policy if exists "Owners can update feedback" on public.user_feedback;
create policy "Owners can update feedback" on public.user_feedback for update to authenticated
  using (exists (
    select 1
    from public.employees
    where employees.id = auth.uid()
      and employees.role = 'propietario'::text
  ));

drop policy if exists "areas_select_staff" on public.areas;
create policy "areas_select_staff" on public.areas for select
  using (
    public.can_access_area(id)
    or (
      public.current_employee_role() = any (array['gerente'::text, 'bodeguero'::text])
      and public.can_access_site(site_id)
    )
  );

drop policy if exists "attendance_logs_select_manager" on public.attendance_logs;
create policy "attendance_logs_select_manager" on public.attendance_logs for select to authenticated
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text])
      and (
        e.role = any (array['propietario'::text, 'gerente_general'::text])
        or e.site_id = attendance_logs.site_id
      )
  ));

drop policy if exists "employee_shifts_select_manager" on public.employee_shifts;
create policy "employee_shifts_select_manager" on public.employee_shifts for select
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['gerente'::text])
      and e.site_id = employee_shifts.site_id
  ));

drop policy if exists "employee_shifts_write_manager" on public.employee_shifts;
create policy "employee_shifts_write_manager" on public.employee_shifts
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['gerente'::text])
      and e.site_id = employee_shifts.site_id
  ))
  with check (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['gerente'::text])
      and e.site_id = employee_shifts.site_id
  ));

drop policy if exists "employees_select_manager" on public.employees;
create policy "employees_select_manager" on public.employees for select
  using (
    (public.is_manager_or_owner() or (public.current_employee_role() = any (array['bodeguero'::text])))
    and public.can_access_site(site_id)
  );

drop policy if exists "inventory_movements_insert_roles" on public.inventory_movements;
create policy "inventory_movements_insert_roles" on public.inventory_movements for insert
  with check (
    public.current_employee_role() = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'bodeguero'::text])
    and public.can_access_site(site_id)
  );

drop policy if exists "loyalty_redemptions_select_cashier" on public.loyalty_redemptions;
create policy "loyalty_redemptions_select_cashier" on public.loyalty_redemptions for select to authenticated
  using (exists (
    select 1
    from public.employees e
    join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text])
      and (
        e.site_id = r.site_id
        or exists (
          select 1
          from public.employee_sites es
          where es.employee_id = e.id
            and es.is_active = true
            and es.site_id = r.site_id
        )
      )
  ));

drop policy if exists "loyalty_redemptions_validate_cashier" on public.loyalty_redemptions;
create policy "loyalty_redemptions_validate_cashier" on public.loyalty_redemptions for update to authenticated
  using (
    status = 'pending'::text
    and exists (
      select 1
      from public.employees e
      join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
      where e.id = auth.uid()
        and e.is_active = true
        and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text])
        and (
          e.site_id = r.site_id
          or exists (
            select 1
            from public.employee_sites es
            where es.employee_id = e.id
              and es.is_active = true
              and es.site_id = r.site_id
          )
        )
    )
  )
  with check (
    status = 'validated'::text
    and exists (
      select 1
      from public.employees e
      join public.loyalty_rewards r on r.id = loyalty_redemptions.reward_id
      where e.id = auth.uid()
        and e.is_active = true
        and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text])
        and (
          e.site_id = r.site_id
          or exists (
            select 1
            from public.employee_sites es
            where es.employee_id = e.id
              and es.is_active = true
              and es.site_id = r.site_id
          )
        )
    )
  );

drop policy if exists "production_batches_write_production" on public.production_batches;
create policy "production_batches_write_production" on public.production_batches
  using (
    public.current_employee_role() = any (
      array[
        'propietario'::text,
        'gerente'::text,
        'gerente_general'::text,
        'barista'::text,
        'cocinero'::text,
        'panadero'::text,
        'repostero'::text,
        'pastelero'::text
      ]
    )
    and (
      public.current_employee_role() = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text])
      or site_id = public.current_employee_site_id()
    )
  )
  with check (
    public.current_employee_role() = any (
      array[
        'propietario'::text,
        'gerente'::text,
        'gerente_general'::text,
        'barista'::text,
        'cocinero'::text,
        'panadero'::text,
        'repostero'::text,
        'pastelero'::text
      ]
    )
    and (
      public.current_employee_role() = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text])
      or site_id = public.current_employee_site_id()
    )
  );

drop policy if exists "users_select_cashier" on public.users;
create policy "users_select_cashier" on public.users for select to authenticated
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text])
  ));

drop policy if exists "users_select_cashier_for_qr" on public.users;
create policy "users_select_cashier_for_qr" on public.users for select to authenticated
  using (exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.is_active = true
      and e.role = any (array['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text])
  ));

-- RLS for new tables
alter table public.area_kinds enable row level security;
alter table public.roles enable row level security;
alter table public.role_site_type_rules enable row level security;
alter table public.apps enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employee_permissions enable row level security;

create policy "area_kinds_select_all" on public.area_kinds
  for select to authenticated
  using (true);

create policy "area_kinds_manage_owner" on public.area_kinds
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "roles_select_all" on public.roles
  for select to authenticated
  using (true);

create policy "roles_manage_owner" on public.roles
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "role_site_type_rules_select_all" on public.role_site_type_rules
  for select to authenticated
  using (true);

create policy "role_site_type_rules_manage_owner" on public.role_site_type_rules
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "apps_select_all" on public.apps
  for select to authenticated
  using (true);

create policy "apps_manage_owner" on public.apps
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "app_permissions_select_all" on public.app_permissions
  for select to authenticated
  using (true);

create policy "app_permissions_manage_owner" on public.app_permissions
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "role_permissions_select_all" on public.role_permissions
  for select to authenticated
  using (true);

create policy "role_permissions_manage_owner" on public.role_permissions
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

create policy "employee_permissions_select_self" on public.employee_permissions
  for select to authenticated
  using (employee_id = auth.uid());

create policy "employee_permissions_select_owner" on public.employee_permissions
  for select to authenticated
  using (public.is_owner() or public.is_global_manager());

create policy "employee_permissions_manage_owner" on public.employee_permissions
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

grant execute on function public.permission_scope_matches(
  public.permission_scope_type,
  uuid,
  uuid,
  uuid,
  uuid,
  public.site_type,
  text
) to authenticated;

grant execute on function public.has_permission(text, uuid, uuid) to authenticated;
