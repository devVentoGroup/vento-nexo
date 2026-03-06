import { createHash } from "node:crypto";

import type {
  IngestionFlowType,
  ParsedDocument,
  ParsedLineItem,
  ProductMatchCandidate,
} from "@/lib/inventory/ai/types";
import { buildNewProductProposal, resolveEntryUnitConversion, resolveNetAndGrossUnitPrice } from "@/lib/inventory/ai/workflows";
import { chooseBestMatch, decideMatchStatus } from "@/lib/inventory/ai/matching";
import { normalizeUnitCode, type InventoryUnit } from "@/lib/inventory/uom";

export const AI_DOC_BUCKET = "nexo-ai-documents";
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
export const MAX_FILE_SIZE = 12 * 1024 * 1024;

export function parseFlowType(value: string): IngestionFlowType {
  return value === "supplier_entries" ? "supplier_entries" : "catalog_create";
}

export function inferSourceTypeFromMime(mime: string): "pdf" | "image" {
  return mime.includes("pdf") ? "pdf" : "image";
}

export function computeSha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function fileExtensionFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

type CatalogProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type SupplierAliasRow = {
  product_id: string;
  alias_text: string;
  supplier_sku: string | null;
  confidence_boost: number | null;
};

export function buildItemSuggestions(params: {
  parsed: ParsedDocument;
  flowType: IngestionFlowType;
  products: CatalogProductRow[];
  aliases: SupplierAliasRow[];
  units: InventoryUnit[];
}) {
  const items = params.parsed.lines.map((line: ParsedLineItem) => {
    const candidates = chooseBestMatch({
      line,
      products: params.products,
      aliases: params.aliases,
    });
    const best = candidates[0] ?? null;
    const bestScore = Number(best?.score ?? line.confidence ?? 0.5);
    const matchStatus = decideMatchStatus(bestScore);
    const chosenProduct = best ? params.products.find((p) => p.id === best.product_id) ?? null : null;
    const stockUnitCode = normalizeUnitCode(chosenProduct?.stock_unit_code || chosenProduct?.unit || line.unit || "un");
    const inputUnitCode = normalizeUnitCode(line.unit || stockUnitCode);

    let entryProposal: Record<string, unknown> | null = null;
    if (params.flowType === "supplier_entries" && chosenProduct) {
      const conv = resolveEntryUnitConversion({
        inputQty: line.quantity,
        inputUnitCode,
        stockUnitCode,
        units: params.units,
      });
      const pricing = resolveNetAndGrossUnitPrice({
        unitPrice: line.unit_price,
        taxIncluded: line.tax_included,
        taxRate: line.tax_rate,
      });
      const netUnitCostStock =
        conv.conversionFactorToStock > 0
          ? pricing.net / conv.conversionFactorToStock
          : 0;
      const grossUnitCostStock =
        conv.conversionFactorToStock > 0
          ? pricing.gross / conv.conversionFactorToStock
          : null;
      entryProposal = {
        product_id: chosenProduct.id,
        quantity_received_stock: conv.qtyStock,
        stock_unit_code: conv.stockUnitCode,
        input_qty: line.quantity,
        input_unit_code: conv.inputUnitCode,
        conversion_factor_to_stock: conv.conversionFactorToStock,
        net_unit_cost_stock: netUnitCostStock,
        gross_unit_cost_stock: grossUnitCostStock,
        tax_included: line.tax_included,
        tax_rate: line.tax_rate,
        line_total_cost: conv.qtyStock * netUnitCostStock,
      };
    }

    return {
      line_no: line.line_no,
      raw_payload: line,
      normalized_payload: {
        match_candidates: candidates,
        best_match: best,
        selected_product_id: best?.product_id ?? null,
        new_product_proposal: buildNewProductProposal(line),
        entry_proposal: entryProposal,
      },
      match_status: matchStatus,
      confidence: bestScore,
      review_status: "needs_review",
      topMatches: candidates as ProductMatchCandidate[],
    };
  });

  return items;
}
