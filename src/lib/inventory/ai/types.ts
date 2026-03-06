export type IngestionFlowType = "catalog_create" | "supplier_entries";
export type IngestionSourceType = "pdf" | "image";

export type ParsedLineItem = {
  line_no: number;
  raw_text: string;
  supplier_sku: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  tax_rate: number | null;
  tax_included: boolean | null;
  line_total: number | null;
  confidence: number;
  normalization_notes?: string[];
};

export type ParsedDocument = {
  supplier_name: string | null;
  document_number: string | null;
  document_date: string | null;
  currency: string | null;
  lines: ParsedLineItem[];
};

export type ProductMatchCandidate = {
  product_id: string;
  score: number;
  reason: string;
};

export type NewProductProposal = {
  name: string;
  product_type: "insumo" | "preparacion" | "venta";
  stock_unit_code: string;
  purchase_uom: {
    label: string;
    input_unit_code: string;
    qty_in_input_unit: number;
    qty_in_stock_unit: number;
  } | null;
  initial_cost_net: number | null;
};

export type EntryProposal = {
  product_id: string;
  quantity_received_stock: number;
  stock_unit_code: string;
  input_qty: number;
  input_unit_code: string;
  conversion_factor_to_stock: number;
  net_unit_cost_stock: number;
  gross_unit_cost_stock: number | null;
  tax_included: boolean | null;
  tax_rate: number | null;
  line_total_cost: number;
};

export type ApprovalAction =
  | { item_id: string; action: "reject" }
  | { item_id: string; action: "create_product"; payload?: Partial<NewProductProposal> }
  | { item_id: string; action: "use_existing"; payload: { product_id: string } }
  | {
      item_id: string;
      action: "create_entry";
      payload: {
        product_id: string;
        location_id: string;
        quantity_received_stock: number;
        stock_unit_code: string;
        input_qty: number;
        input_unit_code: string;
        conversion_factor_to_stock: number;
        net_unit_cost_stock: number;
        gross_unit_cost_stock: number | null;
        tax_included: boolean | null;
        tax_rate: number | null;
      };
    };
