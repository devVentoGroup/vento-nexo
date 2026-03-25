-- Vento Talento - Foundation SQL
-- Draft inicial para Supabase / Postgres
-- Objetivo: dominio base de reclutamiento y pre-ingreso separado de ANIMA

create schema if not exists talento;

create extension if not exists pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'application_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.application_status AS ENUM (
      'draft',
      'submitted',
      'in_review',
      'shortlisted',
      'interview',
      'validation',
      'offer',
      'preboarding',
      'hired',
      'rejected',
      'withdrawn',
      'paused',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'stage_code' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.stage_code AS ENUM (
      'applied',
      'documents',
      'screening',
      'interview',
      'medical',
      'offer',
      'preboarding',
      'handoff'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'document_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.document_status AS ENUM (
      'pending',
      'uploaded',
      'in_review',
      'approved',
      'rejected',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'interview_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.interview_status AS ENUM (
      'pending_schedule',
      'scheduled',
      'confirmed',
      'completed',
      'cancelled',
      'no_show'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'medical_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.medical_status AS ENUM (
      'pending',
      'scheduled',
      'completed',
      'approved',
      'observed',
      'repeat_required'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'offer_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.offer_status AS ENUM (
      'pending',
      'accepted',
      'rejected_by_candidate',
      'withdrawn',
      'expired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'requirement_status' AND n.nspname = 'talento') THEN
    CREATE TYPE talento.requirement_status AS ENUM (
      'pending',
      'submitted',
      'approved',
      'rejected',
      'waived'
    );
  END IF;
END
$$;

create table if not exists talento.candidates (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  phone text,
  first_name text not null,
  last_name text not null,
  document_type text,
  document_number text,
  city text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talento_candidates_document_unique unique (document_type, document_number)
);

create table if not exists talento.candidate_profiles (
  candidate_id uuid primary key references talento.candidates(id) on delete cascade,
  birth_date date,
  address text,
  experience_summary text,
  availability_type text,
  salary_expectation numeric(12,2),
  education_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  site_id uuid,
  city text,
  employment_type text,
  schedule_type text,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  status text not null default 'draft',
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references talento.candidates(id) on delete cascade,
  vacancy_id uuid not null references talento.vacancies(id) on delete restrict,
  status talento.application_status not null default 'submitted',
  current_stage_code talento.stage_code not null default 'applied',
  is_primary_active boolean not null default false,
  applied_at timestamptz not null default now(),
  last_stage_changed_at timestamptz not null default now(),
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists talento_applications_one_primary_active_per_candidate
  on talento.applications(candidate_id)
  where is_primary_active;

create table if not exists talento.application_stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  stage_code talento.stage_code not null,
  status talento.application_status not null,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  changed_by uuid,
  reason_code text,
  public_note text,
  internal_note text,
  created_at timestamptz not null default now()
);

create table if not exists talento.application_requirements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  requirement_type text not null,
  stage_code talento.stage_code,
  title text not null,
  description text,
  is_required boolean not null default true,
  status talento.requirement_status not null default 'pending',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references talento.candidates(id) on delete cascade,
  application_id uuid references talento.applications(id) on delete cascade,
  document_type_code text not null,
  file_path text not null,
  version integer not null default 1,
  status talento.document_status not null default 'uploaded',
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  scheduled_at timestamptz,
  format text,
  location text,
  meeting_url text,
  status talento.interview_status not null default 'pending_schedule',
  confirmed_at timestamptz,
  result text,
  public_note text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.medical_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  evaluation_type text not null,
  provider_name text,
  scheduled_at timestamptz,
  status talento.medical_status not null default 'pending',
  result text,
  public_note text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references talento.applications(id) on delete cascade,
  status talento.offer_status not null default 'pending',
  position_title text,
  site_id uuid,
  start_date_expected date,
  salary_amount numeric(12,2),
  public_note text,
  internal_note text,
  candidate_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.preboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  task_code text not null,
  title text not null,
  status talento.requirement_status not null default 'pending',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists talento.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references talento.applications(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists talento.candidate_employee_links (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references talento.candidates(id) on delete cascade,
  application_id uuid not null unique references talento.applications(id) on delete cascade,
  employee_id uuid not null,
  transferred_at timestamptz not null default now(),
  transferred_by uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists talento_candidates_auth_user_id_idx on talento.candidates(auth_user_id);
create index if not exists talento_candidates_email_idx on talento.candidates(email);
create index if not exists talento_candidates_document_number_idx on talento.candidates(document_number);
create index if not exists talento_vacancies_status_idx on talento.vacancies(status);
create index if not exists talento_vacancies_published_at_idx on talento.vacancies(published_at desc);
create index if not exists talento_vacancies_city_idx on talento.vacancies(city);
create index if not exists talento_vacancies_site_id_idx on talento.vacancies(site_id);
create index if not exists talento_applications_candidate_id_idx on talento.applications(candidate_id);
create index if not exists talento_applications_vacancy_id_idx on talento.applications(vacancy_id);
create index if not exists talento_applications_status_idx on talento.applications(status);
create index if not exists talento_applications_stage_idx on talento.applications(current_stage_code);
create index if not exists talento_stage_history_application_idx on talento.application_stage_history(application_id, entered_at desc);
create index if not exists talento_requirements_application_idx on talento.application_requirements(application_id);
create index if not exists talento_documents_candidate_idx on talento.candidate_documents(candidate_id);
create index if not exists talento_documents_application_idx on talento.candidate_documents(application_id);
create index if not exists talento_documents_status_idx on talento.candidate_documents(status);
create index if not exists talento_interviews_application_idx on talento.interviews(application_id);
create index if not exists talento_interviews_status_idx on talento.interviews(status);
create index if not exists talento_interviews_scheduled_at_idx on talento.interviews(scheduled_at);
create index if not exists talento_medical_application_idx on talento.medical_evaluations(application_id);
create index if not exists talento_preboarding_application_idx on talento.preboarding_tasks(application_id);
create index if not exists talento_events_application_idx on talento.application_events(application_id, created_at desc);

alter table talento.candidates enable row level security;
alter table talento.candidate_profiles enable row level security;
alter table talento.vacancies enable row level security;
alter table talento.applications enable row level security;
alter table talento.application_stage_history enable row level security;
alter table talento.application_requirements enable row level security;
alter table talento.candidate_documents enable row level security;
alter table talento.interviews enable row level security;
alter table talento.medical_evaluations enable row level security;
alter table talento.offers enable row level security;
alter table talento.preboarding_tasks enable row level security;
alter table talento.application_events enable row level security;
alter table talento.candidate_employee_links enable row level security;

create or replace function talento.current_candidate_id()
returns uuid
language sql
stable
as $$
  select c.id
  from talento.candidates c
  where c.auth_user_id = auth.uid()
  limit 1
$$;

revoke all on schema talento from public;
grant usage on schema talento to authenticated;
grant usage on schema talento to service_role;

grant select, insert, update on talento.candidates to authenticated;
grant select, insert, update on talento.candidate_profiles to authenticated;
grant select on talento.vacancies to authenticated;
grant select, insert on talento.applications to authenticated;
grant select on talento.application_stage_history to authenticated;
grant select on talento.application_requirements to authenticated;
grant select, insert on talento.candidate_documents to authenticated;
grant select on talento.interviews to authenticated;
grant select on talento.medical_evaluations to authenticated;
grant select on talento.offers to authenticated;
grant select on talento.preboarding_tasks to authenticated;
grant select on talento.application_events to authenticated;
grant select on talento.candidate_employee_links to authenticated;

drop policy if exists talento_candidates_select_own on talento.candidates;
create policy talento_candidates_select_own
  on talento.candidates
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists talento_candidates_insert_own on talento.candidates;
create policy talento_candidates_insert_own
  on talento.candidates
  for insert
  to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists talento_candidates_update_own on talento.candidates;
create policy talento_candidates_update_own
  on talento.candidates
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists talento_profiles_select_own on talento.candidate_profiles;
create policy talento_profiles_select_own
  on talento.candidate_profiles
  for select
  to authenticated
  using (candidate_id = talento.current_candidate_id());

drop policy if exists talento_profiles_insert_own on talento.candidate_profiles;
create policy talento_profiles_insert_own
  on talento.candidate_profiles
  for insert
  to authenticated
  with check (candidate_id = talento.current_candidate_id());

drop policy if exists talento_profiles_update_own on talento.candidate_profiles;
create policy talento_profiles_update_own
  on talento.candidate_profiles
  for update
  to authenticated
  using (candidate_id = talento.current_candidate_id())
  with check (candidate_id = talento.current_candidate_id());

drop policy if exists talento_vacancies_select_published on talento.vacancies;
create policy talento_vacancies_select_published
  on talento.vacancies
  for select
  to authenticated
  using (status = 'published');

drop policy if exists talento_applications_select_own on talento.applications;
create policy talento_applications_select_own
  on talento.applications
  for select
  to authenticated
  using (candidate_id = talento.current_candidate_id());

drop policy if exists talento_applications_insert_own on talento.applications;
create policy talento_applications_insert_own
  on talento.applications
  for insert
  to authenticated
  with check (candidate_id = talento.current_candidate_id());

drop policy if exists talento_stage_history_select_own on talento.application_stage_history;
create policy talento_stage_history_select_own
  on talento.application_stage_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_requirements_select_own on talento.application_requirements;
create policy talento_requirements_select_own
  on talento.application_requirements
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_documents_select_own on talento.candidate_documents;
create policy talento_documents_select_own
  on talento.candidate_documents
  for select
  to authenticated
  using (candidate_id = talento.current_candidate_id());

drop policy if exists talento_documents_insert_own on talento.candidate_documents;
create policy talento_documents_insert_own
  on talento.candidate_documents
  for insert
  to authenticated
  with check (candidate_id = talento.current_candidate_id());

drop policy if exists talento_interviews_select_own on talento.interviews;
create policy talento_interviews_select_own
  on talento.interviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_medical_select_own on talento.medical_evaluations;
create policy talento_medical_select_own
  on talento.medical_evaluations
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_offers_select_own on talento.offers;
create policy talento_offers_select_own
  on talento.offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_preboarding_select_own on talento.preboarding_tasks;
create policy talento_preboarding_select_own
  on talento.preboarding_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_events_select_own on talento.application_events;
create policy talento_events_select_own
  on talento.application_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from talento.applications a
      where a.id = application_id
        and a.candidate_id = talento.current_candidate_id()
    )
  );

drop policy if exists talento_links_select_own on talento.candidate_employee_links;
create policy talento_links_select_own
  on talento.candidate_employee_links
  for select
  to authenticated
  using (candidate_id = talento.current_candidate_id());
