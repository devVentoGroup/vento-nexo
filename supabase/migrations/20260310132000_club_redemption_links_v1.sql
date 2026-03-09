begin;

create table if not exists club.redemption_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loyalty_redemption_id uuid not null references public.loyalty_redemptions(id) on delete cascade,
  debit_ledger_id uuid not null references club.wallet_ledger(id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  reversed_at timestamptz,
  reverse_ledger_id uuid references club.wallet_ledger(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (loyalty_redemption_id)
);

create index if not exists club_redemption_links_user_created_idx
  on club.redemption_links(user_id, created_at desc);

alter table club.redemption_links enable row level security;

drop policy if exists club_redemption_links_select_self on club.redemption_links;
create policy club_redemption_links_select_self
on club.redemption_links
for select
to authenticated
using (auth.uid() = user_id);

create or replace function club.apply_redeem_debit(
  p_loyalty_redemption_id uuid,
  p_amount_minor integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, club, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_redemption record;
  v_wallet club.wallet_accounts%rowtype;
  v_debit_ledger_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'p_amount_minor must be greater than zero';
  end if;

  select lr.id, lr.user_id
  into v_redemption
  from public.loyalty_redemptions lr
  where lr.id = p_loyalty_redemption_id
  limit 1;

  if v_redemption.id is null then
    raise exception 'redemption not found';
  end if;

  if v_redemption.user_id is distinct from v_user_id then
    raise exception 'redemption does not belong to auth user';
  end if;

  if exists (
    select 1
    from club.redemption_links rl
    where rl.loyalty_redemption_id = p_loyalty_redemption_id
  ) then
    return jsonb_build_object(
      'success', true,
      'already_linked', true
    );
  end if;

  insert into club.wallet_accounts (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from club.wallet_accounts
  where user_id = v_user_id
  for update;

  if coalesce(v_wallet.available_minor, 0) < p_amount_minor then
    raise exception 'insufficient club wallet balance';
  end if;

  insert into club.wallet_ledger (
    user_id, kind, amount_minor, reference_type, reference_id, description, metadata
  )
  values (
    v_user_id,
    'redeem_debit',
    -p_amount_minor,
    'redemption',
    p_loyalty_redemption_id,
    'Debito por redencion en Vento Pass',
    jsonb_build_object('loyalty_redemption_id', p_loyalty_redemption_id)
  )
  returning id into v_debit_ledger_id;

  update club.wallet_accounts
  set
    available_minor = available_minor - p_amount_minor,
    updated_at = now()
  where user_id = v_user_id;

  insert into club.redemption_links (
    user_id,
    loyalty_redemption_id,
    debit_ledger_id,
    amount_minor
  )
  values (
    v_user_id,
    p_loyalty_redemption_id,
    v_debit_ledger_id,
    p_amount_minor
  );

  return jsonb_build_object(
    'success', true,
    'amount_minor', p_amount_minor,
    'debit_ledger_id', v_debit_ledger_id
  );
end;
$$;

create or replace function club.reverse_redeem_debit(
  p_loyalty_redemption_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, club, auth
as $$
declare
  v_link club.redemption_links%rowtype;
  v_reverse_ledger_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select *
  into v_link
  from club.redemption_links rl
  where rl.loyalty_redemption_id = p_loyalty_redemption_id
  for update;

  if v_link.id is null then
    return jsonb_build_object('success', false, 'error', 'link_not_found');
  end if;

  if v_link.reversed_at is not null then
    return jsonb_build_object('success', true, 'already_reversed', true);
  end if;

  insert into club.wallet_ledger (
    user_id, kind, amount_minor, reference_type, reference_id, description, metadata
  )
  values (
    v_link.user_id,
    'reversal',
    v_link.amount_minor,
    'redemption',
    p_loyalty_redemption_id,
    coalesce(p_reason, 'Reversion de debito por redencion'),
    jsonb_build_object('loyalty_redemption_id', p_loyalty_redemption_id)
  )
  returning id into v_reverse_ledger_id;

  update club.wallet_accounts
  set
    available_minor = available_minor + v_link.amount_minor,
    updated_at = now()
  where user_id = v_link.user_id;

  update club.redemption_links
  set
    reversed_at = now(),
    reverse_ledger_id = v_reverse_ledger_id
  where id = v_link.id;

  return jsonb_build_object(
    'success', true,
    'reverse_ledger_id', v_reverse_ledger_id
  );
end;
$$;

grant execute on function club.apply_redeem_debit(uuid, integer) to authenticated, service_role;
grant execute on function club.reverse_redeem_debit(uuid, text) to service_role;

commit;

