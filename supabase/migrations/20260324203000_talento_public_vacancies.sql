-- Public vacancies portal for Vento Talento

grant usage on schema talento to anon;
grant select on talento.vacancies to anon;

drop policy if exists talento_vacancies_select_published_anon on talento.vacancies;
create policy talento_vacancies_select_published_anon
  on talento.vacancies
  for select
  to anon
  using (status = 'published');
