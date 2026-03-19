import { createHash } from "node:crypto";

import { roundQuantity } from "@/lib/inventory/uom";

/** Filas mínimas para detectar si bodega cambió LOC/cantidades desde que el conductor abrió el checklist. */
export type PrepareFingerprintSourceRow = {
  id: string;
  quantity?: number | string | null;
  source_location_id?: string | null;
  prepared_quantity?: number | string | null;
  shipped_quantity?: number | string | null;
};

export function buildPrepareFingerprintHash(rows: PrepareFingerprintSourceRow[]): string {
  const payload = [...rows]
    .map((i) => ({
      id: String(i.id ?? "").trim(),
      loc: String(i.source_location_id ?? "").trim(),
      prep: roundQuantity(Number(i.prepared_quantity ?? 0)),
      ship: roundQuantity(Number(i.shipped_quantity ?? 0)),
      qty: roundQuantity(Number(i.quantity ?? 0)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}|${r.loc}|${r.prep}|${r.ship}|${r.qty}`)
    .join(";");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
