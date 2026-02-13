/**
 * Category domain codes used by sales categories.
 * The value identifies the brand/POS where the category is specific.
 */
export const CATEGORY_DOMAIN_LABELS: Record<string, string> = {
  SAU: "Saudo",
  VCF: "Vento Cafe",
  CP: "Centro de Produccion",
  VGR: "Vento Group",
};

export const CATEGORY_DOMAIN_DEFAULT_ORDER = ["SAU", "VCF", "CP", "VGR"] as const;

export function normalizeCategoryDomain(domain: string | null | undefined): string {
  return String(domain ?? "").trim().toUpperCase();
}

export function getCategoryDomainLabel(domain: string | null | undefined): string {
  const normalized = normalizeCategoryDomain(domain);
  if (!normalized) return "";
  return CATEGORY_DOMAIN_LABELS[normalized] ?? normalized;
}

export function getCategoryDomainOptions(domains: string[]): Array<{ value: string; label: string }> {
  const values = new Set<string>();
  for (const domain of domains) {
    const normalized = normalizeCategoryDomain(domain);
    if (normalized) values.add(normalized);
  }

  const sorted = Array.from(values).sort((a, b) => {
    const ia = CATEGORY_DOMAIN_DEFAULT_ORDER.indexOf(a as (typeof CATEGORY_DOMAIN_DEFAULT_ORDER)[number]);
    const ib = CATEGORY_DOMAIN_DEFAULT_ORDER.indexOf(b as (typeof CATEGORY_DOMAIN_DEFAULT_ORDER)[number]);
    const wa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const wb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (wa !== wb) return wa - wb;
    return a.localeCompare(b, "es");
  });

  return sorted.map((value) => ({
    value,
    label: getCategoryDomainLabel(value),
  }));
}
