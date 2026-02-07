export type BarcodeKind = "datamatrix" | "code128";
export type BarcodeVisualKind = "code128" | "datamatrix" | "qrcode";

export type BrowserPrintDevice = {
  uid?: string;
  name?: string;
  deviceType?: string;
  type?: string;
  send?: (data: string, onSuccess: () => void, onError: (err: unknown) => void) => void;
};

export type BrowserPrintDevices =
  | BrowserPrintDevice[]
  | { devices?: BrowserPrintDevice[]; device?: BrowserPrintDevice[] }
  | Record<string, BrowserPrintDevice>;

export type BrowserPrintApi = {
  getLocalDevices: (
    success: (devices: BrowserPrintDevices) => void,
    error: (err: unknown) => void,
    type?: string
  ) => void;
  getDefaultDevice?: (
    type: string,
    success: (device: BrowserPrintDevice) => void,
    error: (err: unknown) => void
  ) => void;
};

export type Preset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  columns: number;
  defaultBarcodeKind: BarcodeKind;
  defaultCode128HeightDots: number;
  defaultDmModuleDots: number;
  defaultType: "LOC" | "SKU" | "PROD";
};

export type LocRow = {
  id: string;
  code: string;
  description?: string | null;
  zone?: string | null;
  site_id?: string | null;
  created_at?: string | null;
};

export type PreviewMode = "auto" | "real" | "mock";

export type PrinterSettings = {
  presetId?: string;
  dpi?: number;
  offsetXmm?: number;
  offsetYmm?: number;
  showAdvanced?: boolean;
};

export type StoredPrinterSettings = {
  version: 1;
  byPrinter: Record<string, PrinterSettings>;
};

declare global {
  interface Window {
    BrowserPrint?: BrowserPrintApi;
  }
}
