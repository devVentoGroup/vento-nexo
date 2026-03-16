-- ANIMA - staff invitations foundation for pending invites and resend workflow
-- Evolves legacy public.staff_invitations instead of creating a parallel table.

alter table public.staff_invitations
  alter column token drop not null;

alter table public.staff_invitations
  add column if not exists invited_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists role_code text,
  add column if not exists site_id uuid,
  add column if not exists invited_by uuid,
  add column if not exists last_sent_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists resend_count integer not null default 0,
  add column if not exists delivery_channel text not null default 'email',
  add column if not exists auth_user_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists invite_token_hash text,
  add column if not exists source_app text not null default 'anima',
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.staff_invitations
set invited_at = coalesce(invited_at, created_at)
where invited_at is null;

update public.staff_invitations
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.staff_invitations
set role_code = coalesce(role_code, staff_role)
where role_code is null and staff_role is not null;

update public.staff_invitations
set site_id = coalesce(site_id, staff_site_id)
where site_id is null and staff_site_id is not null;

update public.staff_invitations
set invited_by = coalesce(invited_by, created_by)
where invited_by is null and created_by is not null;

update public.staff_invitations
set expired_at = coalesce(expired_at, expires_at)
where expired_at is null and expires_at is not null;

update public.staff_invitations
set last_sent_at = coalesce(last_sent_at, created_at)
where last_sent_at is null
  and status in ('pending', 'sent');

update public.staff_invitations
set status = 'sent'
where status = 'pending';

alter table public.staff_invitations
  alter column invited_at set not null;

comment on table public.staff_invitations is 'ANIMA - Invitaciones laborales con trazabilidad operativa para envio, reenvio, aceptacion y seguimiento.';
comment on column public.staff_invitations.status is 'sent, linked_existing_user, accepted, expired, cancelled, failed. pending se conserva solo como legacy y se migra a sent.';
comment on column public.staff_invitations.role_code is 'Rol normalizado destino de la invitacion. Sustituye gradualmente a staff_role.';
comment on column public.staff_invitations.site_id is 'Sede normalizada destino de la invitacion. Sustituye gradualmente a staff_site_id.';
comment on column public.staff_invitations.invited_by is 'Usuario staff que origino la invitacion. Sustituye gradualmente a created_by.';
comment on column public.staff_invitations.resend_count is 'Cantidad de reenvios realizados para la misma invitacion.';
comment on column public.staff_invitations.invite_token_hash is 'Hash opcional del token o enlace emitido para evitar persistir secretos en texto plano.';
comment on column public.staff_invitations.metadata is 'Payload tecnico y trazabilidad adicional del flujo de invitacion.';

alter table public.staff_invitations
  drop constraint if exists staff_invitations_status_check;

alter table public.staff_invitations
  add constraint staff_invitations_status_check
  check (status = any (array[
    'sent'::text,
    'linked_existing_user'::text,
    'accepted'::text,
    'expired'::text,
    'cancelled'::text,
    'failed'::text
  ]));

alter table public.staff_invitations
  drop constraint if exists staff_invitations_delivery_channel_check;

alter table public.staff_invitations
  add constraint staff_invitations_delivery_channel_check
  check (delivery_channel = any (array[
    'email'::text,
    'manual'::text,
    'system'::text
  ]));

alter table public.staff_invitations
  drop constraint if exists staff_invitations_role_code_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_role_code_fkey
  foreign key (role_code) references public.roles(code);

alter table public.staff_invitations
  drop constraint if exists staff_invitations_site_id_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_site_id_fkey
  foreign key (site_id) references public.sites(id);

alter table public.staff_invitations
  drop constraint if exists staff_invitations_invited_by_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_invited_by_fkey
  foreign key (invited_by) references public.users(id);

alter table public.staff_invitations
  drop constraint if exists staff_invitations_employee_id_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;

create index if not exists idx_staff_invitations_status
  on public.staff_invitations (status);

create index if not exists idx_staff_invitations_email
  on public.staff_invitations (lower(email));

create index if not exists idx_staff_invitations_site_status
  on public.staff_invitations (site_id, status);

create index if not exists idx_staff_invitations_invited_by
  on public.staff_invitations (invited_by);

create index if not exists idx_staff_invitations_auth_user_id
  on public.staff_invitations (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists idx_staff_invitations_invite_token_hash
  on public.staff_invitations (invite_token_hash)
  where invite_token_hash is not null;

drop trigger if exists trg_staff_invitations_updated_at on public.staff_invitations;
create trigger trg_staff_invitations_updated_at
before update on public.staff_invitations
for each row execute function public.update_updated_at();

alter table public.staff_invitations enable row level security;

drop policy if exists staff_invitations_select_management on public.staff_invitations;
create policy staff_invitations_select_management on public.staff_invitations
for select to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['propietario'::text, 'gerente_general'::text, 'gerente'::text])
      and (
        e.role = any (array['propietario'::text, 'gerente_general'::text])
        or e.site_id = public.staff_invitations.site_id
        or e.site_id = public.staff_invitations.staff_site_id
      )
  )
);
