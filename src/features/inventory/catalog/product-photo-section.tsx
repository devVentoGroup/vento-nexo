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
  sectionTitle?: string;
  uploadLabel?: string;
};

export function ProductPhotoSection({
  description,
  productId,
  currentUrl,
  existingImageUrls = [],
  footerText,
  collapsible = false,
  sectionTitle = "Foto del producto",
  uploadLabel = "Foto del producto",
}: ProductPhotoSectionProps) {
  const content = (
    <>
      <div className="grid gap-4">
        <ProductImageUpload
          name="image_url"
          label={uploadLabel}
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
        title={sectionTitle}
        summary={description}
      >
        {content}
      </CatalogOptionalDetails>
    );
  }

  return (
    <CatalogSection
      title={sectionTitle}
      description={description}
    >
      {content}
    </CatalogSection>
  );
}
