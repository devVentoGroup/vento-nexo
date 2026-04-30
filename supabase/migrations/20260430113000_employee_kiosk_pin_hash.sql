begin;

create extension if not exists pgcrypto;

alter table public.employees
  add column if not exists pin_code_hash text;

create or replace function public.set_employee_kiosk_pin(
  p_employee_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
begin
  if p_employee_id is null then
    raise exception 'Trabajador invalido.';
  end if;

  if v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'El PIN debe tener entre 4 y 8 digitos.';
  end if;

  update public.employees
  set pin_code_hash = crypt(v_pin, gen_salt('bf')),
      pin_code = null
  where id = p_employee_id;

  if not found then
    raise exception 'Trabajador no encontrado.';
  end if;
end;
$$;

create or replace function public.verify_employee_kiosk_pin(
  p_employee_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
  v_hash text;
  v_legacy_pin text;
begin
  if p_employee_id is null or v_pin = '' then
    return false;
  end if;

  select pin_code_hash, pin_code
  into v_hash, v_legacy_pin
  from public.employees
  where id = p_employee_id
    and is_active is true;

  if v_hash is not null and v_hash = crypt(v_pin, v_hash) then
    return true;
  end if;

  if v_hash is null and v_legacy_pin is not null and v_legacy_pin = v_pin then
    update public.employees
    set pin_code_hash = crypt(v_pin, gen_salt('bf')),
        pin_code = null
    where id = p_employee_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.set_employee_kiosk_pin(uuid, text) from public;
revoke all on function public.verify_employee_kiosk_pin(uuid, text) from public;

grant execute on function public.set_employee_kiosk_pin(uuid, text) to authenticated, service_role;
grant execute on function public.verify_employee_kiosk_pin(uuid, text) to authenticated, service_role;

comment on column public.employees.pin_code_hash is
  'Hash del PIN operativo usado para confirmar retiros desde quiosco.';

commit;
