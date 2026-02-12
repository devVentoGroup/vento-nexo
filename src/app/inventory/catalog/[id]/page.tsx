import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";
import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
import { RecipeIngredientsEditor } from "@/features/inventory/catalog/recipe-ingredients-editor";
import { RecipeMetadataFields } from "@/features/inventory/catalog/recipe-metadata-fields";
import { RecipeStepsEditor } from "@/features/inventory/catalog/recipe-steps-editor";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type ProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  product_type: string | null;
  category_id: string | null;
  price: number | null;
  cost: number | null;
  is_active: boolean | null;
  image_url: string | null;
  catalog_image_url: string | null;
};

type InventoryProfileRow = {
  product_id: string;
  track_inventory: boolean;
  inventory_kind: string;
  default_unit: string | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type CategoryRow = { id: string; name: string; parent_id: string | null };

type SiteSettingRow = {
  id?: string;
  site_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  sites?: { id: string; name: string | null } | null;
};

type AreaKindRow = { code: string; name: string | null };
type SiteOptionRow = { id: string; name: string | null };

type SupplierRow = {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_price: number | null;
  currency: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  is_primary: boolean;
};

type SearchParams = { ok?: string; error?: string; from?: string };

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

type CatalogTab = "insumos" | "preparaciones" | "productos" | "equipos";

function sanitizeCatalogReturnPath(value: string): string {
  return value.startsWith("/inventory/catalog") ? value : "";
}

function decodeCatalogReturnParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return sanitizeCatalogReturnPath(decodeURIComponent(value));
  } catch {
    return "";
  }
}

function appendQueryParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function resolveCatalogTab(productTypeRaw: string, inventoryKindRaw: string): CatalogTab {
  const productType = productTypeRaw.trim().toLowerCase();
  const inventoryKind = inventoryKindRaw.trim().toLowerCase();
  if (inventoryKind === "asset") return "equipos";
  if (productType === "preparacion") return "preparaciones";
  if (productType === "venta") return "productos";
  return "insumos";
}

async function updateProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(`/inventory/catalog?error=${encodeURIComponent("No tienes permisos para editar productos.")}`);
  }

  const productId = asText(formData.get("product_id"));
  if (!productId) redirect("/inventory/catalog?error=" + encodeURIComponent("Producto inválido."));

  const returnTo = sanitizeCatalogReturnPath(asText(formData.get("return_to")));
  const detailBase = returnTo
    ? `/inventory/catalog/${productId}?from=${encodeURIComponent(returnTo)}`
    : `/inventory/catalog/${productId}`;
  const redirectWithError = (message: string) => {
    redirect(appendQueryParam(detailBase, "error", message));
  };

  const categoryId = asText(formData.get("category_id"));
  const payload: Record<string, unknown> = {
    name: asText(formData.get("name")),
    description: asText(formData.get("description")) || null,
    sku: asText(formData.get("sku")) || null,
    unit: asText(formData.get("unit")) || null,
    product_type: asText(formData.get("product_type")) || null,
    price: formData.get("price") ? Number(formData.get("price")) : null,
    cost: formData.get("cost") ? Number(formData.get("cost")) : null,
    is_active: Boolean(formData.get("is_active")),
    image_url: asText(formData.get("image_url")) || null,
    catalog_image_url: asText(formData.get("catalog_image_url")) || null,
  };
  if (categoryId) payload.category_id = categoryId;

  const { error: updateErr } = await supabase.from("products").update(payload).eq("id", productId);
  if (updateErr) redirectWithError(updateErr.message);

  const profilePayload = {
    product_id: productId,
    track_inventory: Boolean(formData.get("track_inventory")),
    inventory_kind: asText(formData.get("inventory_kind")) || "unclassified",
    default_unit: asText(formData.get("default_unit")) || null,
    lot_tracking: Boolean(formData.get("lot_tracking")),
    expiry_tracking: Boolean(formData.get("expiry_tracking")),
  };
  const { error: profileErr } = await supabase
    .from("product_inventory_profiles")
    .upsert(profilePayload, { onConflict: "product_id" });
  if (profileErr) redirectWithError(profileErr.message);

  const supplierLinesRaw = formData.get("supplier_lines");
  if (typeof supplierLinesRaw === "string" && supplierLinesRaw) {
    try {
      const lines = JSON.parse(supplierLinesRaw) as Array<{
        id?: string;
        supplier_id?: string;
        supplier_sku?: string;
        purchase_unit?: string;
        purchase_unit_size?: number;
        purchase_price?: number;
        currency?: string;
        lead_time_days?: number;
        min_order_qty?: number;
        is_primary?: boolean;
        _delete?: boolean;
      }>;
      await supabase.from("product_suppliers").delete().eq("product_id", productId);
      for (const line of lines) {
        if (line._delete || !line.supplier_id) continue;
        await supabase.from("product_suppliers").insert({
          product_id: productId,
          supplier_id: line.supplier_id,
          supplier_sku: line.supplier_sku || null,
          purchase_unit: line.purchase_unit || null,
          purchase_unit_size: line.purchase_unit_size ?? null,
          purchase_price: line.purchase_price ?? null,
          currency: line.currency || "COP",
          lead_time_days: line.lead_time_days ?? null,
          min_order_qty: line.min_order_qty ?? null,
          is_primary: Boolean(line.is_primary),
        });
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const siteSettingsRaw = formData.get("site_settings_lines");
  if (typeof siteSettingsRaw === "string" && siteSettingsRaw) {
    try {
      const siteLines = JSON.parse(siteSettingsRaw) as Array<{
        id?: string;
        site_id?: string;
        is_active?: boolean;
        default_area_kind?: string;
        _delete?: boolean;
      }>;
      const toDelete = siteLines.filter((l) => l.id && l._delete).map((l) => l.id as string);
      for (const id of toDelete) await supabase.from("product_site_settings").delete().eq("id", id);
      for (const line of siteLines) {
        if (line._delete || !line.site_id) continue;
        const row = {
          product_id: productId,
          site_id: line.site_id,
          is_active: Boolean(line.is_active),
          default_area_kind: line.default_area_kind || null,
        };
        if (line.id) {
          const { error: upErr } = await supabase.from("product_site_settings").update(row).eq("id", line.id);
          if (upErr) redirectWithError(upErr.message);
        } else {
          const { error: insErr } = await supabase.from("product_site_settings").insert(row);
          if (insErr) redirectWithError(insErr.message);
        }
      }
    } catch {
      // ignore
    }
  }

  // Recipe card upsert
  const ingredientRaw = formData.get("ingredient_lines");
  const stepsRaw = formData.get("recipe_steps");
  const hasRecipeData = typeof ingredientRaw === "string" && ingredientRaw;

  if (hasRecipeData) {
    const yieldQty = formData.get("yield_qty") ? Number(formData.get("yield_qty")) : 1;
    const yieldUnit = asText(formData.get("yield_unit")) || "un";

    const { data: existingCard } = await supabase
      .from("recipe_cards")
      .select("id")
      .eq("product_id", productId)
      .maybeSingle();

    let recipeCardId: string;
    if (existingCard) {
      recipeCardId = existingCard.id;
      await supabase.from("recipe_cards").update({
        yield_qty: yieldQty,
        yield_unit: yieldUnit,
        portion_size: formData.get("portion_size") ? Number(formData.get("portion_size")) : null,
        portion_unit: asText(formData.get("portion_unit")) || null,
        prep_time_minutes: formData.get("prep_time_minutes") ? Number(formData.get("prep_time_minutes")) : null,
        shelf_life_days: formData.get("shelf_life_days") ? Number(formData.get("shelf_life_days")) : null,
        difficulty: asText(formData.get("difficulty")) || null,
        recipe_description: asText(formData.get("recipe_description")) || null,
      }).eq("id", recipeCardId);
    } else {
      const { data: newCard } = await supabase.from("recipe_cards").insert({
        product_id: productId,
        yield_qty: yieldQty,
        yield_unit: yieldUnit,
        portion_size: formData.get("portion_size") ? Number(formData.get("portion_size")) : null,
        portion_unit: asText(formData.get("portion_unit")) || null,
        prep_time_minutes: formData.get("prep_time_minutes") ? Number(formData.get("prep_time_minutes")) : null,
        shelf_life_days: formData.get("shelf_life_days") ? Number(formData.get("shelf_life_days")) : null,
        difficulty: asText(formData.get("difficulty")) || null,
        recipe_description: asText(formData.get("recipe_description")) || null,
        status: "draft",
      }).select("id").single();
      recipeCardId = newCard?.id ?? "";
    }

    // Replace BOM lines
    try {
      const ingredientLines = JSON.parse(ingredientRaw as string) as Array<Record<string, unknown>>;
      await supabase.from("recipes").delete().eq("product_id", productId);
      for (const line of ingredientLines) {
        if ((line._delete as boolean) || !line.ingredient_product_id) continue;
        await supabase.from("recipes").insert({
          product_id: productId,
          ingredient_product_id: line.ingredient_product_id as string,
          quantity: (line.quantity as number) ?? 0,
          is_active: true,
        });
      }
    } catch { /* skip */ }

    // Replace steps
    if (recipeCardId && typeof stepsRaw === "string" && stepsRaw) {
      try {
        const stepLines = JSON.parse(stepsRaw) as Array<Record<string, unknown>>;
        await supabase.from("recipe_steps").delete().eq("recipe_card_id", recipeCardId);
        for (const step of stepLines) {
          if ((step._delete as boolean) || !step.description) continue;
          await supabase.from("recipe_steps").insert({
            recipe_card_id: recipeCardId,
            step_number: (step.step_number as number) ?? 1,
            description: step.description as string,
            tip: (step.tip as string) || null,
            time_minutes: (step.time_minutes as number) ?? null,
          });
        }
      } catch { /* skip */ }
    }
  }

  if (returnTo) {
    redirect(appendQueryParam(returnTo, "ok", "1"));
  }
  const fallbackTab = resolveCatalogTab(
    asText(formData.get("product_type")),
    asText(formData.get("inventory_kind"))
  );
  redirect(`/inventory/catalog?tab=${fallbackTab}&ok=1`);
}

export default async function ProductCatalogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? "Cambios guardados." : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const from = decodeCatalogReturnParam(sp.from);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}`,
    permissionCode: PERMISSION,
  });

  const { data: product } = await supabase
    .from("products")
    .select("id,name,description,sku,unit,product_type,category_id,price,cost,is_active,image_url,catalog_image_url")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const { data: profile } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,track_inventory,inventory_kind,default_unit,lot_tracking,expiry_tracking")
    .eq("product_id", id)
    .maybeSingle();

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id,name,parent_id")
    .order("name", { ascending: true });
  const categoryRows = (categories ?? []) as CategoryRow[];
  const categoryMap = new Map(categoryRows.map((r) => [r.id, r]));
  const categoryPath = (categoryId: string | null) => {
    if (!categoryId) return "Sin categoría";
    const parts: string[] = [];
    let current = categoryMap.get(categoryId);
    let safety = 0;
    while (current && safety < 6) {
      parts.unshift(current.name);
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
      safety += 1;
    }
    return parts.join(" / ");
  };

  const { data: siteSettings } = await supabase
    .from("product_site_settings")
    .select("id,site_id,is_active,default_area_kind,sites(id,name)")
    .eq("product_id", id);
  const siteRows = (siteSettings ?? []) as unknown as SiteSettingRow[];

  const { data: sitesData } = await supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true });
  const sitesList = (sitesData ?? []) as SiteOptionRow[];

  const { data: areaKindsData } = await supabase.from("area_kinds").select("code,name").order("name", { ascending: true });
  const areaKindsList = (areaKindsData ?? []) as AreaKindRow[];

  const { data: supplierLinks } = await supabase
    .from("product_suppliers")
    .select("id,supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_price,currency,lead_time_days,min_order_qty,is_primary")
    .eq("product_id", id)
    .order("is_primary", { ascending: false });
  const supplierRows = (supplierLinks ?? []) as SupplierRow[];

  const { data: suppliersData } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  // Recipe data (for preparacion and venta)
  const productType = (product as ProductRow).product_type;
  const hasRecipe = productType === "preparacion" || productType === "venta";

  type RecipeCardRow = {
    id: string;
    yield_qty: number | null;
    yield_unit: string | null;
    portion_size: number | null;
    portion_unit: string | null;
    prep_time_minutes: number | null;
    shelf_life_days: number | null;
    difficulty: string | null;
    recipe_description: string | null;
  };
  type RecipeBomRow = { id: string; ingredient_product_id: string; quantity: number };
  type RecipeStepRow = { id: string; step_number: number; description: string; tip: string | null; time_minutes: number | null };
  type IngredientProductRow = { id: string; name: string | null; sku: string | null; unit: string | null; cost: number | null };

  let recipeCard: RecipeCardRow | null = null;
  let recipeBomRows: RecipeBomRow[] = [];
  let recipeStepRows: RecipeStepRow[] = [];
  let ingredientProducts: IngredientProductRow[] = [];

  if (hasRecipe) {
    const { data: rc } = await supabase
      .from("recipe_cards")
      .select("id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description")
      .eq("product_id", id)
      .maybeSingle();
    recipeCard = rc as RecipeCardRow | null;

    const { data: bom } = await supabase
      .from("recipes")
      .select("id,ingredient_product_id,quantity")
      .eq("product_id", id)
      .eq("is_active", true);
    recipeBomRows = (bom ?? []) as RecipeBomRow[];

    if (recipeCard) {
      const { data: steps } = await supabase
        .from("recipe_steps")
        .select("id,step_number,description,tip,time_minutes")
        .eq("recipe_card_id", recipeCard.id)
        .order("step_number", { ascending: true });
      recipeStepRows = (steps ?? []) as RecipeStepRow[];
    }

    const { data: ingProds } = await supabase
      .from("products")
      .select("id,name,sku,unit,cost")
      .in("product_type", ["insumo", "preparacion"])
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000);
    ingredientProducts = (ingProds ?? []) as IngredientProductRow[];
  }

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  const canEdit = ["propietario", "gerente_general"].includes(role);

  const productRow = product as ProductRow;
  const profileRow = (profile ?? null) as InventoryProfileRow | null;

  const supplierInitialRows = supplierRows.map((r) => ({
    id: r.id,
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku ?? "",
    purchase_unit: r.purchase_unit ?? "",
    purchase_unit_size: r.purchase_unit_size ?? undefined,
    purchase_price: r.purchase_price ?? undefined,
    currency: r.currency ?? "COP",
    lead_time_days: r.lead_time_days ?? undefined,
    min_order_qty: r.min_order_qty ?? undefined,
    is_primary: Boolean(r.is_primary),
  }));

  return (
    <div className="w-full space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">{productRow.name ?? "Ficha maestra"}</h1>
          <p className="mt-2 ui-body-muted">
            Catálogo del insumo o producto: compra, almacenamiento y distribución.
          </p>
        </div>
        <Link href={from || "/inventory/catalog"} className="ui-btn ui-btn--ghost">
          Volver al catálogo
        </Link>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {canEdit ? (
        <form action={updateProduct} className="space-y-8">
          <input type="hidden" name="product_id" value={productRow.id} />
          <input type="hidden" name="return_to" value={from} />

          {/* ——— Bloque 1: Compra y proveedor ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">1</span>
              <div>
                <h2 className="ui-h3">Compra y proveedor</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  De quién se compra, cómo se identifica y en qué unidad. Fotos para listados y catálogo.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Nombre del producto / insumo</span>
                <input name="name" defaultValue={productRow.name ?? ""} className="ui-input" placeholder="Ej. Harina 000" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">SKU (código interno)</span>
                <input name="sku" defaultValue={productRow.sku ?? ""} className="ui-input font-mono" placeholder="Código único" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo</span>
                <select name="product_type" defaultValue={productRow.product_type ?? "insumo"} className="ui-input">
                  <option value="insumo">Insumo</option>
                  <option value="preparacion">Preparación</option>
                  <option value="venta">Venta</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Descripción</span>
                <input name="description" defaultValue={productRow.description ?? ""} className="ui-input" placeholder="Opcional" />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Categoría</span>
                <select name="category_id" defaultValue={productRow.category_id ?? ""} className="ui-input">
                  <option value="">Sin categoría</option>
                  {categoryRows.map((row) => (
                    <option key={row.id} value={row.id}>{categoryPath(row.id)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--ui-text)]">Proveedores del insumo</p>
              <p className="mb-3 text-sm text-[var(--ui-muted)]">
                Asigna uno o más proveedores. En cada fila: SKU del proveedor, unidad de compra, tamaño (p. ej. cuántas unidades base por bulto) y precio. Marca uno como primario.
              </p>
              <ProductSuppliersEditor
                name="supplier_lines"
                initialRows={supplierInitialRows}
                suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <ProductImageUpload
                name="image_url"
                label="Foto del producto"
                currentUrl={productRow.image_url}
                productId={productRow.id}
                kind="product"
              />
              <ProductImageUpload
                name="catalog_image_url"
                label="Foto de catálogo"
                currentUrl={productRow.catalog_image_url}
                productId={productRow.id}
                kind="catalog"
              />
            </div>
          </section>

          {/* ——— Receta (solo preparacion y venta) ——— */}
          {hasRecipe && (
            <>
              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">R</span>
                  <div>
                    <h2 className="ui-h3">Receta: ingredientes</h2>
                    <p className="text-sm text-[var(--ui-muted)]">
                      Insumos y/o preparaciones que componen este producto, con cantidades.
                    </p>
                  </div>
                </div>
                <RecipeIngredientsEditor
                  name="ingredient_lines"
                  initialRows={recipeBomRows.map((r) => ({
                    id: r.id,
                    ingredient_product_id: r.ingredient_product_id,
                    quantity: r.quantity,
                  }))}
                  products={ingredientProducts}
                />
              </section>

              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">F</span>
                  <div>
                    <h2 className="ui-h3">Ficha de receta</h2>
                    <p className="text-sm text-[var(--ui-muted)]">Rendimiento, tiempos, dificultad.</p>
                  </div>
                </div>
                <RecipeMetadataFields
                  yieldQty={recipeCard?.yield_qty ?? undefined}
                  yieldUnit={recipeCard?.yield_unit ?? undefined}
                  portionSize={recipeCard?.portion_size ?? undefined}
                  portionUnit={recipeCard?.portion_unit ?? undefined}
                  prepTimeMinutes={recipeCard?.prep_time_minutes ?? undefined}
                  shelfLifeDays={recipeCard?.shelf_life_days ?? undefined}
                  difficulty={recipeCard?.difficulty ?? undefined}
                  recipeDescription={recipeCard?.recipe_description ?? undefined}
                />
              </section>

              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">P</span>
                  <div>
                    <h2 className="ui-h3">Pasos de preparacion</h2>
                    <p className="text-sm text-[var(--ui-muted)]">Instrucciones paso a paso.</p>
                  </div>
                </div>
                <RecipeStepsEditor
                  name="recipe_steps"
                  initialRows={recipeStepRows.map((s) => ({
                    id: s.id,
                    step_number: s.step_number,
                    description: s.description,
                    tip: s.tip ?? "",
                    time_minutes: s.time_minutes ?? undefined,
                  }))}
                />
              </section>
            </>
          )}

          {/* ——— Bloque 2: Almacenamiento ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">2</span>
              <div>
                <h2 className="ui-h3">Almacenamiento</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Unidad en bodega, control de stock, lotes y vencimiento. Precio y costo para inventario.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad de almacenamiento</span>
                <input name="unit" defaultValue={productRow.unit ?? ""} className="ui-input" placeholder="kg, L, un, etc." required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad por defecto (inventario)</span>
                <input name="default_unit" defaultValue={profileRow?.default_unit ?? ""} className="ui-input" placeholder="Igual que arriba si se deja vacío" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo de inventario</span>
                <select name="inventory_kind" defaultValue={profileRow?.inventory_kind ?? "unclassified"} className="ui-input">
                  <option value="unclassified">Sin clasificar</option>
                  <option value="ingredient">Insumo</option>
                  <option value="finished">Producto terminado</option>
                  <option value="resale">Reventa</option>
                  <option value="packaging">Empaque</option>
                  <option value="asset">Activo</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Precio de venta</span>
                <input name="price" type="number" step="0.01" defaultValue={productRow.price ?? ""} className="ui-input" placeholder="0.00" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Costo (inventario)</span>
                <input name="cost" type="number" step="0.01" defaultValue={productRow.cost ?? ""} className="ui-input" placeholder="Costo actual" />
              </label>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="track_inventory" defaultChecked={Boolean(profileRow?.track_inventory)} />
                <span className="ui-label">Controlar stock</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="lot_tracking" defaultChecked={Boolean(profileRow?.lot_tracking)} />
                <span className="ui-label">Lotes</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="expiry_tracking" defaultChecked={Boolean(profileRow?.expiry_tracking)} />
                <span className="ui-label">Vencimiento</span>
              </label>
            </div>
          </section>

          {/* ——— Bloque 3: Distribución y venta interna ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">3</span>
              <div>
                <h2 className="ui-h3">Distribución y venta interna</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  En qué sedes está disponible y a qué área se envía (remisiones, envío a satélite).
                </p>
              </div>
            </div>

            <ProductSiteSettingsEditor
              name="site_settings_lines"
              initialRows={siteRows.map((r) => ({
                id: r.id,
                site_id: r.site_id,
                is_active: Boolean(r.is_active),
                default_area_kind: r.default_area_kind ?? "",
              }))}
              sites={sitesList.map((s) => ({ id: s.id, name: s.name }))}
              areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
            />
          </section>

          <section className="ui-panel border-t border-[var(--ui-border)] pt-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(productRow.is_active)} />
              <span className="ui-label">Producto activo</span>
            </label>
          </section>

          <div className="flex justify-end">
            <button type="submit" className="ui-btn ui-btn--brand">Guardar cambios</button>
          </div>
        </form>
      ) : (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden editar la ficha maestra.
        </div>
      )}

      <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Ubicaciones (LOCs)</strong> — Crealas en{" "}
        <Link href="/inventory/locations" className="font-medium underline decoration-[var(--ui-border)] underline-offset-2">
          Inventario → Ubicaciones
        </Link>
        . En Entradas asignas cada ítem a un LOC al recibir.
      </div>
    </div>
  );
}
