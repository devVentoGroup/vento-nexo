import { CatalogSection } from "@/features/inventory/catalog/catalog-ui";
import {
  ProductSiteSettingsEditor,
  type SiteSettingLine,
} from "@/features/inventory/catalog/product-site-settings-editor";

type SiteOption = { id: string; name: string | null; site_type?: string | null };
type SiteCapabilities = {
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
type AreaKindOption = { code: string; name: string; use_for_remission?: boolean | null };
type SiteAreaKindOption = { site_id: string; kind: string };
type ProductionLocationOption = {
  id: string;
  site_id: string;
  code: string;
  zone?: string | null;
};
type UnitHint = {
  label: string;
  inputUnitCode: string;
  qtyInInputUnit: number;
  qtyInStockUnit: number;
} | null;

type ProductSiteAvailabilitySectionProps = {
  initialRows: SiteSettingLine[];
  sites: SiteOption[];
  areaKinds: AreaKindOption[];
  siteAreaKinds: SiteAreaKindOption[];
  productionLocations?: ProductionLocationOption[];
  siteCapabilities?: SiteCapabilities[];
  remissionAreaKindsBySite?: Record<string, string[]>;
  stockUnitCode: string;
  purchaseUnitHint?: UnitHint;
  operationUnitHint?: UnitHint;
  productType?: string | null;
  inventoryKind?: string | null;
  hasRecipe?: boolean;
};

export function ProductSiteAvailabilitySection({
  initialRows,
  sites,
  areaKinds,
  siteAreaKinds,
  productionLocations = [],
  siteCapabilities = [],
  remissionAreaKindsBySite = {},
  stockUnitCode,
  purchaseUnitHint = null,
  operationUnitHint = null,
  productType = null,
  inventoryKind = null,
  hasRecipe = false,
}: ProductSiteAvailabilitySectionProps) {
  return (
    <CatalogSection
      title="Disponibilidad por sede"
      description="Define en que sedes opera este producto, el area sugerida y el setup de abastecimiento interno."
    >
      <ProductSiteSettingsEditor
        name="site_settings_lines"
        initialRows={initialRows}
        sites={sites}
        areaKinds={areaKinds}
        siteAreaKinds={siteAreaKinds}
        productionLocations={productionLocations}
        siteCapabilities={siteCapabilities}
        remissionAreaKindsBySite={remissionAreaKindsBySite}
        stockUnitCode={stockUnitCode}
        purchaseUnitHint={purchaseUnitHint}
        operationUnitHint={operationUnitHint}
        productType={productType}
        inventoryKind={inventoryKind}
        hasRecipe={hasRecipe}
      />
    </CatalogSection>
  );
}
