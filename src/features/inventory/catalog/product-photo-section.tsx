import {
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";

type ProductPhotoSectionProps = {
  description: string;
  productId: string;
  currentUrl: string | null;
  existingImageUrls?: string[];
  footerText?: string;
  collapsible?: boolean;
};

export function ProductPhotoSection({
  description,
  productId,
  currentUrl,
  existingImageUrls = [],
  footerText,
  collapsible = false,
}: ProductPhotoSectionProps) {
  const content = (
    <>
      <div className="grid gap-4">
        <ProductImageUpload
          name="image_url"
          label="Foto del producto"
          currentUrl={currentUrl}
          existingImageUrls={existingImageUrls}
          productId={productId}
          kind="product"
        />
      </div>
      {footerText ? <div className="text-xs text-[var(--ui-muted)]">{footerText}</div> : null}
    </>
  );

  if (collapsible) {
    return (
      <CatalogOptionalDetails
        title="Foto del producto"
        summary={description}
      >
        {content}
      </CatalogOptionalDetails>
    );
  }

  return (
    <CatalogSection
      title="Foto del producto"
      description={description}
    >
      {content}
    </CatalogSection>
  );
}
