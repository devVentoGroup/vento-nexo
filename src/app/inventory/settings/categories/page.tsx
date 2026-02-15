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
  categoryKindFromProduct,
  categorySupportsKind,
  collectDescendantIds,
  filterCategoryRows,
  getCategoryChannelLabel,
  getCategoryPath,
  normalizeCategoryDomain,
  normalizeCategoryKind,
  normalizeCategoryScope,
  parseCategoryKinds,
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
  q?: string;
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

function toSearchValue(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as CategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
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
        encodeURIComponent("Solo propietarios y gerentes generales pueden gestionar categorias.")
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
  const requestedDomain = normalizeCategoryDomain(asText(formData.get("domain")));

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
          : sp.ok === "draft_saved"
            ? "Borrador guardado."
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
  const categorySiteId = asText(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  );
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? (categorySiteId ? "site" : "all"));
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain ?? "")
    : "";
  const selectedCategoryId = asText(sp.category_id ?? "");
  const query = asText(sp.q ?? "");

  const baseFilteredRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
    includeInactive: true,
  });

  let visibleRows = baseFilteredRows;
  if (selectedCategoryId) {
    const subtreeIds = collectDescendantIds(categoryMap, selectedCategoryId);
    visibleRows = visibleRows.filter((row) => subtreeIds.has(row.id) || row.id === selectedCategoryId);
  }

  if (query) {
    const normalizedQuery = toSearchValue(query);
    visibleRows = visibleRows.filter((row) => {
      const path = getCategoryPath(row.id, categoryMap);
      const scopeLabel = row.site_id ? siteNamesById[row.site_id] ?? row.site_id : "global";
      const channelLabel = getCategoryChannelLabel(row.domain);
      const searchText = `${row.name} ${path} ${scopeLabel} ${channelLabel}`;
      return toSearchValue(searchText).includes(normalizedQuery);
    });
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
  if (query) filterParams.set("q", query);
  if (categoryKind) filterParams.set("category_kind", categoryKind);
  if (categoryScope) filterParams.set("category_scope", categoryScope);
  if (categorySiteId) filterParams.set("category_site_id", categorySiteId);
  if (categoryDomain) filterParams.set("category_domain", categoryDomain);
  if (selectedCategoryId) filterParams.set("category_id", selectedCategoryId);

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
        title="Categorias"
        subtitle="Flujo guiado para explorar, editar ficha y revisar salud del catalogo."
        actions={
          <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
            Volver a catalogo
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
                <div className="ui-caption mt-1">Revisa calidad y consistencia del catalogo.</div>
              </Link>
            </div>
          </section>

          <section className="ui-panel space-y-4">
            <div className="ui-h3">Filtros</div>
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="view" value="explorar" />

              <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
                <span className="ui-label">Buscar categoria</span>
                <input
                  name="q"
                  defaultValue={query}
                  className="ui-input"
                  placeholder="Nombre o ruta"
                />
              </label>

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

              <label className="flex flex-col gap-1">
                <span className="ui-label">Sede</span>
                <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                  <option value="">Seleccionar sede</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name ?? site.id}</option>
                  ))}
                </select>
              </label>

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
                selectedCategoryId={selectedCategoryId}
                siteNamesById={siteNamesById}
                className="sm:col-span-2 lg:col-span-4"
                label="Categorias"
                emptyOptionLabel="Todas"
                maxVisibleOptions={8}
                showMeta={false}
                searchPlaceholder="Busca categoria por nombre o ruta"
              />

              <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                <button type="submit" className="ui-btn ui-btn--brand">Aplicar</button>
                <Link href={clearHref} className="ui-btn ui-btn--ghost">Limpiar</Link>
              </div>
            </form>
          </section>

          <section className="ui-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="ui-h3">Categorias</div>
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
                    <th className="py-2 pr-4">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const kinds = parseCategoryKinds(row.applies_to_kinds);
                    return (
                      <tr key={row.id} className="border-t border-zinc-200/60">
                        <td className="py-3 pr-4">{getCategoryPath(row.id, categoryMap)}</td>
                        <td className="py-3 pr-4">{kinds.map((k) => CATEGORY_KIND_LABELS[k]).join(", ") || "Sin definir"}</td>
                        <td className="py-3 pr-4">{row.site_id ? `Sede: ${siteNamesById[row.site_id] ?? row.site_id}` : "Global"}</td>
                        <td className="py-3 pr-4">{getCategoryChannelLabel(row.domain) || "-"}</td>
                        <td className="py-3 pr-4">{row.is_active === false ? "Inactiva" : "Activa"}</td>
                        <td className="py-3 pr-4">
                          <Link href={buildViewHref("ficha", row.id)} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Abrir ficha
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length ? (
                    <tr>
                      <td className="py-4 text-[var(--ui-muted)]" colSpan={6}>
                        No hay categorias para este filtro.
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
                Solo propietarios y gerentes generales pueden editar categorias.
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
            <div className="ui-h3">Salud del catalogo</div>
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
                <div className="ui-caption">Categorias sin uso</div>
                <div className="mt-1 text-2xl font-semibold">{categoriesWithoutUsage.length}</div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Categorias huerfanas</div>
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
                      <th className="py-2 pr-4">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topImpactRows.map(({ row, count }) => (
                      <tr key={row.id} className="border-t border-zinc-200/60">
                        <td className="py-3 pr-4">{getCategoryPath(row.id, categoryMap)}</td>
                        <td className="py-3 pr-4 font-mono">{count}</td>
                        <td className="py-3 pr-4">
                          <Link href={buildViewHref("ficha", row.id)} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Abrir ficha
                          </Link>
                        </td>
                      </tr>
                    ))}
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
                      <th className="py-2 pr-4">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistentAssignments.slice(0, 50).map((item) => (
                      <tr key={`${item.product_id}-${item.reason}`} className="border-t border-zinc-200/60">
                        <td className="py-3 pr-4">{item.product_name}</td>
                        <td className="py-3 pr-4">{item.reason}</td>
                        <td className="py-3 pr-4">{item.category_path}</td>
                        <td className="py-3 pr-4">
                          <Link href={buildViewHref("ficha", item.category_id)} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Abrir ficha
                          </Link>
                        </td>
                      </tr>
                    ))}
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
