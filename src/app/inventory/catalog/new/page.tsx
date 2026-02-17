import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { SkuField } from "@/components/inventory/SkuField";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { getCategoryDomainOptions } from "@/lib/constants";
import { safeDecodeURIComponent } from "@/lib/url";

import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";
import { RecipeIngredientsEditor } from "@/features/inventory/catalog/recipe-ingredients-editor";
import { RecipeMetadataFields } from "@/features/inventory/catalog/recipe-metadata-fields";
import { RecipeStepsEditor } from "@/features/inventory/catalog/recipe-steps-editor";
import {
  categorySupportsKind,
  filterCategoryRows,
  getCategoryDomainCodes,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import { computeAutoCostFromPrimarySupplier } from "@/lib/inventory/costing";
import { generateNextSku, isSkuConflictError } from "@/lib/inventory/sku";

export const dynamic = "force-dynamic";

type CategoryRow = InventoryCategoryRow;
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

function resolveTypeCategoryKind(typeKey: ProductTypeKey): CategoryKind {
  if (typeKey === "asset") return "equipo";
  if (typeKey === "venta") return "venta";
  if (typeKey === "preparacion") return "preparacion";
  return "insumo";
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
  const categoryKind = resolveTypeCategoryKind(typeKey);
  if (categoryId) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from("product_categories")
      .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError || !categoryRow) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=` +
          encodeURIComponent("La categoria seleccionada no existe.")
      );
    }
    const category = categoryRow as CategoryRow;
    if (!categorySupportsKind(category, categoryKind)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=` +
          encodeURIComponent("La categoria no aplica al tipo de item seleccionado.")
      );
    }
    if (categoryKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=` +
          encodeURIComponent("Las categorías con dominio solo se permiten para productos de venta.")
      );
    }
  }

  if (categoryId) {
    const { count: activeChildrenCount, error: activeChildrenError } = await supabase
      .from("product_categories")
      .select("id", { head: true, count: "exact" })
      .eq("parent_id", categoryId)
      .eq("is_active", true);
    if (activeChildrenError) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=` +
          encodeURIComponent(activeChildrenError.message)
      );
    }
    if ((activeChildrenCount ?? 0) > 0) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=` +
          encodeURIComponent("Selecciona una categoria del ultimo nivel (categoria hoja).")
      );
    }
  }

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
    unit: stockUnitCode,
    stock_unit_code: stockUnitCode,
    product_type: config.productType,
    category_id: categoryId || null,
    price: formData.get("price") ? Number(formData.get("price")) : null,
    cost: explicitCost,
    image_url: asText(formData.get("image_url")) || null,
    is_active: true,
  };
  if (formData.has("catalog_image_url")) {
    productPayload.catalog_image_url = asText(formData.get("catalog_image_url")) || null;
  }

  let createdProductId = "";
  let attempts = 0;
  let lastInsertErrorMessage = "";
  while (!createdProductId && attempts < 2) {
    attempts += 1;
    const autoSku = await generateNextSku({
      supabase,
      productType: config.productType,
      inventoryKind: config.inventoryKind,
      name,
    });

    const { data: newProduct, error: insertErr } = await supabase
      .from("products")
      .insert({ ...productPayload, sku: autoSku })
      .select("id")
      .single();

    if (!insertErr && newProduct?.id) {
      createdProductId = newProduct.id;
      break;
    }

    lastInsertErrorMessage = insertErr?.message ?? "Error al crear.";
    if (!isSkuConflictError(insertErr)) {
      break;
    }
  }

  if (!createdProductId) {
    redirect(
      `/inventory/catalog/new?type=${typeKey}&error=` +
        encodeURIComponent(
          lastInsertErrorMessage || "No se pudo asignar un SKU automatico. Intenta de nuevo."
        )
    );
  }

  const productId = createdProductId;

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
  let operationalUomFromSupplier:
    | {
        label: string;
        inputUnitCode: string;
        qtyInInputUnit: number;
        qtyInStockUnit: number;
      }
    | null = null;
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

          if (
            Boolean(line.is_primary) &&
            Boolean(line.use_in_operations) &&
            packQty > 0 &&
            packUnitCode
          ) {
            try {
              const { quantity: qtyInStockUnit } = convertQuantity({
                quantity: packQty,
                fromUnitCode: packUnitCode,
                toUnitCode: stockUnitCode,
                unitMap,
              });
              if (qtyInStockUnit > 0) {
                operationalUomFromSupplier = {
                  label: String(line.purchase_unit || "Empaque"),
                  inputUnitCode: packUnitCode,
                  qtyInInputUnit: 1,
                  qtyInStockUnit,
                };
              }
            } catch {
              // keep without operational profile when conversion is invalid
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

  if (operationalUomFromSupplier) {
    await supabase
      .from("product_uom_profiles")
      .update({
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", productId)
      .eq("is_default", true);

    await supabase.from("product_uom_profiles").insert({
      product_id: productId,
      label: operationalUomFromSupplier.label,
      input_unit_code: operationalUomFromSupplier.inputUnitCode,
      qty_in_input_unit: operationalUomFromSupplier.qtyInInputUnit,
      qty_in_stock_unit: operationalUomFromSupplier.qtyInStockUnit,
      is_default: true,
      is_active: true,
      source: "supplier_primary",
    });
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
          audience:
            String(line.audience ?? "BOTH").trim().toUpperCase() === "SAUDO"
              ? "SAUDO"
              : String(line.audience ?? "BOTH").trim().toUpperCase() === "VCF"
                ? "VCF"
                : "BOTH",
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
              step_image_url: (step.step_image_url as string) || null,
              step_video_url: (step.step_video_url as string) || null,
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
  searchParams?: Promise<{
    type?: string;
    error?: string;
    category_scope?: string;
    category_site_id?: string;
    category_domain?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const typeKey = (sp.type ?? "insumo") as ProductTypeKey;
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/catalog/new?type=${typeKey}`,
  });

  const [{ data: emp }, { data: settings }, { data: sitesData }] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase.from("sites").select("id,name").eq("is_active", true).order("name"),
  ]);
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreate = ["propietario", "gerente_general"].includes(role);

  const sitesList = (sitesData ?? []) as { id: string; name: string | null }[];
  const siteNamesById = Object.fromEntries(
    sitesList.map((site) => [site.id, site.name ?? site.id])
  );

  const categoryKind = resolveTypeCategoryKind(typeKey);
  const categorySiteId = String(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (emp as { site_id?: string | null } | null)?.site_id ??
      ""
  ).trim();
  const defaultCategoryScope = categorySiteId ? "site" : "all";
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";

  const allCategoryRows = await loadCategoryRows(supabase);
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
  });
  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );

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
      <div className="w-full max-w-6xl space-y-6">
        <PageHeader title={config.title} subtitle={config.subtitle} />
        <div className="ui-alert ui-alert--warn">
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
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
            Volver al catálogo
          </Link>
        }
      />

      {errorMsg && <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>}

      <form method="get" className="ui-panel grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="type" value={typeKey} />
        <label className="flex flex-col gap-1">
          <span className="ui-label">Alcance de categoria</span>
          <select name="category_scope" defaultValue={categoryScope} className="ui-input">
            <option value="all">Todas</option>
            <option value="global">Globales</option>
            <option value="site">Sede activa</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Sede para categorías</span>
          <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
            <option value="">Seleccionar sede</option>
            {sitesList.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.id}
              </option>
            ))}
          </select>
        </label>
        {shouldShowCategoryDomain(categoryKind) ? (
          <label className="flex flex-col gap-1">
            <span className="ui-label">Dominio de venta</span>
            <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
              <option value="">Todos</option>
              {categoryDomainOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-end">
          <button className="ui-btn ui-btn--ghost">Actualizar categorías</button>
        </div>
      </form>

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
            <SkuField
              mode="create"
              initialProductType={config.productType}
              initialInventoryKind={config.inventoryKind}
              className="flex flex-col gap-1"
            />
            <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
              Configura unidad base y unidad operativa en la seccion de almacenamiento.
            </div>
            <CategoryTreeFilter
              categories={categoryRows}
              selectedCategoryId=""
              siteNamesById={siteNamesById}
              className="sm:col-span-2"
              label="Categoria"
              emptyOptionLabel="Sin categoria"
              maxVisibleOptions={8}
              selectionMode="leaf_only"
              nonSelectableHint="Categoria padre"
            />
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Descripcion</span>
              <input name="description" className="ui-input" placeholder="Opcional" />
            </label>
            {config.hasPrice ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">Precio de venta</span>
                <input name="price" type="number" step="0.01" className="ui-input" placeholder="0.00" />
              </label>
            ) : null}
            {typeKey !== "asset" ? (
              <>
                <input type="hidden" name="cost" value="" />
                <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)] sm:col-span-2">
                  <p className="font-medium text-[var(--ui-text)]">Costo automatico</p>
                  <p className="mt-1">
                    El costo unitario se calcula automaticamente desde proveedor primario y entradas.
                  </p>
                  <p>
                    Si faltan datos de proveedor, el producto se guarda y quedara marcado como
                    incompleto para terminar configuracion.
                  </p>
                </div>
              </>
            ) : null}
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
              <RecipeStepsEditor
                name="recipe_steps"
                initialRows={[]}
                mediaOwnerId={`draft-${typeKey}`}
              />
            </section>

          </>
        )}

        <section className="ui-panel space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
              {nextSection()}
            </span>
            <div>
              <h2 className="ui-h3">Foto del producto</h2>
              <p className="text-sm text-[var(--ui-muted)]">
                Imagen visual para identificar rapido el producto o insumo en listados y ficha.
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            <ProductImageUpload
              name="image_url"
              label="Foto del producto"
              currentUrl={null}
              productId={`draft-${typeKey}`}
              kind="product"
            />
          </div>
          <div className="text-xs text-[var(--ui-muted)]">
            Si no subes fotos ahora, puedes cargarlas despues desde la ficha de edicion.
          </div>
        </section>

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
