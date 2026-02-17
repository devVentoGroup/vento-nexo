import type { PostgrestError } from "@supabase/supabase-js";

type SkuTypeParams = {
  productType?: string | null;
  inventoryKind?: string | null;
};

type SkuPreviewParams = SkuTypeParams & {
  name?: string | null;
};

type GenerateNextSkuParams = SkuPreviewParams & {
  supabase: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: PostgrestError | null }> | unknown;
  };
};

const SKU_FORMAT_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function toSafeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function buildFallbackSku(params: SkuPreviewParams): string {
  const typeCode = getSkuTypeCode(params);
  const token = normalizeSkuToken(toSafeText(params.name), 6);
  const timePart = String(Date.now() % 1_000_000).padStart(6, "0");
  const randomPart = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  const sequence = `${timePart}${randomPart}`.slice(-6);
  return `${typeCode}-${token}-${sequence}`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function getSkuTypeCode(params: SkuTypeParams): string {
  const productType = toSafeText(params.productType).toLowerCase();
  const inventoryKind = toSafeText(params.inventoryKind).toLowerCase();

  if (inventoryKind === "asset") return "EQP";
  if (productType === "venta") return "VEN";
  if (productType === "preparacion") return "PRE";
  return "INS";
}

export function normalizeSkuToken(value: string, maxLen = 6): string {
  const normalized = normalizeText(value).replace(/[^A-Z0-9]+/g, "");
  const compact = normalized.trim();
  if (!compact) return "ITEM";
  return compact.slice(0, Math.max(1, maxLen));
}

export function buildSkuPreview(params: SkuPreviewParams): string {
  const typeCode = getSkuTypeCode(params);
  const token = normalizeSkuToken(toSafeText(params.name), 6);
  return `${typeCode}-${token}-######`;
}

export function sanitizeManualSku(value: string | null | undefined): string {
  const normalized = normalizeText(toSafeText(value)).replace(/[^A-Z0-9-]+/g, "-");
  return normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function isValidSkuFormat(value: string): boolean {
  return SKU_FORMAT_REGEX.test(value);
}

export function isSkuConflictError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return message.includes("sku");
}

export async function generateNextSku(params: GenerateNextSkuParams): Promise<string> {
  const rpcResult = (params.supabase.rpc as (fn: string, args?: Record<string, unknown>) => unknown)(
    "generate_inventory_sku",
    {
    p_product_type: toSafeText(params.productType) || null,
    p_inventory_kind: toSafeText(params.inventoryKind) || null,
    p_name: toSafeText(params.name) || null,
    }
  );
  const { data, error } = (await rpcResult) as { data: unknown; error: PostgrestError | null };

  if (error) {
    return buildFallbackSku(params);
  }

  const sku = toSafeText(typeof data === "string" ? data : "");
  if (!sku) {
    return buildFallbackSku(params);
  }

  return sku;
}
