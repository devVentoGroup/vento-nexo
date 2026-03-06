-- NEXO: AI-assisted ingestion for catalog creation and supplier entries (copilot mode)

begin;

create table if not exists public.inventory_ai_ingestions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  flow_type text not null check (flow_type in ('catalog_create', 'supplier_entries')),
  source_type text not null check (source_type in ('pdf', 'image')),
  source_filename text,
  source_mime text,
  source_size_bytes bigint,
  source_document_sha256 text,
  source_storage_path text,
  status text not null default 'processing' check (status in ('processing', 'needs_review', 'approved', 'rejected', 'failed')),
  error_message text,
  raw_extraction jsonb not null default '{}'::jsonb,
  parsed_document jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_ai_ingestions_site_created
  on public.inventory_ai_ingestions(site_id, created_at desc);

create index if not exists idx_inventory_ai_ingestions_status
  on public.inventory_ai_ingestions(status);

create unique index if not exists ux_inventory_ai_ingestions_dedupe
  on public.inventory_ai_ingestions(site_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(source_document_sha256, ''));

drop trigger if exists update_inventory_ai_ingestions_updated_at on public.inventory_ai_ingestions;
create trigger update_inventory_ai_ingestions_updated_at
  before update on public.inventory_ai_ingestions
  for each row execute function public.update_updated_at();

create table if not exists public.inventory_ai_ingestion_items (
  id uuid primary key default gen_random_uuid(),
  ingestion_id uuid not null references public.inventory_ai_ingestions(id) on delete cascade,
  line_no integer not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  match_status text not null default 'unmatched' check (match_status in ('matched', 'unmatched', 'ambiguous')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  review_status text not null default 'needs_review' check (review_status in ('needs_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_inventory_ai_ingestion_items_line
  on public.inventory_ai_ingestion_items(ingestion_id, line_no);

create index if not exists idx_inventory_ai_ingestion_items_review
  on public.inventory_ai_ingestion_items(review_status);

drop trigger if exists update_inventory_ai_ingestion_items_updated_at on public.inventory_ai_ingestion_items;
create trigger update_inventory_ai_ingestion_items_updated_at
  before update on public.inventory_ai_ingestion_items
  for each row execute function public.update_updated_at();

create table if not exists public.inventory_ai_ingestion_matches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_ai_ingestion_items(id) on delete cascade,
  product_id_candidate uuid references public.products(id) on delete set null,
  score numeric not null default 0 check (score >= 0 and score <= 1),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_ai_ingestion_matches_item
  on public.inventory_ai_ingestion_matches(item_id);

create table if not exists public.inventory_ai_ingestion_actions (
  id uuid primary key default gen_random_uuid(),
  ingestion_id uuid not null references public.inventory_ai_ingestions(id) on delete cascade,
  item_id uuid references public.inventory_ai_ingestion_items(id) on delete set null,
  action_type text not null check (action_type in ('create_product', 'use_existing', 'create_entry', 'reject')),
  approved_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz not null default now(),
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_ai_ingestion_actions_ingestion
  on public.inventory_ai_ingestion_actions(ingestion_id, created_at desc);

create table if not exists public.inventory_supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  alias_text text not null,
  alias_text_norm text generated always as (lower(trim(alias_text))) stored,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_sku text,
  confidence_boost numeric not null default 0 check (confidence_boost >= 0 and confidence_boost <= 0.3),
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_inventory_supplier_aliases_unique
  on public.inventory_supplier_aliases(supplier_id, alias_text_norm);

create index if not exists idx_inventory_supplier_aliases_product
  on public.inventory_supplier_aliases(product_id);

drop trigger if exists update_inventory_supplier_aliases_updated_at on public.inventory_supplier_aliases;
create trigger update_inventory_supplier_aliases_updated_at
  before update on public.inventory_supplier_aliases
  for each row execute function public.update_updated_at();

alter table if exists public.inventory_entry_items
  add column if not exists tax_included boolean;

alter table if exists public.inventory_entry_items
  add column if not exists tax_rate numeric;

alter table if exists public.inventory_entry_items
  add column if not exists net_unit_cost numeric;

alter table if exists public.inventory_entry_items
  add column if not exists gross_unit_cost numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entry_items_tax_rate_chk'
  ) then
    alter table public.inventory_entry_items
      add constraint inventory_entry_items_tax_rate_chk
      check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));
  end if;
end$$;

alter table public.inventory_ai_ingestions enable row level security;
alter table public.inventory_ai_ingestion_items enable row level security;
alter table public.inventory_ai_ingestion_matches enable row level security;
alter table public.inventory_ai_ingestion_actions enable row level security;
alter table public.inventory_supplier_aliases enable row level security;

drop policy if exists inventory_ai_ingestions_select_permission on public.inventory_ai_ingestions;
create policy inventory_ai_ingestions_select_permission on public.inventory_ai_ingestions
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
  );

drop policy if exists inventory_ai_ingestions_insert_permission on public.inventory_ai_ingestions;
create policy inventory_ai_ingestions_insert_permission on public.inventory_ai_ingestions
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
  );

drop policy if exists inventory_ai_ingestions_update_permission on public.inventory_ai_ingestions;
create policy inventory_ai_ingestions_update_permission on public.inventory_ai_ingestions
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
  );

drop policy if exists inventory_ai_ingestions_delete_permission on public.inventory_ai_ingestions;
create policy inventory_ai_ingestions_delete_permission on public.inventory_ai_ingestions
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
  );

drop policy if exists inventory_ai_ingestion_items_select_permission on public.inventory_ai_ingestion_items;
create policy inventory_ai_ingestion_items_select_permission on public.inventory_ai_ingestion_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_items.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_items_insert_permission on public.inventory_ai_ingestion_items;
create policy inventory_ai_ingestion_items_insert_permission on public.inventory_ai_ingestion_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_items.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_items_update_permission on public.inventory_ai_ingestion_items;
create policy inventory_ai_ingestion_items_update_permission on public.inventory_ai_ingestion_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_items.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_items.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_items_delete_permission on public.inventory_ai_ingestion_items;
create policy inventory_ai_ingestion_items_delete_permission on public.inventory_ai_ingestion_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_items.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_matches_select_permission on public.inventory_ai_ingestion_matches;
create policy inventory_ai_ingestion_matches_select_permission on public.inventory_ai_ingestion_matches
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_ai_ingestion_items ii
      join public.inventory_ai_ingestions i on i.id = ii.ingestion_id
      where ii.id = inventory_ai_ingestion_matches.item_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_matches_insert_permission on public.inventory_ai_ingestion_matches;
create policy inventory_ai_ingestion_matches_insert_permission on public.inventory_ai_ingestion_matches
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_ai_ingestion_items ii
      join public.inventory_ai_ingestions i on i.id = ii.ingestion_id
      where ii.id = inventory_ai_ingestion_matches.item_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_actions_select_permission on public.inventory_ai_ingestion_actions;
create policy inventory_ai_ingestion_actions_select_permission on public.inventory_ai_ingestion_actions
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_actions.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_ai_ingestion_actions_insert_permission on public.inventory_ai_ingestion_actions;
create policy inventory_ai_ingestion_actions_insert_permission on public.inventory_ai_ingestion_actions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_ai_ingestions i
      where i.id = inventory_ai_ingestion_actions.ingestion_id
        and (
          public.has_permission('nexo.inventory.stock', i.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', i.site_id)
        )
    )
  );

drop policy if exists inventory_supplier_aliases_select_permission on public.inventory_supplier_aliases;
create policy inventory_supplier_aliases_select_permission on public.inventory_supplier_aliases
  for select to authenticated
  using (true);

drop policy if exists inventory_supplier_aliases_insert_permission on public.inventory_supplier_aliases;
create policy inventory_supplier_aliases_insert_permission on public.inventory_supplier_aliases
  for insert to authenticated
  with check (true);

drop policy if exists inventory_supplier_aliases_update_permission on public.inventory_supplier_aliases;
create policy inventory_supplier_aliases_update_permission on public.inventory_supplier_aliases
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists inventory_supplier_aliases_delete_permission on public.inventory_supplier_aliases;
create policy inventory_supplier_aliases_delete_permission on public.inventory_supplier_aliases
  for delete to authenticated
  using (true);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'nexo-ai-documents',
  'nexo-ai-documents',
  false,
  12582912,
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nexo_ai_documents_read" on storage.objects;
drop policy if exists "nexo_ai_documents_insert" on storage.objects;
drop policy if exists "nexo_ai_documents_update" on storage.objects;
drop policy if exists "nexo_ai_documents_delete" on storage.objects;

create policy "nexo_ai_documents_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'nexo-ai-documents');

create policy "nexo_ai_documents_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'nexo-ai-documents');

create policy "nexo_ai_documents_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'nexo-ai-documents')
with check (bucket_id = 'nexo-ai-documents');

create policy "nexo_ai_documents_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'nexo-ai-documents');

commit;
