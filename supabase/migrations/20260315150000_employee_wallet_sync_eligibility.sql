-- Sincronización de elegibilidad: revocar carnets emitidos cuando ya no cumplan condiciones.
-- Para invocar desde un job periódico (Edge Function + cron).

create or replace function public.employee_wallet_sync_eligibility()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_elig record;
  v_revoked_count int := 0;
  v_checked_count int := 0;
  v_reason text;
  v_revoked_ids uuid[] := '{}';
begin
  for v_row in
    select c.id, c.employee_id
    from public.employee_wallet_cards c
    where c.status = 'issued'
  loop
    v_checked_count := v_checked_count + 1;

    select *
    into v_elig
    from public.employee_wallet_eligibility(v_row.employee_id)
    limit 1;

    if v_elig.wallet_eligible then
      -- Sigue elegible; opcionalmente aquí se podría marcar "needs_refresh" si cambió foto/cargo/sede
      null;
    else
      if not v_elig.contract_active then
        v_reason := 'contract_expired';
      elsif not v_elig.documents_complete then
        v_reason := 'documents_incomplete';
      else
        v_reason := 'no_longer_eligible';
      end if;

      update public.employee_wallet_cards
      set
        status = 'revoked',
        last_revoked_at = now(),
        revocation_reason = v_reason,
        updated_at = now()
      where id = v_row.id;

      v_revoked_count := v_revoked_count + 1;
      v_revoked_ids := array_append(v_revoked_ids, v_row.employee_id);
    end if;
  end loop;

  return jsonb_build_object(
    'checked_count', v_checked_count,
    'revoked_count', v_revoked_count,
    'revoked_employee_ids', to_jsonb(v_revoked_ids)
  );
end;
$$;

comment on function public.employee_wallet_sync_eligibility() is 'Reevalúa elegibilidad de carnets emitidos y revoca los que ya no cumplan (contrato/documentos). Invocable por cron o Edge Function.';

-- Marcar carnet como emitido (solo el propio empleado, solo si es elegible). Usado desde employee-wallet-pass tras generar saveUrl.
create or replace function public.employee_wallet_mark_issued(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eligible boolean;
begin
  if auth.uid() is null or auth.uid() <> p_employee_id then
    return;
  end if;
  select e.wallet_eligible into v_eligible
  from public.employee_wallet_eligibility(p_employee_id) e
  limit 1;
  if not coalesce(v_eligible, false) then
    return;
  end if;
  insert into public.employee_wallet_cards (employee_id, status, serial_number, last_issued_at, updated_at)
  values (p_employee_id, 'issued', 'emp-' || p_employee_id::text, now(), now())
  on conflict (employee_id) do update set
    status = 'issued',
    serial_number = 'emp-' || p_employee_id::text,
    last_issued_at = now(),
    last_revoked_at = null,
    revocation_reason = null,
    updated_at = now();
end;
$$;

comment on function public.employee_wallet_mark_issued(uuid) is 'Marca el carnet laboral del empleado como emitido (solo el propio usuario, solo si elegible).';
