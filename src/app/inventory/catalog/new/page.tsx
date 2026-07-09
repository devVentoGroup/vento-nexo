import Link from "next/link";

import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import { CreateRequestKeyField } from "@/components/inventory/forms/create-request-key-field";
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";

import { ProductCostStatusPanel } from "@/features/inventory/catalog/product-cost-status-panel";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductAssetTechnicalSection } from "@/features/inventory/catalog/product-asset-technical-section";
import { ProductPurchaseSection } from "@/features/inventory/catalog/product-purchase-section";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import { NewProductHero } from "./_components/new-product-hero";
import {
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import {
  filterCategoryRows,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type CategoryKind,
} from "@/lib/inventory/categories";
import {
  createUnitMap,
  normalizeUnitCode,
} from "@/lib/inventory/uom";
import {
  asText,
  appendQueryParam,
  buildOperationUnitHintFromUnits,
  inventoryKindLabel,
  loadCategoryRows,
  normalizeMeasurementMode,
  resolveCompatibleDefaultUnit,
  sanitizeAuxCountUnitCode,
  type CategoryRow,
  type UnitRow,
} from "../[id]/detail-helpers";
import {
  createProductAndCreateAnother,
  createProductAndReturnToCatalog,
  createProductAndView,
} from "./actions";

export const dynamic = "force-dynamic";

const STOCK_UNIT_FIELD_ID = "stock_unit_code";

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const message = `${error.message ?? ""}`.toLowerCase();
  return message.includes(column.toLowerCase());
}

function isCreateRequestKeyConflict(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  if (!error || error.code !== "23505") return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    message.includes("create_request_key") ||
    message.includes("ux_products_create_request_key")
  );
}

function resolveTypeCategoryKind(typeKey: ProductTypeKey): CategoryKind {
  if (typeKey === "asset") return "equipo";
  if (typeKey === "venta" || typeKey === "reventa") return "venta";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "preparacion";
  return "insumo";
}

const TYPE_CONFIG = {
  insumo: {
    title: "Nuevo insumo",
    subtitle: "Materia prima operativa para stock, entradas, remisiones y consumo manual.",
    productType: "insumo",
    inventoryKind: "ingredient",
    hasSuppliers: true,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: true,
  },
  preparacion: {
    title: "Nueva preparación",
    subtitle: "Modelo producido / WIP: se fabrica desde receta en FOGO y puede usarse en otros productos, remisiones o producción interna.",
    productType: "preparacion",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: false,
    hasStorage: true,
  },
  preparacion_vendible: {
    title: "Nueva preparación vendible",
    subtitle: "Se produce internamente con receta, se puede vender directamente y tambien se puede usar dentro de otras recetas.",
    productType: "preparacion",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: false,
    hasStorage: true,
  },
  venta: {
    title: "Nuevo producto de venta",
    subtitle: "Producto final de venta. Completa su ficha operativa y continuidad de receta cuando aplique.",
    productType: "venta",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: true,
    hasStorage: true,
  },
  reventa: {
    title: "Nuevo producto de reventa",
    subtitle:
      "Producto que se compra ya terminado y se revende. No lleva receta, si lleva proveedor.",
    productType: "venta",
    inventoryKind: "resale",
    hasSuppliers: true,
    hasRecipe: false,
    hasPrice: true,
    hasStorage: true,
  },
  asset: {
    title: "Nuevo modelo patrimonial",
    subtitle: "Crea el modelo base de un equipo, mobiliario, herramienta o activo. Las unidades físicas reales se crean después en Activos físicos.",
    productType: "insumo",
    inventoryKind: "asset",
    hasSuppliers: false,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: false,
  },
} as const;

type ProductTypeKey = keyof typeof TYPE_CONFIG;
const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

function buildFogoRecipeCreateUrl(typeKey: ProductTypeKey) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("source", "nexo");
  url.searchParams.set("product_type", typeKey);
  return url.toString();
}

function typeBadgeLabel(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "Modelo patrimonial";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "Producción interna";
  return "Formulario completo";
}

function typeDisplayLabel(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "activo";
  if (typeKey === "preparacion_vendible") return "preparación vendible";
  if (typeKey === "preparacion") return "preparación";
  return typeKey;
}

function catalogTabForTypeKey(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "equipos";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "preparaciones";
  if (typeKey === "venta" || typeKey === "reventa") return "productos";
  return "insumos";
}

function catalogLabelForTypeKey(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "Equipos";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "Preparaciones";
  if (typeKey === "venta" || typeKey === "reventa") return "Productos";
  return "Insumos";
}

function catalogHrefForTypeKey(typeKey: ProductTypeKey) {
  return `/inventory/catalog?tab=${catalogTabForTypeKey(typeKey)}`;
}

function newProductHrefForTypeKey(typeKey: ProductTypeKey) {
  return `/inventory/catalog/new?type=${encodeURIComponent(typeKey)}`;
}

type AfterCreateAction = "view" | "catalog" | "create_another";

function normalizeAfterCreateAction(value: string): AfterCreateAction {
  if (value === "view" || value === "catalog" || value === "create_another") {
    return value;
  }
  return "create_another";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function heroKpis(typeKey: ProductTypeKey) {
  if (typeKey === "asset") {
    return {
      typeValue: "Activo",
      typeNote: "Modelo base del catálogo patrimonial",
      modeValue: "Simple",
      modeNote: "Solo identidad y datos técnicos base",
      objectiveValue: "Modelo",
      objectiveNote: "Luego creas unidades reales en Activos físicos",
    };
  }

  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") {
    return {
      typeValue: typeKey === "preparacion_vendible" ? "Preparación vendible" : "Preparación",
      typeNote:
        typeKey === "preparacion_vendible"
          ? "Producto producido que VISO puede vender por sede"
          : "Producto intermedio producido desde receta",
      modeValue: "Producción",
      modeNote: "Unidad base, WIP y continuidad en FOGO",
      objectiveValue: "Receta / WIP",
      objectiveNote: "Después conectas fórmula, rendimiento y porciones",
    };
  }

  return {
    typeValue: typeKey,
    typeNote: "Clase operativa del maestro que vas a crear",
    modeValue: "Completo",
    modeNote: "Alta definitiva con unidades, proveedor y sedes",
    objectiveValue: "Definitivo",
    objectiveNote: "Maestro completo conectado a compras ORIGO y remisiones",
  };
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    mode?: string;
    error?: string;
    ok?: string;
    category_scope?: string;
    category_site_id?: string;
    category_domain?: string;
    source?: string;
    review_request_id?: string;
    source_entry_id?: string;
    return_to?: string;
    suggested_name?: string;
    supplier_id?: string;
    stock_unit_code?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const typeKey = (sp.type ?? "insumo") as ProductTypeKey;
  const origoReviewRequestId = String(sp.review_request_id ?? "").trim();
  const isOrigoReviewFlow = String(sp.source ?? "").trim() === "origo_receipt_review" && Boolean(origoReviewRequestId);
  const origoSourceEntryId = String(sp.source_entry_id ?? "").trim();
  const origoReturnTo = safeDecode(sp.return_to) || "/product-master-review";
  const suggestedName = safeDecode(sp.suggested_name).trim();
  const createRequestKey = isOrigoReviewFlow ? `origo_receipt_review:${origoReviewRequestId}` : crypto.randomUUID();
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;
  const kpis = heroKpis(typeKey);
  const errorMsg = safeDecode(sp.error);
  const createdMsg = sp.ok === "created" ? "Producto creado. Puedes registrar el siguiente sin volver al catálogo." : "";
  const catalogHref = catalogHrefForTypeKey(typeKey);
  const catalogLabel = catalogLabelForTypeKey(typeKey);
  const createSubmitLabel = typeKey === "asset"
    ? "Crear modelo patrimonial"
    : typeKey === "venta"
      ? "Crear producto"
      : typeKey === "reventa"
        ? "Crear producto de reventa"
        : typeKey === "preparacion_vendible"
          ? "Crear preparación vendible"
          : `Crear ${typeKey}`;
  const normalizedProductType = String(config.productType ?? "").trim().toLowerCase();
  const normalizedInventoryKind = String(config.inventoryKind ?? "").trim().toLowerCase();
  const isAssetItem = normalizedInventoryKind === "asset";
  const hasRecipe = Boolean(config.hasRecipe);
  const hasSuppliers = Boolean(config.hasSuppliers);
  const lockedInventoryKind = config.inventoryKind;
  const lockedInventoryKindText = inventoryKindLabel(lockedInventoryKind);
  const createTypeLabel =
    isAssetItem
      ? "Activo"
      : normalizedProductType === "venta"
        ? "Venta"
        : normalizedProductType === "preparacion"
          ? "Preparación"
          : "Insumo";

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
    supabase
      .from("sites")
      .select("id,name,site_type,operational_visibility")
      .eq("is_active", true)
      .eq("operational_visibility", "operational")
      .order("name"),
  ]);
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreate =
    ["propietario", "gerente_general", "bodeguero"].includes(role) ||
    (await checkPermission(supabase, "nexo", "catalog.products"));

  const sitesList = (sitesData ?? []) as {
    id: string;
    name: string | null;
    site_type: string | null;
  }[];
  const siteIds = sitesList.map((site) => site.id);
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
  const requestedCategoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const requestedCategoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";
  const isSaleCategoryKind = categoryKind === "venta";
  const categoryScope = isSaleCategoryKind ? "global" : requestedCategoryScope;
  const effectiveCategorySiteId = isSaleCategoryKind ? "" : categorySiteId;
  const categoryDomain = isSaleCategoryKind ? "" : requestedCategoryDomain;

  const capabilityRowsPromise = siteIds.length
    ? supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup"
      )
      .in("site_id", siteIds)
    : Promise.resolve({ data: [] as SiteOperationalCapabilities[] });
  const allCategoryRowsPromise = loadCategoryRows(supabase);
  const areaKindsWithPurposePromise = supabase
    .from("area_kinds")
    .select("code,name,use_for_remission")
    .order("name", { ascending: true });
  const siteAreasPromise = supabase
    .from("areas")
    .select("site_id,kind,is_active")
    .eq("is_active", true);
  const productionLocationsPromise = supabase
    .from("inventory_locations")
    .select("id,site_id,code,zone,location_type,is_active,area:areas(kind)")
    .eq("is_active", true)
    .order("code", { ascending: true });
  const productionAreaRulesPromise = supabase
    .from("site_area_purpose_rules")
    .select("site_id,area_kind,purpose,is_enabled")
    .eq("purpose", "production_recipe")
    .eq("is_enabled", true);
  const suppliersPromise = config.hasSuppliers
    ? supabase.from("suppliers").select("id,name").eq("is_active", true).order("name")
    : Promise.resolve({ data: [] as { id: string; name: string | null }[] });
  const unitsPromise = supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);

  const [
    { data: capabilityRows },
    allCategoryRows,
    { data: areaKindsWithPurpose, error: areaKindsWithPurposeError },
    { data: siteAreasData },
    { data: productionLocationsData },
    { data: productionAreaRulesData },
    { data: suppliersData },
    { data: unitsData },
  ] = await Promise.all([
    capabilityRowsPromise,
    allCategoryRowsPromise,
    areaKindsWithPurposePromise,
    siteAreasPromise,
    productionLocationsPromise,
    productionAreaRulesPromise,
    suppliersPromise,
    unitsPromise,
  ]);
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteOperationalCapabilities[]
  );
  const capabilitySiteIds = new Set(
    ((capabilityRows ?? []) as SiteOperationalCapabilities[]).map((row) =>
      String(row.site_id ?? "")
    )
  );
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: effectiveCategorySiteId,
  });
  const areaKindsList = !areaKindsWithPurposeError
    ? ((areaKindsWithPurpose ?? []) as Array<{
      code: string;
      name: string | null;
      use_for_remission?: boolean | null;
    }>)
    : (((await supabase.from("area_kinds").select("code,name").order("name", { ascending: true })).data ??
      []) as Array<{ code: string; name: string | null }>).map((row) => ({
        ...row,
        use_for_remission: ["mostrador", "bar", "cocina", "general"].includes(
          String(row.code ?? "").trim().toLowerCase()
        ),
      }));
  const productionAreaKindsBySite = ((productionAreaRulesData ?? []) as Array<{ site_id: string | null; area_kind: string | null }>).reduce(
    (acc, row) => {
      const siteId = String(row.site_id ?? "").trim();
      const areaKind = String(row.area_kind ?? "").trim();
      if (!siteId || !areaKind) return acc;
      const current = acc[siteId] ?? [];
      if (!current.includes(areaKind)) current.push(areaKind);
      acc[siteId] = current;
      return acc;
    },
    {} as Record<string, string[]>
  );
  const productionLocationsList = ((productionLocationsData ?? []) as Array<{
    id: string;
    site_id: string;
    code: string;
    zone: string | null;
    location_type: string | null;
    area?: { kind: string | null } | { kind: string | null }[] | null;
  }>).filter((location) => {
    const locationType = String(location.location_type ?? "").trim();
    const siteId = String(location.site_id ?? "").trim();
    const areaValue = Array.isArray(location.area) ? location.area[0] : location.area;
    const areaKind = String(areaValue?.kind ?? "").trim();
    return locationType === "production" || Boolean(siteId && areaKind && productionAreaKindsBySite[siteId]?.includes(areaKind));
  });
  const siteAreaKindsList = Array.from(
    new Set(
      ((siteAreasData ?? []) as Array<{ site_id: string | null; kind: string | null }>)
        .map((row) => {
          const siteId = String(row.site_id ?? "").trim();
          const kind = String(row.kind ?? "").trim();
          return siteId && kind ? `${siteId}::${kind}` : "";
        })
        .filter(Boolean)
    )
  ).map((token) => {
    const [site_id, kind] = token.split("::");
    return { site_id, kind };
  });
  const satelliteSiteIds = sitesList
    .filter((site) => {
      const capabilities = capabilitiesBySite.get(site.id);
      return capabilitySiteIds.has(site.id)
        ? Boolean(capabilities?.can_request_remissions)
        : String(site.site_type ?? "").trim().toLowerCase() === "satellite";
    })
    .map((site) => site.id);
  const { data: remissionAreaRulesData } =
    satelliteSiteIds.length > 0
      ? await supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,purpose,is_enabled")
        .eq("purpose", "remission")
        .eq("is_enabled", true)
        .in("site_id", satelliteSiteIds)
      : { data: [] as Array<{ site_id: string | null; area_kind: string | null }> };
  const remissionAreaKindsBySite = (
    (remissionAreaRulesData ?? []) as Array<{ site_id: string | null; area_kind: string | null }>
  ).reduce(
    (acc, row) => {
      const siteId = String(row.site_id ?? "").trim();
      const areaKind = String(row.area_kind ?? "").trim();
      if (!siteId || !areaKind) return acc;
      const current = acc[siteId] ?? [];
      if (!current.includes(areaKind)) current.push(areaKind);
      acc[siteId] = current;
      return acc;
    },
    {} as Record<string, string[]>
  );

  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];
  const unitsList = (unitsData ?? []) as UnitRow[];

  const defaultStockUnitCode = unitsList[0]?.code ?? "un";
  const defaultUnitOptions = unitsList;

  if (!canCreate) {
    return (
      <div className="ui-scene w-full max-w-none space-y-6">
        <section className="ui-remission-hero ui-fade-up">
          <div className="space-y-2">
            <h1 className="ui-h1">{config.title}</h1>
            <p className="ui-body-muted">{config.subtitle}</p>
          </div>
        </section>
        <div className="ui-alert ui-alert--warn">
          No tienes permiso para crear productos.
        </div>
      </div>
    );
  }

  return (
    <div className="ui-scene w-full space-y-8">
      <NewProductHero
        catalogHref={catalogHref}
        catalogLabel={catalogLabel}
        configTitle={config.title}
        hasRecipe={hasRecipe}
        isAssetItem={isAssetItem}
        normalizedProductType={normalizedProductType}
        typeLabel={typeDisplayLabel(typeKey)}
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {createdMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
          {createdMsg}
        </div>
      ) : null}
      {isOrigoReviewFlow ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          <div className="font-semibold">Creación desde aprobación ORIGO</div>
          <p className="mt-1 text-xs leading-5">
            Este insumo quedará vinculado a la solicitud de recepción. Al guardarlo, NEXO volverá a ORIGO para aprobar la solicitud y continuar el cierre de la recepción pendiente.
          </p>
        </div>
      ) : null}

      <RequiredFieldsGuardForm
        action={createProductAndView}
        className="space-y-8 pb-48 md:pb-36"
        persistKey={`catalog-new-${typeKey}`}
      >
        <input type="hidden" name="_type_key" value={typeKey} />
        <input type="hidden" name="_mode" value="" />
        <CreateRequestKeyField initialValue={createRequestKey} />
        <input type="hidden" name="_after_create" value="create_another" />
        {isOrigoReviewFlow ? (
          <>
            <input type="hidden" name="_origo_review_source" value="origo_receipt_review" />
            <input type="hidden" name="_origo_review_request_id" value={origoReviewRequestId} />
            <input type="hidden" name="_origo_review_source_entry_id" value={origoSourceEntryId} />
            <input type="hidden" name="_origo_review_return_to" value={origoReturnTo} />
          </>
        ) : null}

        <CatalogSection
          title={isAssetItem ? "Identidad del modelo patrimonial" : "Datos básicos"}
          description={
            isAssetItem
              ? "Define cómo se identifica este modelo en el catálogo. Las unidades reales, QR, ubicación y conteo se gestionan en Activos físicos."
              : "Identidad inicial del item: nombre, SKU automático, tipo fijo, categoría operativa y descripción."
          }
        >
          <ProductIdentityFields
            nameLabel={isAssetItem ? "Nombre del modelo / activo" : "Nombre del producto / insumo"}
            namePlaceholder={
              isAssetItem
                ? "Ej. Aire acondicionado, silla terraza, licuadora industrial"
                : typeKey === "preparacion"
                  ? "Ej. Zumo de limón, jarabe base, salsa de la casa"
                  : typeKey === "venta"
                    ? "Ej. Espresso, croissant, cappuccino"
                    : "Ej. Harina 000"
            }
            nameDefaultValue={suggestedName || null}
            categories={categoryRows}
            selectedCategoryId=""
            siteNamesById={siteNamesById}
            categoryLabel={isAssetItem ? "Categoría patrimonial" : "Categoría operativa"}
            categoryEmptyOptionLabel={isAssetItem ? "Selecciona categoría patrimonial" : "Selecciona categoría"}
            categoryRequired
            descriptionLabel={isAssetItem ? "Descripción base del modelo" : "Descripción"}
            descriptionPlaceholder={
              isAssetItem
                ? "Ej. Equipo de aire acondicionado tipo cassette para zona de atención, referencia general del modelo."
                : "Opcional"
            }
            descriptionHint={
              isAssetItem
                ? "Describe el modelo en términos generales. No escribas aquí serial, ubicación, responsable ni mantenimiento real."
                : undefined
            }
            skuField={{
              mode: "create",
              initialProductType: config.productType,
              initialInventoryKind: config.inventoryKind,
              initialName: suggestedName || null,
            }}
            lockedTypeField={{
              label: isAssetItem ? "Tipo de maestro" : "Tipo",
              value: createTypeLabel,
              hiddenName: "product_type",
              hiddenValue: config.productType,
              hint: isAssetItem
                ? "Este maestro sirve para crear activos físicos reales desde el catálogo."
                : "Se define por el flujo de creación y se mantiene bloqueado en edición.",
            }}
          />
        </CatalogSection>

        {/* Receta y producción ahora viven en FOGO */}
        {hasRecipe ? (
          <CatalogOptionalDetails
            title={normalizedProductType === "preparacion" ? "Continuidad en FOGO" : "Receta y producción"}
            summary={
              normalizedProductType === "preparacion"
                ? "FOGO completa receta, rendimiento, mermas, porciones y costo técnico de esta preparación."
                : "NEXO crea el maestro; FOGO completa la receta cuando el producto ya exista."
            }
          >
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
              {normalizedProductType === "preparacion" ? (
                <>
                  <p>
                    NEXO crea el maestro de inventario, sedes y unidad base. FOGO debe publicar la fórmula,
                    el rendimiento y la porción remisionable cuando la preparación esté lista para operar.
                  </p>
                  <p>
                    Mientras no exista porción publicada, NEXO no crea presentaciones operativas temporales.
                  </p>
                </>
              ) : (
                <p>
                  Este producto de venta nace como producto terminado con receta. Crea primero el maestro en NEXO y luego completa BOM, pasos y medios en FOGO.
                </p>
              )}
              <a
                href={buildFogoRecipeCreateUrl(typeKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex ui-btn ui-btn--ghost"
              >
                Abrir FOGO
              </a>
            </div>
          </CatalogOptionalDetails>
        ) : null}

        {isAssetItem ? (
          <CatalogSection
            title="Configuración mínima del modelo patrimonial"
            description="Los activos no usan compra/remisión/stock como insumos. Se guardan campos mínimos para mantener compatibilidad del catálogo."
          >
            <input type="hidden" name="stock_unit_code" value="un" />
            <input type="hidden" name="default_unit" value="un" />
            <input type="hidden" name="unit" value="un" />
            <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
            <input type="hidden" name="measurement_mode" value="fixed_presentation" />
            <input type="hidden" name="default_tolerance_percent" value="0" />
            <input type="hidden" name="aux_count_unit_code" value="" />
            <input type="hidden" name="track_inventory" value="" />
            <input type="hidden" name="lot_tracking" value="" />
            <input type="hidden" name="expiry_tracking" value="" />
            <input type="hidden" name="costing_mode" value="manual" />
            <input type="hidden" name="cost" value="" />
            <input type="hidden" name="price" value="" />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Tipo de inventario</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Activo</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Unidad técnica</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">un</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Stock operativo</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">No aplica aquí</div>
              </div>
            </div>

            <div className="ui-alert ui-alert--warn mt-4">
              La existencia real, ubicación, QR, responsable, mantenimientos y conteos se manejan en Activos físicos.
            </div>
          </CatalogSection>
        ) : (
          <CatalogSection
            title="Unidad base e inventario"
            description="Configura la unidad técnica de stock, trazabilidad y costo. Las presentaciones físicas se administran aparte después de crear el maestro."
          >
            <ProductStorageFields
              stockUnitFieldId={STOCK_UNIT_FIELD_ID}
              units={defaultUnitOptions}
              stockUnitCode={defaultStockUnitCode}
              defaultUnitCode={defaultStockUnitCode}
              defaultUnitHint="Si no coincide con la familia de la unidad base, se guardará automáticamente la unidad base."
              measurementModeField={{
                defaultValue: "fixed_presentation",
                defaultTolerancePercent: null,
                disabled: false,
              }}
              preCostingFields={
                <>
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Tipo de inventario</span>
                    <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
                    <div className="ui-input flex items-center">{lockedInventoryKindText}</div>
                    <span className="text-xs text-[var(--ui-muted)]">
                      Se define por el flujo de creación y se mantiene bloqueado en edición.
                    </span>
                  </label>

                  <input type="hidden" name="aux_count_unit_code" value="" />

                  {normalizedProductType === "venta" ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio base referencial</span>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        className="ui-input"
                        placeholder="Opcional"
                      />
                      <span className="text-xs text-[var(--ui-muted)]">
                        El precio final se configura por sede/canal en la capa comercial.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="price" value="" />
                  )}
                </>
              }
              postCostingFields={
                <>
                  <input type="hidden" name="cost" value="" />
                  <ProductCostStatusPanel
                    hasSuppliers={hasSuppliers}
                    hasRecipe={hasRecipe}
                    hasComputedCost={false}
                    costingMode={hasSuppliers ? "auto_primary_supplier" : "manual"}
                    autoCostReady={!hasSuppliers}
                    autoCostReadinessReason={
                      hasSuppliers ? "proveedor primario, empaque, unidad y precio" : null
                    }
                    currentCost={null}
                  />
                </>
              }
              costingModeField={{
                hasSuppliers,
                defaultValue: hasSuppliers ? "auto_primary_supplier" : "manual",
                autoOptionLabel: "Auto proveedor primario",
              }}
              trackingOptions={{
                trackInventoryDefaultChecked: true,
                lotTrackingDefaultChecked: false,
                expiryTrackingDefaultChecked: false,
              }}
            />
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              Las presentaciones físicas, equivalencias operativas y fotos por presentación se administran en la pantalla dedicada después de crear el producto.
            </div>
          </CatalogSection>
        )}


        {!isAssetItem ? (
          <ProductPurchaseSection
            enabled={hasSuppliers}
            initialRows={[]}
            suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
            units={unitsList}
            stockUnitCode={defaultStockUnitCode}
            stockUnitFieldId={STOCK_UNIT_FIELD_ID}
          />
        ) : null}

        {isAssetItem ? (
          <ProductAssetTechnicalSection
            defaultTemplate="general"
            initialProfile={null}
            initialMaintenance={[]}
            initialTransfers={[]}
            siteOptions={sitesList.map((site) => ({ id: site.id, name: site.name ?? "Sede" }))}
          />
        ) : null}

        {!isAssetItem ? (
          <ProductSiteAvailabilitySection
            initialRows={[]}
            sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
            siteCapabilities={Array.from(capabilitiesBySite.values())}
            areaKinds={areaKindsList.map((a) => ({
              code: a.code,
              name: a.name ?? a.code,
              use_for_remission: Boolean(a.use_for_remission),
            }))}
            siteAreaKinds={siteAreaKindsList}
            productionLocations={productionLocationsList.map((location) => ({
              id: location.id,
              site_id: location.site_id,
              code: location.code,
              zone: location.zone,
              area_kind: Array.isArray(location.area)
                ? location.area[0]?.kind ?? null
                : location.area?.kind ?? null,
            }))}
            remissionAreaKindsBySite={remissionAreaKindsBySite}
            stockUnitCode={defaultStockUnitCode}
            operationUnitHint={buildOperationUnitHintFromUnits({
              units: unitsList,
              inputUnitCode: defaultStockUnitCode,
              stockUnitCode: defaultStockUnitCode,
            })}
            productType={config.productType}
            inventoryKind={config.inventoryKind}
            hasRecipe={hasRecipe}
            defaultSalesEnabled={typeKey === "preparacion_vendible"}
          />
        ) : null}

        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6 sm:px-6">
          <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-3 shadow-xl shadow-black/10 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ui-text)]">
                {isOrigoReviewFlow ? "Crear y vincular con ORIGO" : "Carga en bloque"}
              </p>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                {isOrigoReviewFlow
                  ? "La acción principal guarda el insumo, aprueba la solicitud en ORIGO y vuelve a la bandeja de revisión."
                  : "La acción principal guarda este registro y deja listo el formulario para crear el siguiente."}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center lg:justify-end">
              {isOrigoReviewFlow ? (
                <>
                  <Link href={origoReturnTo} className="ui-btn ui-btn--ghost justify-center">
                    Volver a ORIGO
                  </Link>
                  <button type="submit" formAction={createProductAndView} className="ui-btn ui-btn--brand justify-center">
                    Crear insumo y volver a ORIGO
                  </button>
                </>
              ) : (
                <>
                  <Link href={catalogHref} className="ui-btn ui-btn--ghost justify-center">
                    Volver a {catalogLabel}
                  </Link>
                  <button type="submit" formAction={createProductAndView} className="ui-btn ui-btn--ghost justify-center">
                    Crear y ver ficha
                  </button>
                  <button type="submit" formAction={createProductAndReturnToCatalog} className="ui-btn ui-btn--ghost justify-center">
                    Crear y volver
                  </button>
                  <button type="submit" formAction={createProductAndCreateAnother} className="ui-btn ui-btn--brand justify-center">
                    {createSubmitLabel} y seguir
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </RequiredFieldsGuardForm>
    </div>
  );
}
