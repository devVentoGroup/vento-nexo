import { CatalogSection } from "@/features/inventory/catalog/catalog-ui";
import {
  ProductSuppliersEditor,
  type SupplierLine,
} from "@/features/inventory/catalog/product-suppliers-editor";
import type { InventoryUnit } from "@/lib/inventory/uom";

type SupplierOption = { id: string; name: string | null };

type ProductPurchaseSectionProps = {
  enabled: boolean;
  initialRows: SupplierLine[];
  suppliers: SupplierOption[];
  units: InventoryUnit[];
  stockUnitCode: string;
  stockUnitFieldId: string;
};

export function ProductPurchaseSection({
  enabled,
  initialRows,
  suppliers,
  units,
  stockUnitCode,
  stockUnitFieldId,
}: ProductPurchaseSectionProps) {
  if (!enabled) {
    return <input type="hidden" name="supplier_lines" value="[]" />;
  }

  return (
    <CatalogSection
      title="Compra principal (proveedor)"
      description="Define empaque, unidad y precio de compra. El sistema convierte todo a unidad base."
    >
      <ProductSuppliersEditor
        name="supplier_lines"
        initialRows={initialRows}
        suppliers={suppliers}
        units={units.map((unit) => ({
          code: unit.code,
          name: unit.name,
          family: unit.family,
          factor_to_base: unit.factor_to_base,
        }))}
        stockUnitCode={stockUnitCode}
        stockUnitCodeFieldId={stockUnitFieldId}
        mode="simple"
      />
    </CatalogSection>
  );
}
