create table if not exists public.printing_label_templates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null default 'nexo',
  name text not null,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_printing_label_templates_user_app
  on public.printing_label_templates(user_id, app_id, updated_at desc);

drop trigger if exists trg_printing_label_templates_updated_at on public.printing_label_templates;
create trigger trg_printing_label_templates_updated_at
before update on public.printing_label_templates
for each row execute function public._set_updated_at();

alter table public.printing_label_templates enable row level security;

drop policy if exists "printing_label_templates_select_own" on public.printing_label_templates;
create policy "printing_label_templates_select_own"
on public.printing_label_templates
for select
to authenticated
using (auth.uid() = user_id and app_id = 'nexo');

drop policy if exists "printing_label_templates_insert_own" on public.printing_label_templates;
create policy "printing_label_templates_insert_own"
on public.printing_label_templates
for insert
to authenticated
with check (auth.uid() = user_id and app_id = 'nexo');

drop policy if exists "printing_label_templates_update_own" on public.printing_label_templates;
create policy "printing_label_templates_update_own"
on public.printing_label_templates
for update
to authenticated
using (auth.uid() = user_id and app_id = 'nexo')
with check (auth.uid() = user_id and app_id = 'nexo');

drop policy if exists "printing_label_templates_delete_own" on public.printing_label_templates;
create policy "printing_label_templates_delete_own"
on public.printing_label_templates
for delete
to authenticated
using (auth.uid() = user_id and app_id = 'nexo');
