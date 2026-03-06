begin;

create table if not exists public.loyalty_external_sales (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  amount_cop numeric not null check (amount_cop > 0),
  points_awarded integer not null check (points_awarded > 0),
  external_ref text not null,
  source_app text not null default 'pulso',
  awarded_by uuid not null references public.employees(id) on delete restrict,
  loyalty_transaction_id uuid references public.loyalty_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_external_sales_external_ref_chk check (btrim(external_ref) <> '')
);

create unique index if not exists uq_loyalty_external_sales_site_ref
  on public.loyalty_external_sales (site_id, lower(btrim(external_ref)));

create index if not exists idx_loyalty_external_sales_user_created
  on public.loyalty_external_sales (user_id, created_at desc);

alter table public.loyalty_external_sales enable row level security;

drop policy if exists loyalty_external_sales_select_staff on public.loyalty_external_sales;
create policy loyalty_external_sales_select_staff
  on public.loyalty_external_sales
  for select to authenticated
  using (
    public.is_active_staff()
    and public.has_permission('pulso.pos.main', site_id, null)
  );

drop policy if exists loyalty_external_sales_insert_staff on public.loyalty_external_sales;
create policy loyalty_external_sales_insert_staff
  on public.loyalty_external_sales
  for insert to authenticated
  with check (
    public.is_active_staff()
    and public.has_permission('pulso.pos.main', site_id, null)
    and awarded_by = auth.uid()
  );

create or replace function public.award_loyalty_points_external(
  p_user_id uuid,
  p_site_id uuid,
  p_amount_cop numeric,
  p_external_ref text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer;
  v_ref text;
  v_sale_id uuid;
  v_grant_result jsonb;
  v_transaction_id uuid;
  v_new_balance integer;
begin
  if not public.is_active_staff() then
    return jsonb_build_object('success', false, 'error', 'No autorizado: se requiere personal activo');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id es obligatorio');
  end if;

  if p_site_id is null then
    return jsonb_build_object('success', false, 'error', 'site_id es obligatorio');
  end if;

  if not public.has_permission('pulso.pos.main', p_site_id, null) then
    return jsonb_build_object('success', false, 'error', 'No autorizado para operar en esta sede');
  end if;

  if p_amount_cop is null or p_amount_cop <= 0 then
    return jsonb_build_object('success', false, 'error', 'amount_cop debe ser mayor a 0');
  end if;

  v_ref := btrim(coalesce(p_external_ref, ''));
  if v_ref = '' then
    return jsonb_build_object('success', false, 'error', 'external_ref es obligatorio');
  end if;

  v_points := floor(p_amount_cop / 1000);
  if v_points <= 0 then
    return jsonb_build_object('success', false, 'error', 'El monto no genera puntos');
  end if;

  begin
    insert into public.loyalty_external_sales (
      site_id,
      user_id,
      amount_cop,
      points_awarded,
      external_ref,
      source_app,
      awarded_by,
      metadata
    ) values (
      p_site_id,
      p_user_id,
      p_amount_cop,
      v_points,
      v_ref,
      'pulso',
      auth.uid(),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('external_ref', v_ref, 'site_id', p_site_id)
    )
    returning id into v_sale_id;
  exception
    when unique_violation then
      return jsonb_build_object(
        'success', false,
        'duplicate', true,
        'error', 'Referencia externa ya registrada en esta sede'
      );
  end;

  v_grant_result := public.grant_loyalty_points(
    p_user_id,
    v_points,
    coalesce(p_description, format('Compra externa (%s)', v_ref)),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source_app', 'pulso',
        'flow', 'external_pos',
        'site_id', p_site_id,
        'external_ref', v_ref,
        'external_sale_id', v_sale_id
      )
  );

  if coalesce((v_grant_result->>'success')::boolean, false) is not true then
    raise exception '%', coalesce(v_grant_result->>'error', 'Error al otorgar puntos');
  end if;

  v_transaction_id := nullif(v_grant_result->>'transaction_id', '')::uuid;
  v_new_balance := nullif(v_grant_result->>'new_balance', '')::integer;

  update public.loyalty_external_sales
  set loyalty_transaction_id = v_transaction_id
  where id = v_sale_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'points_awarded', v_points,
    'new_balance', v_new_balance,
    'transaction_id', v_transaction_id,
    'external_sale_id', v_sale_id
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant select, insert on public.loyalty_external_sales to authenticated;
grant execute on function public.award_loyalty_points_external(uuid, uuid, numeric, text, text, jsonb) to authenticated;

commit;
