import sharp from "sharp";

export const CATALOG_IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 365;
export const CATALOG_IMAGE_MAX_EDGE = 1024;

export async function optimizeCatalogImage(input: Buffer): Promise<Buffer> {
  return sharp(input, {
    animated: true,
    failOn: "none",
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .resize({
      width: CATALOG_IMAGE_MAX_EDGE,
      height: CATALOG_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 88,
      alphaQuality: 100,
      effort: 5,
      smartSubsample: true,
    })
    .toBuffer();
}
