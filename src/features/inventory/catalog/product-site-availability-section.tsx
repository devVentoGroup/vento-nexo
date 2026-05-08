import { CatalogSection } from "@/features/inventory/catalog/catalog-ui";
import {
  ProductSiteSettingsEditor,
  type SiteSettingLine,
} from "@/features/inventory/catalog/product-site-settings-editor";

type SiteOption = { id: string; name: string | null; site_type?: string | null };
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
  remissionAreaKindsBySite?: Record<string, string[]>;
  stockUnitCode: string;
  purchaseUnitHint?: UnitHint;
  operationUnitHint?: UnitHint;
};

export function ProductSiteAvailabilitySection({
  initialRows,
  sites,
  areaKinds,
  siteAreaKinds,
  productionLocations = [],
  remissionAreaKindsBySite = {},
  stockUnitCode,
  purchaseUnitHint = null,
  operationUnitHint = null,
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
        remissionAreaKindsBySite={remissionAreaKindsBySite}
        stockUnitCode={stockUnitCode}
        purchaseUnitHint={purchaseUnitHint}
        operationUnitHint={operationUnitHint}
      />
    </CatalogSection>
  );
}
