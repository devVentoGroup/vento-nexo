"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { buildShellLoginUrl } from "@/lib/auth/sso";
import { clearDraft, saveDraft, type SupabaseLike } from "@/lib/inventory/forms/drafts";
import { createClient } from "@/lib/supabase/server";
import {
  buildCategorySuggestedDescription,
  isSalesOnlyCategoryKinds,
  normalizeCategoryDomain,
  parseCategoryKinds,
} from "@/lib/inventory/categories";
import {
  CATEGORY_KIND_LABELS,
  CATEGORY_SETTINGS_DRAFT_KEY,
  asText,
  buildPageUrl,
  normalizeView,
  loadCategoryRows,
  loadProductAuditRows,
  parseKindsFromForm,
  slugify,
  type CategorySettingsView,
} from "./helpers";
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

export async function saveCategoryAction(formData: FormData) {
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
    redirect(buildReturnUrl(returnQs, returnView, "error", "El nombre de categoría es obligatorio.", { editId: id }));
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
    redirect(buildReturnUrl(returnQs, returnView, "error", error?.message ?? "No fue posible crear la categoría."));
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

export async function saveCategoryDraftAction(formData: FormData) {
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

export async function autofillCategoryDescriptionsAction(formData: FormData) {
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
      name: asText(row.name) || "esta categoría",
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

export async function toggleCategoryActiveAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const returnEditId = asText(formData.get("_return_edit_id"));
  const categoryId = asText(formData.get("category_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "1";

  if (!categoryId) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", "Categoría inválida.", {
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

export async function deleteCategoryAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const returnEditId = asText(formData.get("_return_edit_id"));
  const categoryId = asText(formData.get("category_id"));

  if (!categoryId) {
    redirect(
      buildReturnUrl(returnQs, returnView, "error", "Categoría inválida.", {
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
        "No se puede eliminar una categoría con subcategorias. Deshabilitala o mueve las hijas.",
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
        "No se puede eliminar una categoría con productos vinculados. Primero reasignalos o deshabilita.",
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

export async function linkCategoryToSiteAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const categoryId = asText(formData.get("category_id"));
  const siteId = asText(formData.get("site_id"));

  if (!categoryId || !siteId) {
    redirect(buildReturnUrl(returnQs, returnView, "error", "Categoría o sede invalida."));
  }

  const { error } = await supabase
    .from("product_categories")
    .update({
      site_id: siteId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) {
    redirect(buildReturnUrl(returnQs, returnView, "error", error.message));
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildReturnUrl(returnQs, returnView, "ok", "category_linked_site"));
}

export async function unlinkCategoryFromSiteAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const returnView = asText(formData.get("_return_view")) || "explorar";
  const categoryId = asText(formData.get("category_id"));

  if (!categoryId) {
    redirect(buildReturnUrl(returnQs, returnView, "error", "Categoría invalida."));
  }

  const { error } = await supabase
    .from("product_categories")
    .update({
      site_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) {
    redirect(buildReturnUrl(returnQs, returnView, "error", error.message));
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildReturnUrl(returnQs, returnView, "ok", "category_unlinked_site"));
}
