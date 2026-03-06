import type { ParsedDocument } from "@/lib/inventory/ai/types";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_INVENTORY_MODEL || "gpt-4.1-mini";

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return raw;
  return raw.slice(start, end + 1);
}

function mapPayloadToParsedDocument(payload: unknown): ParsedDocument {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = rawLines
    .map((line, index) => {
      const row = (line ?? {}) as Record<string, unknown>;
      const qty = Number(row.quantity ?? 0);
      const confidence = Number(row.confidence ?? 0.5);
      const unitPrice =
        row.unit_price == null || row.unit_price === ""
          ? null
          : Number(row.unit_price);
      const taxRate =
        row.tax_rate == null || row.tax_rate === ""
          ? null
          : Number(row.tax_rate);
      const lineTotal =
        row.line_total == null || row.line_total === ""
          ? null
          : Number(row.line_total);
      return {
        line_no: Number(row.line_no ?? index + 1),
        raw_text: String(row.raw_text ?? row.name ?? "").trim(),
        supplier_sku: row.supplier_sku ? String(row.supplier_sku).trim() : null,
        name: String(row.name ?? "").trim(),
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 0,
        unit: row.unit ? String(row.unit).trim().toLowerCase() : null,
        unit_price: Number.isFinite(unitPrice ?? NaN) ? Number(unitPrice) : null,
        tax_rate: Number.isFinite(taxRate ?? NaN) ? Number(taxRate) : null,
        tax_included: typeof row.tax_included === "boolean" ? row.tax_included : null,
        line_total: Number.isFinite(lineTotal ?? NaN) ? Number(lineTotal) : null,
        confidence:
          Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
            ? confidence
            : 0.5,
        normalization_notes: Array.isArray(row.normalization_notes)
          ? row.normalization_notes.map((x) => String(x))
          : [],
      };
    })
    .filter((row) => row.name && row.quantity > 0);

  return {
    supplier_name: raw.supplier_name ? String(raw.supplier_name) : null,
    document_number: raw.document_number ? String(raw.document_number) : null,
    document_date: raw.document_date ? String(raw.document_date) : null,
    currency: raw.currency ? String(raw.currency).toUpperCase() : null,
    lines,
  };
}

export async function parseDocumentWithOpenAI(params: {
  sourceMime: string;
  sourceFilename: string;
  fileBase64: string;
}): Promise<{ parsed: ParsedDocument; raw: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  const inputContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text:
        "Extrae la factura/remision y retorna JSON puro con formato: " +
        "{supplier_name,document_number,document_date,currency,lines:[{line_no,raw_text,supplier_sku,name,quantity,unit,unit_price,tax_rate,tax_included,line_total,confidence,normalization_notes[]}]}." +
        " No inventes campos. Si algo no se ve, usa null. confidence entre 0 y 1.",
    },
  ];

  if (params.sourceMime.startsWith("image/")) {
    inputContent.push({
      type: "input_image",
      image_url: `data:${params.sourceMime};base64,${params.fileBase64}`,
      detail: "high",
    });
  } else {
    inputContent.push({
      type: "input_file",
      filename: params.sourceFilename || "document.pdf",
      file_data: `data:${params.sourceMime};base64,${params.fileBase64}`,
    });
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "user",
          content: inputContent,
        },
      ],
      temperature: 0.1,
      max_output_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const outputText = Array.isArray(json.output_text) ? json.output_text.join("\n") : "";
  const rawParsed =
    safeJsonParse<unknown>(outputText) ??
    safeJsonParse<unknown>(extractJsonObject(outputText)) ??
    {};

  return {
    parsed: mapPayloadToParsedDocument(rawParsed),
    raw: json,
  };
}
