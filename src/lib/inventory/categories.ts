import { getCategoryDomainBusinessLabel, getCategoryDomainLabel } from "@/lib/constants";

export const CATEGORY_KINDS = ["insumo", "preparacion", "venta", "equipo"] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_SCOPES = ["all", "global", "site"] as const;

export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

export type InventoryCategoryRow = {
  id: string;
  name: string;
  description?: string | null;
  parent_id: string | null;
  domain: string | null;
  site_id: string | null;
  applies_to_kinds?: string[] | null;
  is_active?: boolean | null;
};

type CategoryMetaLabelOptions = {
  domainLabelMode?: "domain" | "channel";
  useBusinessDomainLabel?: boolean;
};

const ROOT_UUID = "00000000-0000-0000-0000-000000000000";

function normalizeValue(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function normalizeCategoryKind(value: string | null | undefined): CategoryKind | null {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) return null;
  return CATEGORY_KINDS.find((kind) => kind === normalized) ?? null;
}

export function normalizeCategoryScope(value: string | null | undefined): CategoryScope {
  const normalized = normalizeValue(value).toLowerCase();
  if (normalized === "global" || normalized === "site") return normalized;
  return "all";
}

export function normalizeCategoryDomain(value: string | null | undefined): string {
  return normalizeValue(value).toUpperCase();
}

export function categoryKindFromProduct(params: {
  productType: string | null | undefined;
  inventoryKind?: string | null | undefined;
}): CategoryKind {
  const inventoryKind = normalizeValue(params.inventoryKind).toLowerCase();
  if (inventoryKind === "asset") return "equipo";

  const productType = normalizeValue(params.productType).toLowerCase();
  if (productType === "venta") return "venta";
  if (productType === "preparacion") return "preparacion";
  return "insumo";
}

export function categoryKindFromCatalogTab(tab: string | null | undefined): CategoryKind {
  const normalized = normalizeValue(tab).toLowerCase();
  if (normalized === "productos") return "venta";
  if (normalized === "preparaciones") return "preparacion";
  if (normalized === "equipos") return "equipo";
  return "insumo";
}

export function shouldShowCategoryDomain(kind: CategoryKind | null): boolean {
  return kind === "venta";
}

export function parseCategoryKinds(value: string[] | null | undefined): CategoryKind[] {
  if (!Array.isArray(value)) return [];
  const parsed = value
    .map((item) => normalizeCategoryKind(item))
    .filter((item): item is CategoryKind => Boolean(item));
  return Array.from(new Set(parsed));
}

export function categorySupportsKind(row: InventoryCategoryRow, kind: CategoryKind | null): boolean {
  if (!kind) return true;
  const rowKinds = parseCategoryKinds(row.applies_to_kinds);
  if (rowKinds.length === 0) return true;
  return rowKinds.includes(kind);
}

function categorySupportsDomain(
  row: InventoryCategoryRow,
  kind: CategoryKind | null,
  domain: string
): boolean {
  if (!domain) return true;
  if (kind !== "venta") return true;
  const rowDomain = normalizeCategoryDomain(row.domain);
  return !rowDomain || rowDomain === domain;
}

function categorySupportsScope(
  row: InventoryCategoryRow,
  scope: CategoryScope,
  siteId: string
): boolean {
  const rowSiteId = normalizeValue(row.site_id);
  if (scope === "global") {
    return !rowSiteId;
  }
  if (scope === "site") {
    if (!siteId) return !rowSiteId;
    return !rowSiteId || rowSiteId === siteId;
  }
  return true;
}

function collectAncestorIds(
  map: Map<string, InventoryCategoryRow>,
  categoryId: string
): Set<string> {
  const result = new Set<string>();
  let current = map.get(categoryId);
  let safety = 0;
  while (current?.parent_id && safety < 20) {
    result.add(current.parent_id);
    current = map.get(current.parent_id);
    safety += 1;
  }
  return result;
}

export function collectDescendantIds(
  map: Map<string, InventoryCategoryRow>,
  rootId: string
): Set<string> {
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  let safety = 0;
  while (queue.length > 0 && safety < 4000) {
    const current = queue.shift();
    if (!current) break;
    for (const [id, row] of map) {
      if (row.parent_id === current && !result.has(id)) {
        result.add(id);
        queue.push(id);
      }
    }
    safety += 1;
  }
  return result;
}

export function getCategoryPath(
  categoryId: string | null | undefined,
  categoryMap: Map<string, InventoryCategoryRow>
): string {
  const normalizedId = normalizeValue(categoryId);
  if (!normalizedId) return "Sin categoria";

  const parts: string[] = [];
  let current = categoryMap.get(normalizedId);
  let safety = 0;
  while (current && safety < 12) {
    parts.unshift(current.name);
    current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
    safety += 1;
  }

  return parts.length ? parts.join(" / ") : "Sin categoria";
}

export function buildCategoryMetaLabel(
  row: InventoryCategoryRow,
  siteNameMap?: Map<string, string>,
  options?: CategoryMetaLabelOptions
): string {
  const badges: string[] = [];
  const siteId = normalizeValue(row.site_id);
  const domain = normalizeCategoryDomain(row.domain);

  if (!siteId) {
    badges.push("Global");
  } else {
    badges.push(`Sede: ${siteNameMap?.get(siteId) ?? siteId}`);
  }

  if (domain) {
    const useBusinessDomainLabel = Boolean(options?.useBusinessDomainLabel);
    const domainLabel = useBusinessDomainLabel
      ? getCategoryDomainBusinessLabel(domain)
      : getCategoryDomainLabel(domain);
    const prefix = options?.domainLabelMode === "channel" ? "Canal" : "Dominio";
    badges.push(`${prefix}: ${domainLabel}`);
  }

  return badges.join(" | ");
}

export function getCategoryChannelLabel(domain: string | null | undefined): string {
  return getCategoryDomainBusinessLabel(domain);
}

export function buildCategoryFilterState(params: {
  kind?: string | null;
  domain?: string | null;
  scope?: string | null;
  siteId?: string | null;
}) {
  const kind = normalizeCategoryKind(params.kind ?? null);
  const scope = normalizeCategoryScope(params.scope ?? null);
  const siteId = normalizeValue(params.siteId);
  const domain = shouldShowCategoryDomain(kind)
    ? normalizeCategoryDomain(params.domain ?? null)
    : "";

  return {
    kind,
    scope,
    siteId,
    domain,
  };
}

export function categoryMatchesFilter(
  row: InventoryCategoryRow,
  params: {
    kind?: string | null;
    domain?: string | null;
    scope?: string | null;
    siteId?: string | null;
    ignoreKind?: boolean;
  }
): boolean {
  const { kind, scope, siteId, domain } = buildCategoryFilterState(params);
  if (!params.ignoreKind && !categorySupportsKind(row, kind)) return false;
  if (!categorySupportsDomain(row, kind, domain)) return false;
  if (!categorySupportsScope(row, scope, siteId)) return false;
  return true;
}

export function filterCategoryRowsDirect(
  rows: InventoryCategoryRow[],
  params: {
    kind?: string | null;
    domain?: string | null;
    scope?: string | null;
    siteId?: string | null;
    includeInactive?: boolean;
  }
): InventoryCategoryRow[] {
  const includeInactive = Boolean(params.includeInactive);
  const activeRows = includeInactive
    ? rows
    : rows.filter((row) => row.is_active !== false);
  return activeRows.filter((row) => categoryMatchesFilter(row, params));
}

export function filterCategoryRows(
  rows: InventoryCategoryRow[],
  params: {
    kind?: string | null;
    domain?: string | null;
    scope?: string | null;
    siteId?: string | null;
    includeInactive?: boolean;
  }
): InventoryCategoryRow[] {
  const includeInactive = Boolean(params.includeInactive);
  const poolRows = includeInactive
    ? rows
    : rows.filter((row) => row.is_active !== false);
  const matchedRows = poolRows.filter((row) => categoryMatchesFilter(row, params));
  const allMap = new Map(poolRows.map((row) => [row.id, row]));

  const visibleIds = new Set(matchedRows.map((row) => row.id));
  const filterState = buildCategoryFilterState(params);
  for (const row of matchedRows) {
    for (const ancestorId of collectAncestorIds(allMap, row.id)) {
      const ancestor = allMap.get(ancestorId);
      if (!ancestor) continue;
      if (!categoryMatchesFilter(ancestor, { ...filterState, ignoreKind: true })) continue;
      visibleIds.add(ancestorId);
    }
  }

  const result = poolRows.filter((row) => visibleIds.has(row.id));
  const resultMap = new Map(result.map((row) => [row.id, row]));

  return result.sort((a, b) => {
    const pathA = getCategoryPath(a.id, resultMap);
    const pathB = getCategoryPath(b.id, resultMap);
    return pathA.localeCompare(pathB, "es");
  });
}

export function getCategoryDomainCodes(
  rows: InventoryCategoryRow[],
  kind: CategoryKind | null
): string[] {
  if (!shouldShowCategoryDomain(kind)) return [];

  const values = new Set<string>();
  for (const row of rows) {
    if (!categorySupportsKind(row, kind)) continue;
    const normalized = normalizeCategoryDomain(row.domain);
    if (normalized) values.add(normalized);
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b, "es"));
}

export function categoryScopeUniqKey(row: InventoryCategoryRow): string {
  const site = normalizeValue(row.site_id) || ROOT_UUID;
  const parent = normalizeValue(row.parent_id) || ROOT_UUID;
  const domain = normalizeCategoryDomain(row.domain);
  return `${site}|${parent}|${domain}|${row.name.toLowerCase()}`;
}

export function categoryKindsToText(kinds: CategoryKind[]): string {
  return kinds.join(", ");
}

export function isSalesOnlyCategoryKinds(kinds: CategoryKind[]): boolean {
  return kinds.length > 0 && kinds.every((kind) => kind === "venta");
}

export function buildCategorySuggestedDescription(params: {
  name: string;
  kinds: CategoryKind[];
}): string {
  const cleanName = normalizeValue(params.name);
  if (!cleanName) return "";
  if (isSalesOnlyCategoryKinds(params.kinds)) return "";

  const examples: string[] = [];
  if (params.kinds.includes("insumo")) {
    examples.push("materias primas, insumos de uso diario y consumibles");
  }
  if (params.kinds.includes("preparacion")) {
    examples.push("bases, premezclas, salsas y mise en place");
  }
  if (params.kinds.includes("equipo")) {
    examples.push("utensilios, herramientas y activos operativos");
  }

  const detail =
    examples.length > 0
      ? examples.join("; ")
      : "insumos o preparaciones relacionadas con la operacion";

  return `Categoria orientativa para ${cleanName}. Puede incluir ${detail}.`;
}

export function resolveCategoryDescription(params: {
  description?: string | null;
  name: string;
  kinds: CategoryKind[];
}): string {
  const explicitDescription = normalizeValue(params.description ?? "");
  if (explicitDescription) return explicitDescription;
  return buildCategorySuggestedDescription({ name: params.name, kinds: params.kinds });
}
