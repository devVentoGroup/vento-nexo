import { CatalogSection } from "@/features/inventory/catalog/catalog-ui";
import {
  ProductSiteSettingsEditor,
  type SiteSettingLine,
} from "@/features/inventory/catalog/product-site-settings-editor";

type SiteOption = { id: string; name: string | null; site_type?: string | null };
type AreaKindOption = { code: string; name: string };
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
  stockUnitCode: string;
  purchaseUnitHint?: UnitHint;
  operationUnitHint?: UnitHint;
};

export function ProductSiteAvailabilitySection({
  initialRows,
  sites,
  areaKinds,
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
        stockUnitCode={stockUnitCode}
        purchaseUnitHint={purchaseUnitHint}
        operationUnitHint={operationUnitHint}
      />
    </CatalogSection>
  );
}
