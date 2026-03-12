-- Grant SELECT on club wallet tables so RPCs get_my_wallet / list_my_wallet_ledger
-- (security invoker) can read. RLS limits rows to the current user.
-- Fixes: permission denied for table wallet_accounts (42501)
begin;

grant select on club.wallet_accounts to authenticated;
grant select on club.wallet_ledger to authenticated;

commit;
