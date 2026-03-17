begin;

grant select, insert, update, delete
on public.pass_satellites
to authenticated;

commit;
