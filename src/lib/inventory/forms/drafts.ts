import type { FormDraftKey } from "@/lib/inventory/forms/types";

const DRAFT_TTL_DAYS = 30;
const NULL_SCOPE_SITE_ID = "00000000-0000-0000-0000-000000000000";

export type SupabaseLike = {
  from: (table: string) => SupabaseTableLike;
};

type SupabaseErrorLike = { message: string } | null;

type SupabaseMutationResult = {
  error: SupabaseErrorLike;
};

type SupabaseFilterChain = Promise<SupabaseMutationResult> & {
  eq: (column: string, value: unknown) => SupabaseFilterChain;
  maybeSingle: () => Promise<{ data: unknown; error: SupabaseErrorLike }>;
};

type SupabaseTableLike = {
  select: (columns: string) => SupabaseFilterChain;
  upsert: (
    payload: Record<string, unknown>,
    options: { onConflict: string }
  ) => Promise<SupabaseMutationResult>;
  delete: () => SupabaseFilterChain;
};

type InventoryFormDraftRow = {
  id: string;
  user_id: string;
  form_key: string;
  entity_id: string | null;
  site_id: string | null;
  step_id: string | null;
  payload_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  entity_scope: string;
  site_scope: string;
};

type DraftScope = {
  userId: string;
  formKey: FormDraftKey;
  entityId?: string | null;
  siteId?: string | null;
};

function normalizeEntityId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeSiteId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function saveDraft(params: {
  supabase: SupabaseLike;
  userId: string;
  formKey: FormDraftKey;
  payload: Record<string, unknown>;
  stepId?: string | null;
  entityId?: string | null;
  siteId?: string | null;
  ttlDays?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ttlDays = Number.isFinite(Number(params.ttlDays))
    ? Math.max(1, Number(params.ttlDays))
    : DRAFT_TTL_DAYS;
  const now = Date.now();
  const expiresAt = new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    user_id: params.userId,
    form_key: params.formKey,
    entity_id: normalizeEntityId(params.entityId ?? null) || null,
    site_id: normalizeSiteId(params.siteId ?? null) || null,
    step_id: params.stepId ? String(params.stepId).trim() : null,
    payload_json: params.payload ?? {},
    expires_at: expiresAt,
    updated_at: new Date(now).toISOString(),
  };

  const { error } = await params.supabase.from("inventory_form_drafts").upsert(payload, {
    onConflict: "user_id,form_key,entity_scope,site_scope",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadDraft(params: {
  supabase: SupabaseLike;
  userId: string;
  formKey: FormDraftKey;
  entityId?: string | null;
  siteId?: string | null;
}): Promise<InventoryFormDraftRow | null> {
  const entityScope = normalizeEntityId(params.entityId ?? null);
  const siteScope = normalizeSiteId(params.siteId ?? null) || NULL_SCOPE_SITE_ID;

  const { data, error } = await params.supabase
    .from("inventory_form_drafts")
    .select(
      "id,user_id,form_key,entity_id,site_id,step_id,payload_json,created_at,updated_at,expires_at,entity_scope,site_scope"
    )
    .eq("user_id", params.userId)
    .eq("form_key", params.formKey)
    .eq("entity_scope", entityScope)
    .eq("site_scope", siteScope)
    .maybeSingle();

  if (error || !data) return null;
  return data as InventoryFormDraftRow;
}

export async function clearDraft(params: {
  supabase: SupabaseLike;
  userId: string;
  formKey: FormDraftKey;
  entityId?: string | null;
  siteId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const entityScope = normalizeEntityId(params.entityId ?? null);
  const siteScope = normalizeSiteId(params.siteId ?? null) || NULL_SCOPE_SITE_ID;

  const { error } = await params.supabase
    .from("inventory_form_drafts")
    .delete()
    .eq("user_id", params.userId)
    .eq("form_key", params.formKey)
    .eq("entity_scope", entityScope)
    .eq("site_scope", siteScope);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type { InventoryFormDraftRow, DraftScope };
