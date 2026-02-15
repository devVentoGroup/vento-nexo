import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CategorySettingsForm } from "@/components/inventory/CategorySettingsForm";
import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  CATEGORY_DOMAIN_LABELS,
  getCategoryDomainOptions,
} from "@/lib/constants";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type SupabaseLike,
} from "@/lib/inventory/forms/drafts";
import type { FormDraftKey } from "@/lib/inventory/forms/types";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_KINDS,
  buildCategorySuggestedDescription,
  categoryKindFromProduct,
  categorySupportsKind,
  collectDescendantIds,
  filterCategoryRows,
  getCategoryChannelLabel,
  getCategoryPath,
  isSalesOnlyCategoryKinds,
  normalizeCategoryDomain,
  normalizeCategoryKind,
  normalizeCategoryScope,
  parseCategoryKinds,
  resolveCategoryDescription,
  shouldShowCategoryDomain,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";

export const dynamic = "force-dynamic";

type CategoryRow = InventoryCategoryRow;
type CategorySettingsView = "explorar" | "ficha" | "salud";

type SearchParams = {
  ok?: string;
  error?: string;
  view?: string;
  step?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  edit_id?: string;
};

type ProductAuditRow = {
  id: string;
  name: string | null;
  category_id: string | null;
  product_type: string | null;
  product_inventory_profiles?:
    | {
        inventory_kind: string | null;
      }
    | Array<{
        inventory_kind: string | null;
      }>
    | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type InconsistentAssignment = {
  product_id: string;
  product_name: string;
  category_id: string;
  reason: string;
  category_path: string;
};

const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  insumo: "Insumo",
  preparacion: "Preparacion",
  venta: "Venta",
  equipo: "Equipo",
};

const CATEGORY_SETTINGS_DRAFT_KEY: FormDraftKey = "inventory.category.settings";
const TABLE_ACTION_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0";
const TABLE_DELETE_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700";

function asText(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "undefined" || value === null) return "";
  return String(value).trim();
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "categoria";
}

function buildPageUrl(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `/inventory/settings/categories?${qs}` : "/inventory/settings/categories";
}

function normalizeView(value: string | null | undefined): CategorySettingsView {
  const normalized = asText(value).toLowerCase();
  if (normalized === "ficha") return "ficha";
  if (normalized === "salud") return "salud";
  return "explorar";
}

function extractInventoryKind(row: ProductAuditRow): string | null {
  const profile = row.product_inventory_profiles;
  if (!profile) return null;
  if (Array.isArray(profile)) {
    return asText(profile[0]?.inventory_kind ?? null) || null;
  }
  return asText(profile.inventory_kind ?? null) || null;
}

function parseKindsFromForm(formData: FormData): CategoryKind[] {
  const values = formData.getAll("applies_to_kinds");
  const parsed = values
    .map((value) => normalizeCategoryKind(asText(value)))
    .filter((value): value is CategoryKind => Boolean(value));
  return Array.from(new Set(parsed));
}

async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<CategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,description,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as CategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,description,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<CategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

async function loadProductAuditRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<ProductAuditRow[]> {
  const allRows: ProductAuditRow[] = [];
  const pageSize = 1000;
  let from = 0;
  let keepLoading = true;

  while (keepLoading) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,category_id,product_type,product_inventory_profiles(inventory_kind)")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error || !data) break;

    const rows = data as unknown as ProductAuditRow[];
    allRows.push(...rows);
    keepLoading = rows.length === pageSize;
    from += pageSize;

    if (from > 50000) break;
  }

  return allRows;
}
async function requireCategoryManager() {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/settings/categories"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = asText(employee?.role ?? null).toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(
      "/inventory/settings/categories?error=" +
        encodeURIComponent("Solo propietarios y gerentes generales pueden gestionar categorías.")
    );
  }

  return { supabase, user };
}

function buildReturnUrl(
  returnQs: string,
  returnView: string,
  statusKey: "ok" | "error",
  message: string,
  extra?: { editId?: string; stepId?: string }
): string {
  const params = new URLSearchParams(returnQs);
  params.set("view", normalizeView(returnView));
  params.set(statusKey, message);
  if (extra?.editId) params.set("edit_id", extra.editId);
  if (extra?.stepId) params.set("step", extra.stepId);
  return buildPageUrl(params);
}

async function saveCategoryAction(formData: FormData) {
  "use server";

  const { supabase, user } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView: CategorySettingsView = "explorar";

  const id = asText(formData.get("id"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id")) || null;
  const parentIdRaw = asText(formData.get("parent_id"));
  const parentId = parentIdRaw && parentIdRaw !== id ? parentIdRaw : null;
  const slug = slugify(asText(formData.get("slug")) || name);
  const isActive = formData.get("is_active") === "on";
  const kinds = parseKindsFromForm(formData);
  const rawDescription = asText(formData.get("description"));
  const requestedDomain = normalizeCategoryDomain(asText(formData.get("domain")));
  const resolvedDescription = isSalesOnlyCategoryKinds(kinds)
    ? ""
    : rawDescription || buildCategorySuggestedDescription({ name, kinds });

  if (!name) {
    redirect(buildReturnUrl(returnQs, returnView, "error", "El nombre de categoria es obligatorio.", { editId: id }));
  }
  if (!kinds.length) {
    redirect(buildReturnUrl(returnQs, returnView, "error", "Selecciona al menos un uso.", { editId: id }));
  }
  if (requestedDomain && !kinds.includes("venta")) {
    redirect(
      buildReturnUrl(
        returnQs,
        returnView,
        "error",
        "Canal solo aplica cuando el uso incluye Venta.",
        { editId: id }
      )
    );
  }

  const payload: Record<string, unknown> = {
    name,
    slug,
    parent_id: parentId,
    site_id: siteId,
    domain: requestedDomain || null,
    description: resolvedDescription || null,
    is_active: isActive,
    applies_to_kinds: kinds,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from("product_categories").update(payload).eq("id", id);
    if (error) {
      redirect(buildReturnUrl(returnQs, returnView, "error", error.message, { editId: id }));
    }
    await clearDraft({
      supabase: supabase as unknown as SupabaseLike,
      userId: user.id,
      formKey: CATEGORY_SETTINGS_DRAFT_KEY,
      entityId: id,
      siteId,
    });
    revalidatePath("/inventory/settings/categories");
    revalidatePath("/inventory/catalog");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/catalog/new");
    redirect(buildReturnUrl(returnQs, returnView, "ok", "category_updated", { editId: id }));
  }

  const { data: created, error } = await supabase
    .from("product_categories")
    .insert(payload)
    .select("id")
    .single();

  if (error || !created) {
    redirect(buildReturnUrl(returnQs, returnView, "error", error?.message ?? "No fue posible crear la categoria."));
  }

  await clearDraft({
    supabase: supabase as unknown as SupabaseLike,
    userId: user.id,
    formKey: CATEGORY_SETTINGS_DRAFT_KEY,
    entityId: "",
    siteId,
  });
  await clearDraft({
    supabase: supabase as unknown as SupabaseLike,
    userId: user.id,
    formKey: CATEGORY_SETTINGS_DRAFT_KEY,
    entityId: created.id,
    siteId,
  });

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/catalog/new");
  redirect(buildReturnUrl(returnQs, returnView, "ok", "category_created", { editId: created.id }));
}

async function saveCategoryDraftAction(formData: FormData) {
  "use server";

  const { supabase, user } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "ficha";
  const draftEntityId = asText(formData.get("_draft_entity_id")) || asText(formData.get("id"));
  const siteId = asText(formData.get("site_id")) || null;
  const stepId = asText(formData.get("_current_step")) || null;
  const kinds = parseKindsFromForm(formData);

  const payload = {
    name: asText(formData.get("name")),
    slug: asText(formData.get("slug")),
    parent_id: asText(formData.get("parent_id")) || "",
    description: asText(formData.get("description")),
    site_id: siteId || "",
    domain: normalizeCategoryDomain(asText(formData.get("domain")) || ""),
    is_active: formData.get("is_active") === "on",
    applies_to_kinds: kinds,
    step: stepId ?? "",
  };

  const result = await saveDraft({
    supabase: supabase as unknown as SupabaseLike,
    userId: user.id,
    formKey: CATEGORY_SETTINGS_DRAFT_KEY,
    entityId: draftEntityId || "",
    siteId,
    stepId,
    payload,
  });

  if (!result.ok) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", result.error, {
        editId: draftEntityId || undefined,
        stepId: stepId || undefined,
      })
    );
  }

  redirect(
    buildReturnUrl(returnQs, returnView, "ok", "draft_saved", {
      editId: draftEntityId || undefined,
      stepId: stepId || undefined,
    })
  );
}

async function autofillCategoryDescriptionsAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";

  const { data: categoryRows, error: categoryError } = await supabase
    .from("product_categories")
    .select("id,name,description,applies_to_kinds");

  if (categoryError) {
    redirect(buildReturnUrl(returnQs, returnView, "error", categoryError.message));
  }

  const rows = (categoryRows ?? []) as Array<{
    id: string;
    name: string | null;
    description: string | null;
    applies_to_kinds?: string[] | null;
  }>;

  let updatedCount = 0;
  for (const row of rows) {
    if (asText(row.description)) continue;

    const kinds = parseCategoryKinds(row.applies_to_kinds);
    if (isSalesOnlyCategoryKinds(kinds)) continue;

    const suggestedDescription = buildCategorySuggestedDescription({
      name: asText(row.name) || "esta categoria",
      kinds,
    });
    if (!suggestedDescription) continue;

    const { error } = await supabase
      .from("product_categories")
      .update({
        description: suggestedDescription,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      redirect(buildReturnUrl(returnQs, returnView, "error", error.message));
    }
    updatedCount += 1;
  }

  revalidatePath("/inventory/settings/categories");
  redirect(
    buildReturnUrl(
      returnQs,
      returnView,
      "ok",
      updatedCount > 0 ? "descriptions_autofilled" : "descriptions_up_to_date"
    )
  );
}

async function toggleCategoryActiveAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const returnEditId = asText(formData.get("_return_edit_id"));
  const categoryId = asText(formData.get("category_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "1";

  if (!categoryId) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", "Categoria invalida.", {
        editId: returnEditId,
      })
    );
  }

  const { error } = await supabase
    .from("product_categories")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", error.message, {
        editId: returnEditId,
      })
    );
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(
    buildReturnUrl(returnQs, returnView, "ok", "category_status_updated", {
      editId: returnEditId,
    })
  );
}

async function deleteCategoryAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const returnEditId = asText(formData.get("_return_edit_id"));
  const categoryId = asText(formData.get("category_id"));

  if (!categoryId) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", "Categoria invalida.", {
        editId: returnEditId,
      })
    );
  }

  const { count: childCount } = await supabase
    .from("product_categories")
    .select("id", { head: true, count: "exact" })
    .eq("parent_id", categoryId);

  if ((childCount ?? 0) > 0) {
    redirect(
      buildReturnUrl(
        returnQs,
        returnView,
        "error",
        "No se puede eliminar una categoria con subcategorias. Deshabilitala o mueve las hijas.",
        { editId: returnEditId }
      )
    );
  }

  const { count: linkedProductsCount } = await supabase
    .from("products")
    .select("id", { head: true, count: "exact" })
    .eq("category_id", categoryId);

  if ((linkedProductsCount ?? 0) > 0) {
    redirect(
      buildReturnUrl(
        returnQs,
        returnView,
        "error",
        "No se puede eliminar una categoria con productos vinculados. Primero reasignalos o deshabilita.",
        { editId: returnEditId }
      )
    );
  }

  const { error } = await supabase.from("product_categories").delete().eq("id", categoryId);
  if (error) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", error.message, {
        editId: returnEditId,
      })
    );
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildReturnUrl(returnQs, returnView, "ok", "category_deleted"));
}

export default async function InventoryCategorySettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const view = normalizeView(sp.view ?? "explorar");

  const okMsg = sp.ok
    ? sp.ok === "category_created"
      ? "Categoria creada."
      : sp.ok === "category_updated"
        ? "Categoria actualizada."
        : sp.ok === "category_status_updated"
          ? "Estado de categoria actualizado."
          : sp.ok === "category_deleted"
            ? "Categoria eliminada."
          : sp.ok === "draft_saved"
            ? "Borrador guardado."
          : sp.ok === "descriptions_autofilled"
            ? "Descripciones faltantes completadas."
          : sp.ok === "descriptions_up_to_date"
            ? "No habia descripciones pendientes por completar."
          : "Cambios guardados."
    : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/categories",
    permissionCode: "inventory.stock",
  });

  const [
    { data: employee },
    { data: settings },
    { data: sitesData },
    allCategoryRows,
    productAuditRows,
  ] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    loadCategoryRows(supabase),
    loadProductAuditRows(supabase),
  ]);

  const role = asText(employee?.role ?? null).toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);
  const sites = (sitesData ?? []) as SiteRow[];
  const siteNamesById = Object.fromEntries(sites.map((site) => [site.id, site.name ?? site.id]));
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));

  const categoryKind = normalizeCategoryKind(sp.category_kind ?? "");
  const requestedCategorySiteId = asText(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  );
  const categoryScope = normalizeCategoryScope(
    sp.category_scope ?? (requestedCategorySiteId ? "site" : "all")
  );
  const categorySiteId = categoryScope === "site" ? requestedCategorySiteId : "";
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain ?? "")
    : "";
  const selectedCategoryId = asText(sp.category_id ?? "");

  const baseFilteredRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
    includeInactive: true,
  });

  const effectiveSelectedCategoryId =
    selectedCategoryId && baseFilteredRows.some((row) => row.id === selectedCategoryId)
      ? selectedCategoryId
      : "";

  let visibleRows = baseFilteredRows;
  if (effectiveSelectedCategoryId) {
    const subtreeIds = collectDescendantIds(categoryMap, effectiveSelectedCategoryId);
    visibleRows = visibleRows.filter(
      (row) => subtreeIds.has(row.id) || row.id === effectiveSelectedCategoryId
    );
  }

  visibleRows = [...visibleRows].sort((a, b) =>
    getCategoryPath(a.id, categoryMap).localeCompare(getCategoryPath(b.id, categoryMap), "es")
  );

  const usageCountByCategory = new Map<string, number>();
  const inconsistentAssignments: InconsistentAssignment[] = [];

  for (const product of productAuditRows) {
    const linkedCategoryId = asText(product.category_id ?? "");
    if (!linkedCategoryId) continue;

    usageCountByCategory.set(linkedCategoryId, (usageCountByCategory.get(linkedCategoryId) ?? 0) + 1);
    const category = categoryMap.get(linkedCategoryId);
    if (!category) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        category_id: linkedCategoryId,
        reason: "Categoria inexistente",
        category_path: linkedCategoryId,
      });
      continue;
    }

    const productKind = categoryKindFromProduct({
      productType: product.product_type ?? "",
      inventoryKind: extractInventoryKind(product),
    });

    if (!categorySupportsKind(category, productKind)) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        category_id: category.id,
        reason: `Categoria no aplica al uso ${CATEGORY_KIND_LABELS[productKind]}`,
        category_path: getCategoryPath(category.id, categoryMap),
      });
    }

    if (productKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        category_id: category.id,
        reason: "Canal definido en categoria que no es de Venta",
        category_path: getCategoryPath(category.id, categoryMap),
      });
    }
  }

  const uncategorizedProductsCount = productAuditRows.filter(
    (product) => !asText(product.category_id ?? "")
  ).length;

  const categoriesWithoutUsage = allCategoryRows.filter(
    (row) => (usageCountByCategory.get(row.id) ?? 0) === 0
  );
  const orphanCategories = allCategoryRows.filter(
    (row) => Boolean(row.parent_id) && !categoryMap.has(String(row.parent_id))
  );

  const topImpactRows = [...allCategoryRows]
    .map((row) => ({
      row,
      count: usageCountByCategory.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const domainOptions = getCategoryDomainOptions([
    ...Object.keys(CATEGORY_DOMAIN_LABELS),
    ...allCategoryRows.map((row) => row.domain ?? ""),
  ]);

  const filterParams = new URLSearchParams();
  if (categoryKind) filterParams.set("category_kind", categoryKind);
  if (categoryScope) filterParams.set("category_scope", categoryScope);
  if (categoryScope === "site" && categorySiteId) filterParams.set("category_site_id", categorySiteId);
  if (categoryDomain) filterParams.set("category_domain", categoryDomain);
  if (effectiveSelectedCategoryId) filterParams.set("category_id", effectiveSelectedCategoryId);

  const buildViewHref = (nextView: CategorySettingsView, editId?: string) => {
    const params = new URLSearchParams(filterParams);
    params.set("view", nextView);
    if (editId) params.set("edit_id", editId);
    if (nextView === "ficha" && asText(sp.step ?? "")) {
      params.set("step", asText(sp.step ?? ""));
    } else {
      params.delete("step");
    }
    return buildPageUrl(params);
  };

  const filterReturnQs = filterParams.toString();
  const clearHref = buildPageUrl(new URLSearchParams([["view", "explorar"]]));

  const editId = asText(sp.edit_id ?? "");
  const requestedStepId = asText(sp.step ?? "");
  const editingCategory = allCategoryRows.find((row) => row.id === editId) ?? null;
  const draftSiteId = (editingCategory?.site_id ?? categorySiteId) || null;
  const categoryDraft = canManage
    ? await loadDraft({
        supabase: supabase as unknown as SupabaseLike,
        userId: user.id,
        formKey: CATEGORY_SETTINGS_DRAFT_KEY,
        entityId: editId || "",
        siteId: draftSiteId,
      })
    : null;
  const draftPayload = (categoryDraft?.payload_json ?? {}) as Record<string, unknown>;
  const draftName = asText(draftPayload.name as string | null | undefined);
  const draftSlug = asText(draftPayload.slug as string | null | undefined);
  const draftParentId = asText(draftPayload.parent_id as string | null | undefined);
  const draftDescription = asText(draftPayload.description as string | null | undefined);
  const draftDomainValue = normalizeCategoryDomain(
    asText(draftPayload.domain as string | null | undefined)
  );
  const draftKinds = parseCategoryKinds(
    Array.isArray(draftPayload.applies_to_kinds)
      ? draftPayload.applies_to_kinds.map((value) => String(value))
      : []
  );
  const draftIsActiveRaw = draftPayload.is_active;
  const draftIsActive =
    typeof draftIsActiveRaw === "boolean" ? draftIsActiveRaw : editingCategory?.is_active !== false;
  const draftStepId = asText(categoryDraft?.step_id ?? "");
  const editKindValues: CategoryKind[] = editingCategory
    ? parseCategoryKinds(editingCategory.applies_to_kinds)
    : categoryKind
      ? [categoryKind]
      : ["insumo"];
  const effectiveKinds = draftKinds.length > 0 ? draftKinds : editKindValues;
  const editDomainValue = editingCategory
    ? normalizeCategoryDomain(editingCategory.domain)
    : shouldShowCategoryDomain(categoryKind)
      ? categoryDomain
      : "";
  const effectiveDomainValue = draftDomainValue || editDomainValue;
  const editDescription = editingCategory
    ? resolveCategoryDescription({
        description: editingCategory.description,
        name: editingCategory.name,
        kinds: effectiveKinds,
      })
    : "";
  const effectiveDescription = draftDescription || editDescription;

  const blockedParentIds = editingCategory
    ? collectDescendantIds(categoryMap, editingCategory.id)
    : new Set<string>();
  const parentOptions = allCategoryRows
    .filter((row) => !blockedParentIds.has(row.id))
    .sort((a, b) =>
      getCategoryPath(a.id, categoryMap).localeCompare(getCategoryPath(b.id, categoryMap), "es")
    );
  const parentFormOptions = parentOptions.map((row) => ({
    id: row.id,
    name: row.name,
    path: getCategoryPath(row.id, categoryMap),
    isRoot: !row.parent_id,
  }));
  const channelOptions = domainOptions.filter((option) => option.value);

  const currentCategoryUsage = editingCategory ? usageCountByCategory.get(editingCategory.id) ?? 0 : 0;
  const currentCategoryIssues = editingCategory
    ? inconsistentAssignments.filter((item) => item.category_id === editingCategory.id)
    : [];
  const noProductsLoaded = productAuditRows.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Categorías"
        subtitle="Flujo guiado para explorar, editar ficha y revisar salud del catálogo."
        actions={
          <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
            Volver a catálogo
          </Link>
        }
      />

      <div className="ui-panel-soft p-2">
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildViewHref("explorar")}
            className={view === "explorar" ? "ui-btn ui-btn--brand ui-btn--sm" : "ui-btn ui-btn--ghost ui-btn--sm"}
          >
            1. Explorar
          </Link>
          <Link
            href={buildViewHref("ficha", editId || undefined)}
            className={view === "ficha" ? "ui-btn ui-btn--brand ui-btn--sm" : "ui-btn ui-btn--ghost ui-btn--sm"}
          >
            2. Ficha
          </Link>
          <Link
            href={buildViewHref("salud")}
            className={view === "salud" ? "ui-btn ui-btn--brand ui-btn--sm" : "ui-btn ui-btn--ghost ui-btn--sm"}
          >
            3. Salud
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {view === "explorar" ? (
        <>
          <section className="ui-panel space-y-4">
            <div className="ui-h3">Que quieres hacer?</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href={buildViewHref("ficha")} className="ui-panel-soft p-4 hover:bg-[var(--ui-surface)] transition-colors">
                <div className="font-semibold">Crear categoria</div>
                <div className="ui-caption mt-1">Abre una ficha vacia para crear.</div>
              </Link>
              <div className="ui-panel-soft p-4">
                <div className="font-semibold">Editar categoria</div>
                <div className="ui-caption mt-1">Usa la tabla para abrir la ficha de una categoria existente.</div>
              </div>
              <Link href={buildViewHref("salud")} className="ui-panel-soft p-4 hover:bg-[var(--ui-surface)] transition-colors">
                <div className="font-semibold">Ver salud</div>
                <div className="ui-caption mt-1">Revisa calidad y consistencia del catálogo.</div>
              </Link>
            </div>
          </section>

          <section className="ui-panel space-y-4">
            <div className="ui-h3">Filtros</div>
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="view" value="explorar" />

              <label className="flex flex-col gap-1">
                <span className="ui-label">Uso</span>
                <select name="category_kind" defaultValue={categoryKind ?? ""} className="ui-input">
                  <option value="">Todos</option>
                  {CATEGORY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{CATEGORY_KIND_LABELS[kind]}</option>
                  ))}
                </select>
                <span className="ui-caption">Filtra por donde se usa la categoria.</span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Alcance</span>
                <select name="category_scope" defaultValue={categoryScope} className="ui-input">
                  <option value="all">Todas</option>
                  <option value="global">Globales</option>
                  <option value="site">Sede activa</option>
                </select>
                <span className="ui-caption">Global se comparte entre sedes.</span>
              </label>

              {categoryScope === "site" ? (
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Sede</span>
                  <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                    <option value="">Seleccionar sede</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>{site.name ?? site.id}</option>
                    ))}
                  </select>
                  <span className="ui-caption">Solo aplica cuando el alcance es Sede activa.</span>
                </label>
              ) : (
                <input type="hidden" name="category_site_id" value="" />
              )}

              {shouldShowCategoryDomain(categoryKind) ? (
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Canal</span>
                  <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                    <option value="">Todos</option>
                    {domainOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className="ui-caption">Canal solo aplica para uso Venta.</span>
                </label>
              ) : (
                <input type="hidden" name="category_domain" value="" />
              )}

              <CategoryTreeFilter
                categories={baseFilteredRows}
                selectedCategoryId={effectiveSelectedCategoryId}
                siteNamesById={siteNamesById}
                className="sm:col-span-2 lg:col-span-4"
                label="Categorías"
                emptyOptionLabel="Todas"
                maxVisibleOptions={8}
                showMeta={false}
                searchPlaceholder="Buscar categoria por nombre o ruta"
              />

              <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                <button type="submit" className="ui-btn ui-btn--brand">Aplicar</button>
                <Link href={clearHref} className="ui-btn ui-btn--ghost">Limpiar</Link>
                {canManage ? (
                  <form action={autofillCategoryDescriptionsAction}>
                    <input type="hidden" name="_return_qs" value={filterReturnQs} />
                    <input type="hidden" name="_return_view" value="explorar" />
                    <button type="submit" className="ui-btn ui-btn--ghost">
                      Completar descripciones faltantes
                    </button>
                  </form>
                ) : null}
              </div>
            </form>
          </section>

          <section className="ui-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="ui-h3">Categorías</div>
                <div className="ui-body-muted mt-1">{visibleRows.length} categoria(s) visibles.</div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="ui-table min-w-full text-sm">
                <thead className="text-left text-[var(--ui-muted)]">
                  <tr>
                    <th className="py-2 pr-4">Categoria</th>
                    <th className="py-2 pr-4">Uso</th>
                    <th className="py-2 pr-4">Alcance</th>
                    <th className="py-2 pr-4">Canal</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4 w-[340px]">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const kinds = parseCategoryKinds(row.applies_to_kinds);
                    const resolvedDescription = resolveCategoryDescription({
                      description: row.description,
                      name: row.name,
                      kinds,
                    });
                    return (
                      <tr key={row.id} className="border-t border-zinc-200/60">
                        <td className="py-3 pr-4">
                          <div className="group relative inline-flex max-w-[680px] items-start gap-2">
                            <span>{getCategoryPath(row.id, categoryMap)}</span>
                            {resolvedDescription ? (
                              <span
                                tabIndex={0}
                                className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ui-border)] text-[10px] font-semibold text-[var(--ui-muted)]"
                                aria-label="Ver descripcion de la categoria"
                              >
                                i
                              </span>
                            ) : null}
                            {resolvedDescription ? (
                              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[360px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-xs text-[var(--ui-text)] shadow-lg group-hover:block group-focus-within:block">
                                <div className="font-semibold">Descripcion sugerida</div>
                                <div className="mt-1 leading-relaxed">{resolvedDescription}</div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{kinds.map((k) => CATEGORY_KIND_LABELS[k]).join(", ") || "Sin definir"}</td>
                        <td className="py-3 pr-4">{row.site_id ? `Sede: ${siteNamesById[row.site_id] ?? row.site_id}` : "Global"}</td>
                        <td className="py-3 pr-4">{getCategoryChannelLabel(row.domain) || "-"}</td>
                        <td className="py-3 pr-4">{row.is_active === false ? "Inactiva" : "Activa"}</td>
                        <td className="py-3 pr-4 align-top">
                          <div className="flex flex-nowrap items-center gap-2">
                            <Link href={buildViewHref("ficha", row.id)} className={TABLE_ACTION_BUTTON_CLASS}>
                              Ficha
                            </Link>
                            {canManage ? (
                              <form action={toggleCategoryActiveAction}>
                                <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                <input type="hidden" name="_return_view" value="explorar" />
                                <input type="hidden" name="_return_edit_id" value={row.id} />
                                <input type="hidden" name="category_id" value={row.id} />
                                <input
                                  type="hidden"
                                  name="next_is_active"
                                  value={row.is_active === false ? "1" : "0"}
                                />
                                <button type="submit" className={TABLE_ACTION_BUTTON_CLASS}>
                                  {row.is_active === false ? "Habilitar" : "Deshabilitar"}
                                </button>
                              </form>
                            ) : null}
                            {canManage ? (
                              <form action={deleteCategoryAction}>
                                <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                <input type="hidden" name="_return_view" value="explorar" />
                                <input type="hidden" name="_return_edit_id" value={row.id} />
                                <input type="hidden" name="category_id" value={row.id} />
                                <button type="submit" className={TABLE_DELETE_BUTTON_CLASS}>
                                  Eliminar
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length ? (
                    <tr>
                      <td className="py-4 text-[var(--ui-muted)]" colSpan={6}>
                        No hay categorías para este filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {view === "ficha" ? (
        <>
          <section className="ui-panel space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="ui-caption">Ficha de categoria</div>
                <div className="ui-h3 mt-1">{editingCategory ? editingCategory.name : "Nueva categoria"}</div>
                <div className="ui-body-muted mt-1">
                  {editingCategory ? getCategoryPath(editingCategory.id, categoryMap) : "Completa los campos para crear una categoria."}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={buildViewHref("explorar")} className="ui-btn ui-btn--ghost ui-btn--sm">Volver a explorar</Link>
                <Link href={buildViewHref("salud")} className="ui-btn ui-btn--ghost ui-btn--sm">Ver salud</Link>
              </div>
            </div>

            {editingCategory ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="ui-panel-soft p-3">
                  <div className="ui-caption">Estado</div>
                  <div className="font-semibold mt-1">{editingCategory.is_active === false ? "Inactiva" : "Activa"}</div>
                </div>
                <div className="ui-panel-soft p-3">
                  <div className="ui-caption">Productos vinculados</div>
                  <div className="font-semibold mt-1">{currentCategoryUsage}</div>
                </div>
                <div className="ui-panel-soft p-3">
                  <div className="ui-caption">Advertencias</div>
                  <div className="font-semibold mt-1">{currentCategoryIssues.length}</div>
                </div>
              </div>
            ) : null}

            {!canManage ? (
              <div className="ui-alert ui-alert--warn">
                Solo propietarios y gerentes generales pueden editar categorías.
              </div>
            ) : null}

            {canManage ? (
              <div className="space-y-3">
                <CategorySettingsForm
                  action={saveCategoryAction}
                  saveDraftAction={saveCategoryDraftAction}
                  returnQs={filterReturnQs}
                  editingCategoryId={editingCategory?.id ?? ""}
                  defaultName={draftName || (editingCategory?.name ?? "")}
                  defaultSlug={draftSlug || (editingCategory ? slugify(editingCategory.name) : "")}
                  defaultParentId={draftParentId || (editingCategory?.parent_id ?? "")}
                  defaultDescription={effectiveDescription}
                  defaultKinds={effectiveKinds}
                  defaultSiteId={asText((draftPayload.site_id as string | null | undefined) ?? editingCategory?.site_id ?? "")}
                  defaultDomain={effectiveDomainValue}
                  defaultIsActive={draftIsActive}
                  sites={sites}
                  parentOptions={parentFormOptions}
                  channelOptions={channelOptions}
                  initialStepId={requestedStepId || draftStepId}
                />

                {editingCategory ? (
                  <form action={toggleCategoryActiveAction} className="flex">
                    <input type="hidden" name="_return_qs" value={filterReturnQs} />
                    <input type="hidden" name="_return_view" value="ficha" />
                    <input type="hidden" name="_return_edit_id" value={editingCategory.id} />
                    <input type="hidden" name="category_id" value={editingCategory.id} />
                    <input
                      type="hidden"
                      name="next_is_active"
                      value={editingCategory.is_active === false ? "1" : "0"}
                    />
                    <button type="submit" className="ui-btn ui-btn--ghost">
                      {editingCategory.is_active === false ? "Activar" : "Desactivar"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}

            {editingCategory && currentCategoryIssues.length > 0 ? (
              <div className="ui-alert ui-alert--warn">
                Esta categoria tiene {currentCategoryIssues.length} advertencia(s). Revisa la pestana de Salud.
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {view === "salud" ? (
        <>
          <section className="ui-panel space-y-4">
            <div className="ui-h3">Salud del catálogo</div>
            {noProductsLoaded ? (
              <div className="ui-alert ui-alert--warn">
                Aun no hay productos creados. Estos indicadores son referenciales hasta cargar productos.
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Productos sin categoria</div>
                <div className="mt-1 text-2xl font-semibold">{uncategorizedProductsCount}</div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Categorías sin uso</div>
                <div className="mt-1 text-2xl font-semibold">{categoriesWithoutUsage.length}</div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Categorías huérfanas</div>
                <div className="mt-1 text-2xl font-semibold">{orphanCategories.length}</div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Inconsistencias</div>
                <div className="mt-1 text-2xl font-semibold">{inconsistentAssignments.length}</div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="ui-panel">
              <div className="ui-h3">Impacto por categoria</div>
              <div className="mt-4 overflow-x-auto">
                <table className="ui-table min-w-full text-sm">
                  <thead className="text-left text-[var(--ui-muted)]">
                    <tr>
                      <th className="py-2 pr-4">Categoria</th>
                      <th className="py-2 pr-4">Productos</th>
                      <th className="py-2 pr-4 w-[340px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topImpactRows.map(({ row, count }) => {
                      const rowKinds = parseCategoryKinds(row.applies_to_kinds);
                      const rowDescription = resolveCategoryDescription({
                        description: row.description,
                        name: row.name,
                        kinds: rowKinds,
                      });

                      return (
                        <tr key={row.id} className="border-t border-zinc-200/60">
                          <td className="py-3 pr-4">
                            <div className="group relative inline-flex max-w-[520px] items-start gap-2">
                              <span>{getCategoryPath(row.id, categoryMap)}</span>
                              {rowDescription ? (
                                <span
                                  tabIndex={0}
                                  className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ui-border)] text-[10px] font-semibold text-[var(--ui-muted)]"
                                  aria-label="Ver descripcion de la categoria"
                                >
                                  i
                                </span>
                              ) : null}
                              {rowDescription ? (
                                <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[360px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-xs text-[var(--ui-text)] shadow-lg group-hover:block group-focus-within:block">
                                  <div className="font-semibold">Descripcion sugerida</div>
                                  <div className="mt-1 leading-relaxed">{rowDescription}</div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-mono">{count}</td>
                          <td className="py-3 pr-4 align-top">
                            <div className="flex flex-nowrap items-center gap-2">
                              <Link href={buildViewHref("ficha", row.id)} className={TABLE_ACTION_BUTTON_CLASS}>
                                Ficha
                              </Link>
                              {canManage ? (
                                <form action={toggleCategoryActiveAction}>
                                  <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                  <input type="hidden" name="_return_view" value="salud" />
                                  <input type="hidden" name="_return_edit_id" value={row.id} />
                                  <input type="hidden" name="category_id" value={row.id} />
                                  <input
                                    type="hidden"
                                    name="next_is_active"
                                    value={row.is_active === false ? "1" : "0"}
                                  />
                                  <button type="submit" className={TABLE_ACTION_BUTTON_CLASS}>
                                    {row.is_active === false ? "Habilitar" : "Deshabilitar"}
                                  </button>
                                </form>
                              ) : null}
                              {canManage ? (
                                <form action={deleteCategoryAction}>
                                  <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                  <input type="hidden" name="_return_view" value="salud" />
                                  <input type="hidden" name="_return_edit_id" value={row.id} />
                                  <input type="hidden" name="category_id" value={row.id} />
                                  <button type="submit" className={TABLE_DELETE_BUTTON_CLASS}>
                                    Eliminar
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!topImpactRows.length ? (
                      <tr>
                        <td className="py-4 text-[var(--ui-muted)]" colSpan={3}>
                          No hay datos de impacto.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ui-panel">
              <div className="ui-h3">Inconsistencias</div>
              <div className="mt-4 overflow-x-auto">
                <table className="ui-table min-w-full text-sm">
                  <thead className="text-left text-[var(--ui-muted)]">
                    <tr>
                      <th className="py-2 pr-4">Producto</th>
                      <th className="py-2 pr-4">Detalle</th>
                      <th className="py-2 pr-4">Categoria</th>
                      <th className="py-2 pr-4 w-[340px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistentAssignments.slice(0, 50).map((item) => {
                      const linkedCategory = categoryMap.get(item.category_id) ?? null;
                      const linkedKinds = linkedCategory
                        ? parseCategoryKinds(linkedCategory.applies_to_kinds)
                        : [];
                      const linkedDescription = linkedCategory
                        ? resolveCategoryDescription({
                            description: linkedCategory.description,
                            name: linkedCategory.name,
                            kinds: linkedKinds,
                          })
                        : "";

                      return (
                        <tr key={`${item.product_id}-${item.reason}`} className="border-t border-zinc-200/60">
                          <td className="py-3 pr-4">{item.product_name}</td>
                          <td className="py-3 pr-4">{item.reason}</td>
                          <td className="py-3 pr-4">
                            <div className="group relative inline-flex max-w-[440px] items-start gap-2">
                              <span>{item.category_path}</span>
                              {linkedDescription ? (
                                <span
                                  tabIndex={0}
                                  className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ui-border)] text-[10px] font-semibold text-[var(--ui-muted)]"
                                  aria-label="Ver descripcion de la categoria"
                                >
                                  i
                                </span>
                              ) : null}
                              {linkedDescription ? (
                                <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[360px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-xs text-[var(--ui-text)] shadow-lg group-hover:block group-focus-within:block">
                                  <div className="font-semibold">Descripcion sugerida</div>
                                  <div className="mt-1 leading-relaxed">{linkedDescription}</div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <div className="flex flex-nowrap items-center gap-2">
                              <Link href={buildViewHref("ficha", item.category_id)} className={TABLE_ACTION_BUTTON_CLASS}>
                                Ficha
                              </Link>
                              {canManage && categoryMap.has(item.category_id) ? (
                                <form action={toggleCategoryActiveAction}>
                                  <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                  <input type="hidden" name="_return_view" value="salud" />
                                  <input type="hidden" name="_return_edit_id" value={item.category_id} />
                                  <input type="hidden" name="category_id" value={item.category_id} />
                                  <input
                                    type="hidden"
                                    name="next_is_active"
                                    value={categoryMap.get(item.category_id)?.is_active === false ? "1" : "0"}
                                  />
                                  <button type="submit" className={TABLE_ACTION_BUTTON_CLASS}>
                                    {categoryMap.get(item.category_id)?.is_active === false ? "Habilitar" : "Deshabilitar"}
                                  </button>
                                </form>
                              ) : null}
                              {canManage && categoryMap.has(item.category_id) ? (
                                <form action={deleteCategoryAction}>
                                  <input type="hidden" name="_return_qs" value={filterReturnQs} />
                                  <input type="hidden" name="_return_view" value="salud" />
                                  <input type="hidden" name="_return_edit_id" value={item.category_id} />
                                  <input type="hidden" name="category_id" value={item.category_id} />
                                  <button type="submit" className={TABLE_DELETE_BUTTON_CLASS}>
                                    Eliminar
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!inconsistentAssignments.length ? (
                      <tr>
                        <td className="py-4 text-[var(--ui-muted)]" colSpan={4}>
                          No hay inconsistencias detectadas.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
