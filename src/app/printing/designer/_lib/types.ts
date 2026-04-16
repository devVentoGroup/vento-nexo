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
  barcode_qr: "QR LOC",
};

/** Build the default LOC layout for a given label size */
export function buildLocLayout(
  widthMm: number,
  heightMm: number,
  loc: LocData,
  baseUrl: string
): LabelElement[] {
  const isHorizontal = widthMm > heightMm;
  const qrUrl = `${baseUrl}/inventory/locations/open?loc=${encodeURIComponent(loc.code)}`;

  if (isHorizontal) {
    // Horizontal: text top-right, QR left, code bottom-right
    const bcSize = Math.min(heightMm * 0.55, 18); // cap at 18mm
    return [
      { id: "el_qr", type: "barcode_qr", x: 3, y: 3, width: bcSize, height: bcSize, content: qrUrl },
      { id: "el_title", type: "title", x: bcSize + 6, y: 3, width: widthMm - bcSize - 8, height: 6, content: "VENTO · LOC", fontSize: 28, fontWeight: "bold" },
      { id: "el_desc", type: "text", x: bcSize + 6, y: 10, width: widthMm - bcSize - 8, height: 4, content: loc.description || loc.zone || "", fontSize: 18, fontWeight: "normal" },
      { id: "el_code", type: "text", x: bcSize + 6, y: heightMm - 10, width: widthMm - bcSize - 8, height: 6, content: loc.code, fontSize: 26, fontWeight: "bold" },
    ];
  } else {
    // Vertical: title top, description, QR in middle, code bottom
    const bcSize = Math.min(widthMm * 0.38, 18); // cap at 18mm
    const barcodeY = 16;
    return [
      { id: "el_title", type: "title", x: 2, y: 2, width: widthMm - 4, height: 5, content: "VENTO · LOC", fontSize: 28, fontWeight: "bold" },
      { id: "el_desc", type: "text", x: 2, y: 8, width: widthMm - 4, height: 4, content: loc.description || loc.zone || "", fontSize: 20, fontWeight: "normal" },
      { id: "el_qr", type: "barcode_qr", x: Math.max(2, (widthMm - bcSize) / 2), y: barcodeY, width: bcSize, height: bcSize, content: qrUrl },
      { id: "el_code", type: "text", x: 2, y: barcodeY + bcSize + 3, width: widthMm - 4, height: 6, content: loc.code, fontSize: 26, fontWeight: "bold" },
    ];
  }
}
