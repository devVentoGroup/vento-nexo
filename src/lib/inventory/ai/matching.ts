import { normalizeUnitCode } from "@/lib/inventory/uom";
import type { ParsedLineItem, ProductMatchCandidate } from "@/lib/inventory/ai/types";

type CatalogCandidate = {
  id: string;
  name: string | null;
  sku: string | null;
  stock_unit_code: string | null;
  unit: string | null;
};

type SupplierAliasCandidate = {
  product_id: string;
  alias_text: string;
  supplier_sku: string | null;
  confidence_boost: number | null;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

export function chooseBestMatch(params: {
  line: ParsedLineItem;
  products: CatalogCandidate[];
  aliases: SupplierAliasCandidate[];
}): ProductMatchCandidate[] {
  const lineNameNorm = normalizeText(params.line.name);
  const lineTokens = tokenize(params.line.name);
  const lineSku = (params.line.supplier_sku ?? "").trim().toLowerCase();
  const lineUnit = normalizeUnitCode(params.line.unit || "");

  const scored: ProductMatchCandidate[] = [];

  for (const product of params.products) {
    const productName = String(product.name ?? "");
    const productTokens = tokenize(productName);
    const productUnit = normalizeUnitCode(product.stock_unit_code || product.unit || "");

    let score = 0;
    const reasons: string[] = [];

    const nameExact = normalizeText(productName) === lineNameNorm && lineNameNorm.length > 0;
    if (nameExact) {
      score += 0.72;
      reasons.push("name_exact");
    } else {
      const sim = jaccardSimilarity(lineTokens, productTokens);
      score += sim * 0.62;
      if (sim > 0) reasons.push(`name_fuzzy:${sim.toFixed(2)}`);
    }

    if (lineUnit && productUnit && lineUnit === productUnit) {
      score += 0.1;
      reasons.push("unit_match");
    }

    if (lineSku && product.sku && product.sku.trim().toLowerCase() === lineSku) {
      score += 0.2;
      reasons.push("sku_exact");
    }

    const alias = params.aliases.find((row) => row.product_id === product.id && (
      normalizeText(row.alias_text) === lineNameNorm ||
      (row.supplier_sku && row.supplier_sku.trim().toLowerCase() === lineSku)
    ));
    if (alias) {
      const boost = Number(alias.confidence_boost ?? 0);
      score += 0.18 + (Number.isFinite(boost) ? Math.max(0, Math.min(0.3, boost)) : 0);
      reasons.push("supplier_alias");
    }

    score = Math.max(0, Math.min(1, score));
    if (score > 0) {
      scored.push({
        product_id: product.id,
        score,
        reason: reasons.join(","),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

export function decideMatchStatus(score: number): "matched" | "ambiguous" | "unmatched" {
  if (score >= 0.92) return "matched";
  if (score >= 0.75) return "ambiguous";
  return "unmatched";
}
