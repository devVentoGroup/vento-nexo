import type { Preset } from "./types";

export const SETTINGS_KEY = "vento-nexo:printing:settings:v1";

export const PRESETS: Preset[] = [
  {
    id: "LOC_50x70_DM",
    label: "LOC 50×70 DataMatrix grande",
    widthMm: 50,
    heightMm: 70,
    columns: 1,
    defaultBarcodeKind: "datamatrix",
    defaultCode128HeightDots: 120,
    defaultDmModuleDots: 8,
    defaultType: "LOC",
  },
  {
    id: "LOC_50x70_QR",
    label: "LOC 50×70 QR grande",
    widthMm: 50,
    heightMm: 70,
    columns: 1,
    defaultBarcodeKind: "datamatrix",
    defaultCode128HeightDots: 120,
    defaultDmModuleDots: 4,
    defaultType: "LOC",
  },
  {
    id: "SKU_32x25_3UP",
    label: "SKU/Producto 32×25 (3 etiquetas por fila)",
    widthMm: 105,
    heightMm: 25,
    columns: 3,
    defaultBarcodeKind: "code128",
    defaultCode128HeightDots: 55,
    defaultDmModuleDots: 4,
    defaultType: "SKU",
  },
  {
    id: "PROD_50x30",
    label: "PROD 50×30 (Code128)",
    widthMm: 50,
    heightMm: 30,
    columns: 1,
    defaultBarcodeKind: "code128",
    defaultCode128HeightDots: 60,
    defaultDmModuleDots: 4,
    defaultType: "PROD",
  },
];

export const BROWSERPRINT_CORE = "/zebra/BrowserPrint.min.js";
export const BROWSERPRINT_ZEBRA = "/zebra/BrowserPrint-Zebra.min.js";
export const LOCS_API = "/api/inventory/locations?limit=500";
