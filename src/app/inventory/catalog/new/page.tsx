import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { RecipeIngredientsEditor } from "@/features/inventory/catalog/recipe-ingredients-editor";
import { RecipeMetadataFields } from "@/features/inventory/catalog/recipe-metadata-fields";
import { RecipeStepsEditor } from "@/features/inventory/catalog/recipe-steps-editor";
import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import { computeAutoCostFromPrimarySupplier } from "@/lib/inventory/costing";

export const dynamic = "force-dynamic";

type CategoryRow = { id: string; name: string; parent_id: string | null };
type UnitRow = InventoryUnit;
const STOCK_UNIT_FIELD_ID = "stock_unit_code";

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function resolveCompatibleDefaultUnit(params: {
  requestedDefaultUnit: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}) {
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "un");
  const requestedDefaultUnit = normalizeUnitCode(
    params.requestedDefaultUnit || stockUnitCode
  );
  const stockFamily = inferFamilyFromUnitCode(stockUnitCode, params.unitMap);
  const defaultFamily = inferFamilyFromUnitCode(requestedDefaultUnit, params.unitMap);
  if (stockFamily && defaultFamily && stockFamily !== defaultFamily) {
    return stockUnitCode;
  }
  return requestedDefaultUnit || stockUnitCode;
}

const TYPE_CONFIG = {
  insumo: {
    title: "Nuevo insumo",
    subtitle: "Materia prima: se compra a proveedores y se consume en recetas.",
    productType: "insumo",
    inventoryKind: "ingredient",
    hasSuppliers: true,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: true,
  },
  preparacion: {
    title: "Nueva preparacion",
    subtitle: "Producto intermedio (WIP): se produce a partir de insumos y se usa en otros productos.",
    productType: "preparacion",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: false,
    hasStorage: true,
  },
  venta: {
    title: "Nuevo producto de venta",
    subtitle: "Producto final que se vende al cliente. Puede tener receta con insumos y preparaciones.",
    productType: "venta",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: true,
    hasStorage: true,
  },
  asset: {
    title: "Nuevo equipo / activo",
    subtitle: "Equipo, herramienta o activo fijo para control patrimonial.",
    productType: "insumo",
    inventoryKind: "asset",
    hasSuppliers: false,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: false,
  },
} as const;

type ProductTypeKey = keyof typeof TYPE_CONFIG;

async function createProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((employee as { role?: string } | null)?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect("/inventory/catalog?error=" + encodeURIComponent("No tienes permisos para crear productos."));
  }

  const typeKey = asText(formData.get("_type_key")) as ProductTypeKey;
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;

  const name = asText(formData.get("name"));
  if (!name) redirect(`/inventory/catalog/new?type=${typeKey}&error=` + encodeURIComponent("El nombre es obligatorio."));

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .limit(500);
  const units = (unitsData ?? []) as UnitRow[];
  const unitMap = createUnitMap(units);

  const categoryId = asText(formData.get("category_id"));
  const stockUnitCode = normalizeUnitCode(
    asText(formData.get("stock_unit_code")) || asText(formData.get("unit")) || "un"
  );
  const explicitCostRaw = asText(formData.get("cost"));
  const explicitCost =
    explicitCostRaw !== "" && Number.isFinite(Number(explicitCostRaw))
      ? Number(explicitCostRaw)
      : null;
  const costingModeRaw = asText(formData.get("costing_mode")) || "auto_primary_supplier";
  const costingMode =
    costingModeRaw === "manual" ? "manual" : "auto_primary_supplier";
  const unitFamily = inferFamilyFromUnitCode(stockUnitCode, unitMap) ?? null;
  const requestedDefaultUnit = normalizeUnitCode(
    asText(formData.get("default_unit")) || stockUnitCode
  );
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap,
  });

  const productPayload: Record<string, unknown> = {
    name,
    description: asText(formData.get("description")) || null,
    sku: asText(formData.get("sku")) || null,
    unit: stockUnitCode,
    stock_unit_code: stockUnitCode,
    product_type: config.productType,
    category_id: categoryId || null,
    price: formData.get("price") ? Number(formData.get("price")) : null,
    cost: explicitCost,
    is_active: true,
  };

  const { data: newProduct, error: insertErr } = await supabase
    .from("products")
    .insert(productPayload)
    .select("id")
    .single();

  if (insertErr || !newProduct) {
    redirect(`/inventory/catalog/new?type=${typeKey}&error=` + encodeURIComponent(insertErr?.message ?? "Error al crear."));
  }

  const productId = newProduct.id;

  // Inventory profile
  const invKind = config.inventoryKind as string;
  if (config.hasStorage || invKind === "asset") {
    const profilePayload = {
      product_id: productId,
      track_inventory: Boolean(formData.get("track_inventory")),
      inventory_kind: invKind,
      default_unit: resolvedDefaultUnit,
      unit_family: unitFamily,
      costing_mode: costingMode,
      lot_tracking: Boolean(formData.get("lot_tracking")),
      expiry_tracking: Boolean(formData.get("expiry_tracking")),
    };
    await supabase.from("product_inventory_profiles").upsert(profilePayload, { onConflict: "product_id" });
  } else {
    await supabase.from("product_inventory_profiles").upsert(
      {
        product_id: productId,
        track_inventory: false,
        inventory_kind: invKind,
        default_unit: resolvedDefaultUnit,
        unit_family: unitFamily,
        costing_mode: costingMode,
      },
      { onConflict: "product_id" }
    );
  }

  // Suppliers
  let autoCostFromPrimary: number | null = null;
  if (config.hasSuppliers) {
    const supplierRaw = formData.get("supplier_lines");
    if (typeof supplierRaw === "string" && supplierRaw) {
      try {
        const lines = JSON.parse(supplierRaw) as Array<Record<string, unknown>>;
        for (const line of lines) {
          if ((line._delete as boolean) || !line.supplier_id) continue;
          const packQty =
            Number(line.purchase_pack_qty ?? line.purchase_unit_size ?? 0) || 0;
          const packUnitCode = normalizeUnitCode(
            (line.purchase_pack_unit_code as string) || stockUnitCode
          );
          let purchaseUnitSizeLegacy: number | null = null;
          if (packQty > 0 && packUnitCode) {
            try {
              const { quantity } = convertQuantity({
                quantity: packQty,
                fromUnitCode: packUnitCode,
                toUnitCode: stockUnitCode,
                unitMap,
              });
              purchaseUnitSizeLegacy = quantity;
            } catch {
              purchaseUnitSizeLegacy = null;
            }
          }
          const purchasePrice = Number(line.purchase_price ?? 0) || null;
          if (
            costingMode === "auto_primary_supplier" &&
            Boolean(line.is_primary) &&
            purchasePrice != null &&
            purchasePrice > 0 &&
            packQty > 0 &&
            packUnitCode
          ) {
            try {
              autoCostFromPrimary = computeAutoCostFromPrimarySupplier({
                packPrice: purchasePrice,
                packQty,
                packUnitCode,
                stockUnitCode,
                unitMap,
              });
            } catch {
              // ignore invalid conversion in auto-cost fallback
            }
          }

          await supabase.from("product_suppliers").insert({
            product_id: productId,
            supplier_id: line.supplier_id as string,
            supplier_sku: (line.supplier_sku as string) || null,
            purchase_unit: (line.purchase_unit as string) || null,
            purchase_unit_size: purchaseUnitSizeLegacy,
            purchase_pack_qty: packQty > 0 ? packQty : null,
            purchase_pack_unit_code: packUnitCode || null,
            purchase_price: purchasePrice,
            currency: (line.currency as string) || "COP",
            lead_time_days: (line.lead_time_days as number) ?? null,
            min_order_qty: (line.min_order_qty as number) ?? null,
            is_primary: Boolean(line.is_primary),
          });
        }
      } catch { /* skip */ }
    }
  }

  if (costingMode === "auto_primary_supplier" && explicitCost == null && autoCostFromPrimary != null) {
    await supabase
      .from("products")
      .update({ cost: autoCostFromPrimary, updated_at: new Date().toISOString() })
      .eq("id", productId);
  }

  // Site settings
  const siteRaw = formData.get("site_settings_lines");
  if (typeof siteRaw === "string" && siteRaw) {
    try {
      const siteLines = JSON.parse(siteRaw) as Array<Record<string, unknown>>;
      for (const line of siteLines) {
        if ((line._delete as boolean) || !line.site_id) continue;
        await supabase.from("product_site_settings").insert({
          product_id: productId,
          site_id: line.site_id as string,
          is_active: Boolean(line.is_active),
          default_area_kind: (line.default_area_kind as string) || null,
        });
      }
    } catch { /* skip */ }
  }

  // Recipe card + BOM + Steps
  if (config.hasRecipe) {
    const yieldQty = formData.get("yield_qty") ? Number(formData.get("yield_qty")) : 1;
    const yieldUnit = asText(formData.get("yield_unit")) || "un";

    const { data: recipeCard } = await supabase
      .from("recipe_cards")
      .insert({
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
      })
      .select("id")
      .single();

    // BOM lines
    const ingredientRaw = formData.get("ingredient_lines");
    if (typeof ingredientRaw === "string" && ingredientRaw) {
      try {
        const ingredientLines = JSON.parse(ingredientRaw) as Array<Record<string, unknown>>;
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
    }

    // Steps
    if (recipeCard) {
      const stepsRaw = formData.get("recipe_steps");
      if (typeof stepsRaw === "string" && stepsRaw) {
        try {
          const stepLines = JSON.parse(stepsRaw) as Array<Record<string, unknown>>;
          for (const step of stepLines) {
            if ((step._delete as boolean) || !step.description) continue;
            await supabase.from("recipe_steps").insert({
              recipe_card_id: recipeCard.id,
              step_number: (step.step_number as number) ?? 1,
              description: step.description as string,
              tip: (step.tip as string) || null,
              time_minutes: (step.time_minutes as number) ?? null,
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  revalidatePath("/inventory/catalog");
  redirect(`/inventory/catalog/${productId}?ok=1`);
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const typeKey = (sp.type ?? "insumo") as ProductTypeKey;
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/catalog/new?type=${typeKey}`,
  });

  const { data: emp } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreate = ["propietario", "gerente_general"].includes(role);

  // Load catalogs
  const { data: categoriesData } = await supabase
    .from("product_categories")
    .select("id,name,parent_id")
    .order("name", { ascending: true });
  const categoryRows = (categoriesData ?? []) as CategoryRow[];
  const categoryMap = new Map(categoryRows.map((r) => [r.id, r]));
  function categoryPath(catId: string) {
    const parts: string[] = [];
    let cur = categoryMap.get(catId);
    let safe = 0;
    while (cur && safe < 6) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? categoryMap.get(cur.parent_id) : undefined;
      safe++;
    }
    return parts.join(" / ");
  }

  const { data: sitesData } = await supabase.from("sites").select("id,name").eq("is_active", true).order("name");
  const sitesList = (sitesData ?? []) as { id: string; name: string | null }[];

  const { data: areaKindsData } = await supabase.from("area_kinds").select("code,name").order("name");
  const areaKindsList = (areaKindsData ?? []) as { code: string; name: string | null }[];

  const { data: suppliersData } = config.hasSuppliers
    ? await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name")
    : { data: [] };
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

  const defaultStockUnitCode = unitsList[0]?.code ?? "un";
  const inventoryUnitMap = createUnitMap(unitsList);
  const defaultStockUnit = inventoryUnitMap.get(defaultStockUnitCode) ?? null;
  const defaultUnitOptions = defaultStockUnit
    ? unitsList.filter((unit) => unit.family === defaultStockUnit.family)
    : unitsList;

  // For recipe: load insumos + preparaciones as ingredient options
  let ingredientProducts: { id: string; name: string | null; sku: string | null; unit: string | null; cost: number | null }[] = [];
  if (config.hasRecipe) {
    const { data: prods } = await supabase
      .from("products")
      .select("id,name,sku,unit,cost")
      .in("product_type", ["insumo", "preparacion"])
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000);
    ingredientProducts = (prods ?? []) as typeof ingredientProducts;
  }

  if (!canCreate) {
    return (
      <div className="w-full max-w-6xl">
        <h1 className="ui-h1">{config.title}</h1>
        <div className="mt-6 ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden crear productos.
        </div>
      </div>
    );
  }

  let sectionNum = 0;
  function nextSection() {
    sectionNum++;
    return sectionNum;
  }

  return (
    <div className="w-full max-w-6xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/catalog" className="ui-caption underline">
            Volver al catalogo
          </Link>
          <h1 className="mt-2 ui-h1">{config.title}</h1>
          <p className="mt-2 ui-body-muted">{config.subtitle}</p>
        </div>
      </div>

      {errorMsg && <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>}

      <form action={createProduct} className="space-y-8">
        <input type="hidden" name="_type_key" value={typeKey} />

        {/* ——— Datos basicos ——— */}
        <section className="ui-panel space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
              {nextSection()}
            </span>
            <div>
              <h2 className="ui-h3">Datos basicos</h2>
              <p className="text-sm text-[var(--ui-muted)]">
                Nombre, codigo y clasificacion. Las unidades se definen en la seccion de almacenamiento.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Nombre <span className="text-[var(--ui-danger)]">*</span></span>
              <input name="name" className="ui-input" placeholder={typeKey === "asset" ? "Ej. Horno industrial" : "Ej. Harina 000"} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">SKU / Codigo</span>
              <input name="sku" className="ui-input font-mono" placeholder="Codigo unico" />
            </label>
            <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
              Configura unidad base y unidad operativa en la seccion de almacenamiento.
            </div>
            {typeKey !== "asset" && (
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Categoria</span>
                <select name="category_id" className="ui-input">
                  <option value="">Sin categoria</option>
                  {categoryRows.map((row) => (
                    <option key={row.id} value={row.id}>{categoryPath(row.id)}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Descripcion</span>
              <input name="description" className="ui-input" placeholder="Opcional" />
            </label>
            {config.hasPrice && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Precio de venta</span>
                  <input name="price" type="number" step="0.01" className="ui-input" placeholder="0.00" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Costo</span>
                  <input name="cost" type="number" step="0.01" className="ui-input" placeholder="0.00" />
                </label>
              </>
            )}
            {!config.hasPrice && typeKey !== "asset" && (
              <label className="flex flex-col gap-1">
                <span className="ui-label">Costo unitario</span>
                <input name="cost" type="number" step="0.01" className="ui-input" placeholder="0.00" />
              </label>
            )}
          </div>
        </section>

        {/* ——— Proveedores (solo insumo) ——— */}
        {config.hasSuppliers && (
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                {nextSection()}
              </span>
              <div>
                <h2 className="ui-h3">Proveedores</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Define empaque de compra y usa la calculadora para convertir costo a unidad base.
                </p>
              </div>
            </div>
            <ProductSuppliersEditor
              name="supplier_lines"
              initialRows={[]}
              suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
              units={unitsList.map((unit) => ({
                code: unit.code,
                name: unit.name,
                family: unit.family,
                factor_to_base: unit.factor_to_base,
              }))}
              stockUnitCode={defaultStockUnitCode}
              stockUnitCodeFieldId={STOCK_UNIT_FIELD_ID}
            />
          </section>
        )}

        {/* ——— Receta (preparacion y venta) ——— */}
        {config.hasRecipe && (
          <>
            <section className="ui-panel space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                  {nextSection()}
                </span>
                <div>
                  <h2 className="ui-h3">Receta: ingredientes</h2>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Lista de insumos y/o preparaciones que componen este producto, con cantidades.
                  </p>
                </div>
              </div>
              <RecipeIngredientsEditor
                name="ingredient_lines"
                initialRows={[]}
                products={ingredientProducts}
              />
            </section>

            <section className="ui-panel space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                  {nextSection()}
                </span>
                <div>
                  <h2 className="ui-h3">Ficha de receta</h2>
                  <p className="text-sm text-[var(--ui-muted)]">Rendimiento, tiempos y dificultad.</p>
                </div>
              </div>
              <RecipeMetadataFields />
            </section>

            <section className="ui-panel space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                  {nextSection()}
                </span>
                <div>
                  <h2 className="ui-h3">Pasos de preparacion</h2>
                  <p className="text-sm text-[var(--ui-muted)]">Instrucciones paso a paso para preparar este producto.</p>
                </div>
              </div>
              <RecipeStepsEditor name="recipe_steps" initialRows={[]} />
            </section>
          </>
        )}

        {/* ——— Almacenamiento (no para asset) ——— */}
        {config.hasStorage && (
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                {nextSection()}
              </span>
              <div>
                <h2 className="ui-h3">Almacenamiento</h2>
                <p className="text-sm text-[var(--ui-muted)]">Control de stock, lotes y vencimiento.</p>
              </div>
            </div>
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              <p className="font-medium text-[var(--ui-text)]">Regla simple de unidades</p>
              <p className="mt-1">Unidad base: donde se guarda todo el stock y todos los movimientos.</p>
              <p>Unidad operativa: sugerencia para formularios; debe ser de la misma familia.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">
                  Unidad base de stock <span className="text-[var(--ui-danger)]">*</span>
                </span>
                <select
                  id={STOCK_UNIT_FIELD_ID}
                  name="stock_unit_code"
                  className="ui-input"
                  defaultValue={defaultStockUnitCode}
                  required
                >
                  {unitsList.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name} ({unit.family})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">
                  Unidad canonica en la que vivira el inventario de este producto.
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad operativa (formularios)</span>
                <select name="default_unit" className="ui-input" defaultValue={defaultStockUnitCode}>
                  {defaultUnitOptions.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name} ({unit.family})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">
                  Si eliges una unidad incompatible, se guardara automaticamente la unidad base.
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Politica de costo</span>
                <select name="costing_mode" className="ui-input" defaultValue="auto_primary_supplier">
                  <option value="auto_primary_supplier">Auto desde proveedor primario</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="track_inventory" defaultChecked />
                <span className="ui-label">Controlar stock</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="lot_tracking" />
                <span className="ui-label">Lotes</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="expiry_tracking" />
                <span className="ui-label">Vencimiento</span>
              </label>
            </div>
          </section>
        )}

        {/* ——— Sedes ——— */}
        <section className="ui-panel space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
              {nextSection()}
            </span>
            <div>
              <h2 className="ui-h3">Disponibilidad por sede</h2>
              <p className="text-sm text-[var(--ui-muted)]">En que sedes esta disponible este producto.</p>
            </div>
          </div>
          <ProductSiteSettingsEditor
            name="site_settings_lines"
            initialRows={[]}
            sites={sitesList.map((s) => ({ id: s.id, name: s.name }))}
            areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
          />
        </section>

        {/* ——— Submit ——— */}
        <div className="flex justify-end">
          <button type="submit" className="ui-btn ui-btn--brand">
            Crear {typeKey === "asset" ? "equipo" : typeKey === "venta" ? "producto" : typeKey}
          </button>
        </div>
      </form>
    </div>
  );
}
