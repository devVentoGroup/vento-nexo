-- Returns the authenticated user's cumulative earned points.
-- Keeps aggregation in Postgres to avoid fetching full transaction history in clients.

create or replace function public.get_my_total_earned_points()
returns table (total_earned bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(lt.points_delta), 0)::bigint as total_earned
  from public.loyalty_transactions lt
  where lt.user_id = auth.uid()
    and lt.kind = 'earn';
$$;

grant execute on function public.get_my_total_earned_points() to authenticated;
