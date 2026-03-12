-- Grant SELECT on club tables to authenticated so RPCs (security invoker) can read them.
-- RLS policies already restrict rows; without these grants, "permission denied for table beta_access" occurs.
begin;

grant select on club.beta_access to authenticated;
grant select on club.entitlements to authenticated;
grant select on club.subscriptions to authenticated;
grant select on club.plans to authenticated;
grant select on club.store_products to authenticated;
grant select on club.audit_events to authenticated;

commit;
