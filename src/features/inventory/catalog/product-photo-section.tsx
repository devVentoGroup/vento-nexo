import { CatalogSection } from "@/features/inventory/catalog/catalog-ui";
import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";

type ProductPhotoSectionProps = {
  description: string;
  productId: string;
  currentUrl: string | null;
  footerText?: string;
};

export function ProductPhotoSection({
  description,
  productId,
  currentUrl,
  footerText,
}: ProductPhotoSectionProps) {
  return (
    <CatalogSection
      title="Foto del producto"
      description={description}
    >
      <div className="grid gap-4">
        <ProductImageUpload
          name="image_url"
          label="Foto del producto"
          currentUrl={currentUrl}
          productId={productId}
          kind="product"
        />
      </div>
      {footerText ? <div className="text-xs text-[var(--ui-muted)]">{footerText}</div> : null}
    </CatalogSection>
  );
}
