import type { InventoryUnit } from "@/lib/inventory/uom";
export type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
};

export type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

export type UnitRow = InventoryUnit;

export type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

export type SupplierRow = {
  id: string;
  name: string | null;
};

export type SearchParams = {
  error?: string;
  ok?: string;
  purchase_order_id?: string;
};

export type ProductProfileRow = {
  product_id: string;
  track_inventory: boolean;
  costing_mode: "auto_primary_supplier" | "manual" | null;
};

export type ProductSupplierCostRow = {
  product_id: string;
  supplier_id: string;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price: number | null;
  purchase_price_net: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
};

export type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  site_id: string | null;
  notes: string | null;
};

export type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  quantity_ordered: number | null;
  quantity_received: number | null;
  unit_cost: number | null;
  unit: string | null;
};

export type EntryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  status: string | null;
  received_at: string | null;
  created_at: string | null;
  site_id: string | null;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}
