export type ElementType = "title" | "text" | "barcode_dm" | "barcode_c128" | "barcode_qr";

export type LabelElement = {
  id: string;
  type: ElementType;
  x: number;      // mm from left
  y: number;      // mm from top
  width: number;  // mm
  height: number; // mm
  content: string; // text or variable: "{code}", "{note}", "VENTO"
  fontSize?: number; // ZPL font height in dots
  fontWeight?: "normal" | "bold";
};

export type LabelTemplate = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  elements: LabelElement[];
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
  text: "Texto",
  barcode_dm: "DataMatrix",
  barcode_c128: "Code128",
  barcode_qr: "QR",
};
