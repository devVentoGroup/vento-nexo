/**
 * Códigos de dominio/marca para categorías de productos (p. ej. Saudo, Vento Café).
 * Usado en filtros y etiquetas para distinguir categorías por punto de venta.
 */
export const CATEGORY_DOMAIN_LABELS: Record<string, string> = {
  SAU: "Saudo",
  VCF: "Vento Café",
  CP: "Centro de Producción",
  VGR: "Vento Group",
};

export function getCategoryDomainLabel(domain: string | null | undefined): string {
  if (!domain) return "";
  return CATEGORY_DOMAIN_LABELS[domain] ?? domain;
}
