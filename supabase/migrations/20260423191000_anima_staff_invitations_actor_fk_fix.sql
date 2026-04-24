-- staff_invitations is an operational staff domain table.
-- Audit actor columns must point to employees, not public.users (client domain).

update public.staff_invitations si
set created_by = null
where created_by is not null
  and not exists (
    select 1
    from public.employees e
    where e.id = si.created_by
  );

update public.staff_invitations si
set invited_by = null
where invited_by is not null
  and not exists (
    select 1
    from public.employees e
    where e.id = si.invited_by
  );

alter table public.staff_invitations
  drop constraint if exists staff_invitations_created_by_fkey;

alter table public.staff_invitations
  drop constraint if exists staff_invitations_invited_by_fkey;

alter table public.staff_invitations
  add constraint staff_invitations_created_by_fkey
  foreign key (created_by) references public.employees(id) on delete set null;

alter table public.staff_invitations
  add constraint staff_invitations_invited_by_fkey
  foreign key (invited_by) references public.employees(id) on delete set null;

comment on column public.staff_invitations.created_by is
  'Legacy actor column. Conserva el staff que originó la invitación y referencia public.employees(id).';

comment on column public.staff_invitations.invited_by is
  'Actor staff normalizado que originó la invitación. Referencia public.employees(id).';
