begin;

grant usage on schema talento to service_role;

grant select, insert, update, delete on table talento.vacancies to service_role;

commit;
