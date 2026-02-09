export type ElementType = "title" | "text" | "barcode_dm" | "barcode_c128" | "barcode_qr";

export type LabelElement = {
  id: string;
  type: ElementType;
  x: number;      // mm from left
  y: number;      // mm from top
  width: number;  // mm
  height: number; // mm
  content: string; // resolved real data or template variable
  fontSize?: number; // ZPL font height in dots
  fontWeight?: "normal" | "bold";
};

export type LabelTemplate = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: "vertical" | "horizontal";
  elements: LabelElement[];
};

export type LocData = {
  code: string;
  description?: string;
  zone?: string;
  site_name?: string;
};

export const DEFAULT_ELEMENT_SIZES: Record<ElementType, { width: number; height: number }> = {
  title:       { width: 40, height: 6 },
  text:        { width: 30, height: 5 },
  barcode_dm:  { width: 15, height: 15 },
  barcode_c128:{ width: 35, height: 10 },
  barcode_qr:  { width: 15, height: 15 },
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  title: "Titulo",
  text: "Texto / Codigo",
  barcode_dm: "DataMatrix",
  barcode_c128: "Code128",
  barcode_qr: "QR Retiro",
};

/** Build the default LOC layout for a given label size */
export function buildLocLayout(
  widthMm: number,
  heightMm: number,
  loc: LocData,
  baseUrl: string
): LabelElement[] {
  const isHorizontal = widthMm > heightMm;
  const ventoCode = `VENTO|LOC|${loc.code}`;
  const qrUrl = `${baseUrl}/inventory/withdraw?loc=${encodeURIComponent(loc.code)}`;

  if (isHorizontal) {
    // Horizontal layout: barcodes left, text right
    const barcodeSize = Math.min(heightMm * 0.7, widthMm * 0.35);
    return [
      { id: "el_title", type: "title", x: widthMm * 0.45, y: 2, width: widthMm * 0.5, height: 6, content: "VENTO · LOC", fontSize: 32, fontWeight: "bold" },
      { id: "el_code", type: "text", x: widthMm * 0.45, y: 10, width: widthMm * 0.5, height: 5, content: loc.code, fontSize: 28, fontWeight: "bold" },
      { id: "el_desc", type: "text", x: widthMm * 0.45, y: 17, width: widthMm * 0.5, height: 4, content: loc.description || loc.zone || "", fontSize: 20, fontWeight: "normal" },
      { id: "el_dm", type: "barcode_dm", x: 2, y: 2, width: barcodeSize, height: barcodeSize, content: ventoCode },
      { id: "el_qr", type: "barcode_qr", x: barcodeSize + 4, y: 2, width: barcodeSize * 0.8, height: barcodeSize * 0.8, content: qrUrl },
    ];
  } else {
    // Vertical layout (default): text top, barcodes middle, code bottom
    const barcodeSize = Math.min(widthMm * 0.42, heightMm * 0.3);
    const barcodeY = heightMm * 0.25;
    return [
      { id: "el_title", type: "title", x: 2, y: 2, width: widthMm - 4, height: 6, content: "VENTO · LOC", fontSize: 32, fontWeight: "bold" },
      { id: "el_desc", type: "text", x: 2, y: 9, width: widthMm - 4, height: 4, content: loc.description || loc.zone || "", fontSize: 20, fontWeight: "normal" },
      { id: "el_dm", type: "barcode_dm", x: 3, y: barcodeY, width: barcodeSize, height: barcodeSize, content: ventoCode },
      { id: "el_qr", type: "barcode_qr", x: widthMm - barcodeSize - 3, y: barcodeY, width: barcodeSize, height: barcodeSize, content: qrUrl },
      { id: "el_code", type: "text", x: 2, y: heightMm - 12, width: widthMm - 4, height: 6, content: loc.code, fontSize: 28, fontWeight: "bold" },
    ];
  }
}
