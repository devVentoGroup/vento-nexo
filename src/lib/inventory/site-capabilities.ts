export type SiteOperationalCapabilities = {
  site_id: string;
  can_request_remissions: boolean;
  can_fulfill_remissions: boolean;
  can_receive_remissions: boolean;
  can_sell: boolean;
  can_produce: boolean;
  can_hold_inventory: boolean;
  is_commercial_business: boolean;
  show_in_product_setup: boolean;
};

export const DEFAULT_SITE_CAPABILITIES: Omit<SiteOperationalCapabilities, "site_id"> = {
  can_request_remissions: false,
  can_fulfill_remissions: false,
  can_receive_remissions: false,
  can_sell: false,
  can_produce: false,
  can_hold_inventory: false,
  is_commercial_business: false,
  show_in_product_setup: true,
};

export function normalizeSiteCapabilities(
  siteId: string,
  row?: Partial<SiteOperationalCapabilities> | null
): SiteOperationalCapabilities {
  return {
    site_id: siteId,
    can_request_remissions: Boolean(row?.can_request_remissions),
    can_fulfill_remissions: Boolean(row?.can_fulfill_remissions),
    can_receive_remissions: Boolean(row?.can_receive_remissions),
    can_sell: Boolean(row?.can_sell),
    can_produce: Boolean(row?.can_produce),
    can_hold_inventory: Boolean(row?.can_hold_inventory),
    is_commercial_business: Boolean(row?.is_commercial_business),
    show_in_product_setup:
      typeof row?.show_in_product_setup === "boolean"
        ? row.show_in_product_setup
        : DEFAULT_SITE_CAPABILITIES.show_in_product_setup,
  };
}

export function getSiteCapabilitiesMap(
  siteIds: string[],
  rows: Array<Partial<SiteOperationalCapabilities> | null | undefined>
): Map<string, SiteOperationalCapabilities> {
  const bySite = new Map<string, Partial<SiteOperationalCapabilities>>();
  for (const row of rows) {
    const siteId = String(row?.site_id ?? "").trim();
    if (!siteId) continue;
    bySite.set(siteId, row ?? {});
  }

  return new Map(
    siteIds.map((siteId) => [
      siteId,
      normalizeSiteCapabilities(siteId, bySite.get(siteId)),
    ])
  );
}
