-- ANIMA - Tabla para tokens de push (Expo) por empleado.
-- Usada por register-push-token (ANIMA) y por notifyShiftChange (VISO) para enviar
-- notificaciones al publicar horarios u otros eventos de turnos.

create table if not exists public.employee_push_tokens (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null,
  platform text,
  is_active boolean not null default true,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_push_tokens_token_unique unique (token)
);

create index if not exists idx_employee_push_tokens_employee_active
  on public.employee_push_tokens (employee_id, is_active)
  where is_active = true;

comment on table public.employee_push_tokens is
  'ANIMA - Tokens Expo Push por empleado para notificaciones (ej. horario publicado).';

comment on column public.employee_push_tokens.token is
  'Expo push token (ExponentPushToken[...]).';

comment on column public.employee_push_tokens.is_active is
  'False si el token fue rechazado (DeviceNotRegistered) al enviar.';

alter table public.employee_push_tokens enable row level security;

-- Solo el propio empleado puede insertar/actualizar su token (via Edge Function con service role).
-- Lectura para enviar notificaciones se hace con service role desde VISO/Edge Functions.
create policy employee_push_tokens_own_upsert on public.employee_push_tokens
  for all
  to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

drop trigger if exists trg_employee_push_tokens_updated_at on public.employee_push_tokens;
create trigger trg_employee_push_tokens_updated_at
  before update on public.employee_push_tokens
  for each row execute function public.update_updated_at();
