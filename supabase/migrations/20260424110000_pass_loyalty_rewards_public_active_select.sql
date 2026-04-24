begin;

-- Pass clients must be able to read the active rewards catalog.
-- Admin policies still cover draft/inactive rewards for VISO management.
drop policy if exists loyalty_rewards_select_active_public on pass.loyalty_rewards;
create policy loyalty_rewards_select_active_public
on pass.loyalty_rewards
for select
to anon, authenticated
using (is_active = true);

grant select on table pass.loyalty_rewards to anon, authenticated;

commit;
