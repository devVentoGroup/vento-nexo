import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const VIEW_PERMISSION = "cost_centers.view";
const VIEW_AMOUNTS_PERMISSION = "internal_invoices.view_amounts";
const GENERATE_PERMISSION = "internal_invoices.generate";
const PAGE_PATH = "/inventory/cost-center";

type SearchParams = {
  ok?: string;
  error?: string;
  pricing_status?: string;
  document_date?: string;
  result?: string;
};

type RestockRequestRow = {
  id: string;
  request_code: string | null;
  status: string;
  pricing_mode: string;
  pricing_status: string;
  from_site_id: string | null;
  to_site_id: string | null;
  seller_cost_center_id: string | null;
  buyer_cost_center_id: string | null;
  internal_pos_document_id: string | null;
  received_at: string | null;
  closed_at: string | null;
  priced_at: string | null;
  created_at: string;
};

type RestockRequestItemRow = {
  id: string;
  request_id: string;
  product_id: string;
  shipped_quantity: number | null;
  received_quantity: number | null;
  transfer_unit_price: number | null;
  transfer_currency: string | null;
  transfer_total: number | null;
  internal_price_list_id: string | null;
  internal_price_list_item_id: string | null;
  priced_at: string | null;
  input_qty: number | null;
  input_unit_code: string | null;
  stock_unit_code: string | null;
  unit: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  site_type: string | null;
  is_active: boolean | null;
};

type CostCenterRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  code: string | null;
  type: string | null;
  is_active: boolean | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
};

type VarianceRow = {
  id: string;
  remission_id: string;
  status: string;
  variance_qty: number | null;
  financial_treatment: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function buildReturnUrl(status: {
  ok?: string;
  error?: string;
  pricingStatus?: string;
  documentDate?: string;
  result?: string;
}) {
  const params = new URLSearchParams();
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  if (status.pricingStatus) params.set("pricing_status", status.pricingStatus);
  if (status.documentDate) params.set("document_date", status.documentDate);
  if (status.result) params.set("result", status.result);
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function formatMoney(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function todayBogotaDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date());
}

function parseGenerationResult(value: string | null | undefined) {
  if (!value) return null;

  try {
    return JSON.parse(safeDecodeURIComponent(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function generationNumber(result: Record<string, unknown> | null, key: string) {
  const value = result?.[key];
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generationText(result: Record<string, unknown> | null, key: string) {
  const value = result?.[key];
  return typeof value === "string" ? value : "";
}

function siteLabel(row: SiteRow | null | undefined) {
  if (!row) return "Sin sede";
  return row.name ?? row.code ?? row.id;
}

function costCenterLabel(row: CostCenterRow | null | undefined, sitesById: Map<string, SiteRow>) {
  if (!row) return "Sin centro";
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  const name = String(row.name ?? "").trim() || siteLabel(site);
  const code = String(row.code ?? "").trim();

  if (code) return `${name} · ${code}`;
  return name;
}

function pricingStatusLabel(value: string | null | undefined) {
  switch (String(value ?? "")) {
    case "ready_to_invoice":
      return "Lista para facturar";
    case "pending_price":
      return "Falta precio";
    case "pending_variance_resolution":
      return "Diferencias pendientes";
    case "pending_close":
      return "Pendiente cierre";
    case "invoiced":
      return "Facturada";
    case "credited":
      return "Acreditada";
    case "not_applicable":
      return "No aplica";
    case "draft":
      return "Sin valorizar";
    default:
      return value || "Sin estado";
  }
}

function pricingStatusChipClass(value: string | null | undefined) {
  switch (String(value ?? "")) {
    case "ready_to_invoice":
      return "ui-chip ui-chip--success";
    case "pending_price":
    case "pending_variance_resolution":
    case "pending_close":
      return "ui-chip ui-chip--warn";
    case "invoiced":
    case "credited":
      return "ui-chip ui-chip--info";
    case "not_applicable":
      return "ui-chip";
    default:
      return "ui-chip ui-chip--warn";
  }
}

function requestDisplayCode(row: RestockRequestRow) {
  return row.request_code || row.id.slice(0, 8);
}

function groupByRequestId(rows: RestockRequestItemRow[]) {
  const map = new Map<string, RestockRequestItemRow[]>();
  for (const row of rows) {
    const current = map.get(row.request_id) ?? [];
    current.push(row);
    map.set(row.request_id, current);
  }
  return map;
}

function groupVariancesByRequestId(rows: VarianceRow[]) {
  const map = new Map<string, VarianceRow[]>();
  for (const row of rows) {
    const current = map.get(row.remission_id) ?? [];
    current.push(row);
    map.set(row.remission_id, current);
  }
  return map;
}

async function requireInternalInvoiceGenerator() {
  const supabase = await createClient();

  return requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    supabase,
    permissionCode: GENERATE_PERMISSION,
  });
}

async function repriceInternalRemission(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalInvoiceGenerator();

  const requestId = asText(formData.get("request_id"));
  const pricingStatus = asText(formData.get("pricing_status"));

  if (!requestId) {
    redirect(buildReturnUrl({ error: "Remisión inválida.", pricingStatus }));
  }

  const { error } = await supabase.rpc("price_restock_request_internal_transfer", {
    p_request_id: requestId,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, pricingStatus }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath(`/inventory/remissions/${requestId}`);
  redirect(buildReturnUrl({ ok: "repriced", pricingStatus }));
}

async function previewManualInternalDocuments(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalInvoiceGenerator();

  const documentDate = asText(formData.get("document_date"));
  const pricingStatus = asText(formData.get("pricing_status"));

  const { data, error } = await supabase.rpc("preview_manual_daily_internal_pos_documents", {
    p_document_date: documentDate || null,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, pricingStatus, documentDate }));
  }

  redirect(
    buildReturnUrl({
      ok: "manual_preview",
      pricingStatus,
      documentDate,
      result: JSON.stringify(data ?? {}),
    })
  );
}

async function generateManualInternalDocuments(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalInvoiceGenerator();

  const documentDate = asText(formData.get("document_date"));
  const pricingStatus = asText(formData.get("pricing_status"));

  const { data, error } = await supabase.rpc("generate_manual_daily_internal_pos_documents", {
    p_document_date: documentDate || null,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, pricingStatus, documentDate }));
  }

  revalidatePath(PAGE_PATH);
  redirect(
    buildReturnUrl({
      ok: "manual_generated",
      pricingStatus,
      documentDate,
      result: JSON.stringify(data ?? {}),
    })
  );
}

export default async function CostCenterPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedPricingStatus = String(sp.pricing_status ?? "all").trim() || "all";
  const selectedDocumentDate =
    String(sp.document_date ?? "").trim() || todayBogotaDateInput();
  const generationResult = parseGenerationResult(sp.result);
  const okMsg =
    sp.ok === "repriced"
      ? "Remisión revalorizada."
      : sp.ok === "manual_preview"
        ? "Vista previa del corte generada."
        : sp.ok === "manual_generated"
          ? "Comprobantes internos generados."
          : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    permissionCode: VIEW_PERMISSION,
  });

  const [canViewAmounts, canGenerate] = await Promise.all([
    checkPermission(supabase, APP_ID, VIEW_AMOUNTS_PERMISSION),
    checkPermission(supabase, APP_ID, GENERATE_PERMISSION),
  ]);

  let requestQuery = supabase
    .from("restock_requests")
    .select(
      "id,request_code,status,pricing_mode,pricing_status,from_site_id,to_site_id,seller_cost_center_id,buyer_cost_center_id,internal_pos_document_id,received_at,closed_at,priced_at,created_at"
    )
    .in("status", ["received", "closed"])
    .order("received_at", { ascending: false })
    .limit(200);

  if (selectedPricingStatus !== "all") {
    requestQuery = requestQuery.eq("pricing_status", selectedPricingStatus);
  }

  const [
    { data: requestRowsData, error: requestError },
    { data: siteRowsData },
    { data: costCenterRowsData },
  ] = await Promise.all([
    requestQuery,
    supabase
      .from("sites")
      .select("id,name,code,site_type,is_active")
      .order("name", { ascending: true }),
    supabase
      .from("cost_centers")
      .select("id,site_id,name,code,type,is_active")
      .order("name", { ascending: true }),
  ]);

  if (requestError) {
    redirect(buildReturnUrl({ error: requestError.message, pricingStatus: selectedPricingStatus }));
  }

  const requestRows = (requestRowsData ?? []) as RestockRequestRow[];
  const sites = (siteRowsData ?? []) as SiteRow[];
  const costCenters = (costCenterRowsData ?? []) as CostCenterRow[];
  const requestIds = requestRows.map((row) => row.id);

  const [{ data: itemRowsData }, { data: varianceRowsData }] = requestIds.length
    ? await Promise.all([
        supabase
          .from("restock_request_items")
          .select(
            "id,request_id,product_id,shipped_quantity,received_quantity,transfer_unit_price,transfer_currency,transfer_total,internal_price_list_id,internal_price_list_item_id,priced_at,input_qty,input_unit_code,stock_unit_code,unit"
          )
          .in("request_id", requestIds),
        supabase
          .from("internal_transfer_variances")
          .select("id,remission_id,status,variance_qty,financial_treatment")
          .in("remission_id", requestIds)
          .neq("status", "cancelled"),
      ])
    : [{ data: [] }, { data: [] }];

  const itemRows = (itemRowsData ?? []) as RestockRequestItemRow[];
  const varianceRows = (varianceRowsData ?? []) as VarianceRow[];
  const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));

  const { data: productRowsData } = productIds.length
    ? await supabase
        .from("products")
        .select("id,name,sku")
        .in("id", productIds)
    : { data: [] };

  const productsById = new Map(
    ((productRowsData ?? []) as ProductRow[]).map((row) => [row.id, row])
  );
  const sitesById = new Map(sites.map((row) => [row.id, row]));
  const costCentersById = new Map(costCenters.map((row) => [row.id, row]));
  const itemsByRequestId = groupByRequestId(itemRows);
  const variancesByRequestId = groupVariancesByRequestId(varianceRows);

  const allVisibleTotal = requestRows.reduce((sum, request) => {
    const total = (itemsByRequestId.get(request.id) ?? []).reduce(
      (lineSum, item) => lineSum + Number(item.transfer_total ?? 0),
      0
    );
    return sum + total;
  }, 0);

  const pendingPriceCount = requestRows.filter(
    (row) => row.pricing_status === "pending_price"
  ).length;
  const readyToInvoiceCount = requestRows.filter(
    (row) => row.pricing_status === "ready_to_invoice"
  ).length;
  const pendingVarianceCount = requestRows.filter(
    (row) => row.pricing_status === "pending_variance_resolution"
  ).length;

  const statusOptions = [
    { value: "all", label: "Todas" },
    { value: "ready_to_invoice", label: "Listas para facturar" },
    { value: "pending_price", label: "Falta precio" },
    { value: "pending_variance_resolution", label: "Diferencias" },
    { value: "pending_close", label: "Pendiente cierre" },
    { value: "not_applicable", label: "No aplica" },
    { value: "invoiced", label: "Facturadas" },
  ];

  return (
    <div className="w-full">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--ui-border)] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfdff_62%,#fffaf0_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 -bottom-24 h-48 w-48 rounded-full bg-sky-200/25 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Centros de costo
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                Remisiones valorizadas
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                Facturación interna
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[var(--ui-text)]">
              Centros de costo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
              Controla remisiones recibidas, precios internos congelados, diferencias pendientes
              y documentos internos por generar. Esta pantalla todavía no emite comprobantes:
              primero valida que la valorización esté correcta.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/settings/internal-prices" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Precios internos
            </Link>
            <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Remisiones
            </Link>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Pendientes precio
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{pendingPriceCount}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">Necesitan lista/precio interno</div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Listas para facturar
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{readyToInvoiceCount}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">Valorizadas sin diferencias</div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Diferencias
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{pendingVarianceCount}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">Requieren resolución</div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-pink-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-pink-700">
              Total visible
            </div>
            <div className="mt-2 text-xl font-bold text-[var(--ui-text)]">
              {canViewAmounts ? formatMoney(allVisibleTotal) : "Restringido"}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Según filtro actual
            </div>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canViewAmounts ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Puedes revisar estados de centros de costo, pero no tienes permiso para ver montos internos.
        </div>
      ) : null}

      {canGenerate ? (
        <section className="mt-6 rounded-[1.75rem] border border-emerald-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fffb_70%,#ecfdf5_100%)] p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-[var(--ui-text)]">
                Generar comprobantes internos del día
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                Usa el corte de las 5:00 p.m. Colombia para crear un comprobante interno
                por comprador. Primero revisa la vista previa; luego genera el corte manualmente
                cuando las remisiones estén cerradas, valorizadas y sin diferencias pendientes.
              </p>
            </div>

            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              Corte manual
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form
              action={previewManualInternalDocuments}
              className="rounded-2xl border border-[var(--ui-border)] bg-white/90 p-4 shadow-sm"
            >
              <input type="hidden" name="pricing_status" value={selectedPricingStatus} />

              <label className="flex flex-col gap-1">
                <span className="ui-label">Fecha operativa</span>
                <input
                  name="document_date"
                  type="date"
                  defaultValue={selectedDocumentDate}
                  className="ui-input"
                />
              </label>

              <p className="mt-2 text-xs leading-5 text-[var(--ui-muted)]">
                La vista previa no escribe datos. Solo calcula qué remisiones entrarían al corte.
              </p>

              <button type="submit" className="ui-btn ui-btn--ghost mt-4">
                Vista previa
              </button>
            </form>

            <form
              action={generateManualInternalDocuments}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm"
            >
              <input type="hidden" name="pricing_status" value={selectedPricingStatus} />

              <label className="flex flex-col gap-1">
                <span className="ui-label">Fecha operativa</span>
                <input
                  name="document_date"
                  type="date"
                  defaultValue={selectedDocumentDate}
                  className="ui-input bg-white"
                />
              </label>

              <p className="mt-2 text-xs leading-5 text-emerald-900">
                Esta acción crea documentos internos, líneas y marca las remisiones como facturadas.
                Úsala solo después de revisar el corte.
              </p>

              <button type="submit" className="ui-btn ui-btn--brand mt-4">
                Generar comprobantes
              </button>
            </form>
          </div>

          {generationResult ? (
            <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ui-text)]">
                    Resultado del corte
                  </div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Fecha documento: {generationText(generationResult, "document_date") || selectedDocumentDate}
                    {generationText(generationResult, "cutoff_at")
                      ? ` · Corte: ${formatDate(generationText(generationResult, "cutoff_at"))}`
                      : ""}
                  </div>
                </div>

                <span className="ui-chip ui-chip--info">
                  {generationResult.dry_run ? "Vista previa" : "Generado"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Remisiones
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
                    {generationNumber(generationResult, "candidate_remissions") ||
                      generationNumber(generationResult, "remissions_invoiced")}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Líneas
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
                    {generationNumber(generationResult, "candidate_lines") ||
                      generationNumber(generationResult, "lines_created")}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Documentos
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
                    {generationNumber(generationResult, "documents_created")}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Total
                  </div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {canViewAmounts
                      ? formatMoney(
                          generationNumber(generationResult, "candidate_total") ||
                            generationNumber(generationResult, "total")
                        )
                      : "Restringido"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Bloqueadas
                  </div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {generationNumber(generationResult, "blocked_unpriced_remissions")} sin precio ·{" "}
                    {generationNumber(generationResult, "blocked_variance_remissions")} con diferencias
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-[var(--ui-text)]">Bandeja de remisiones internas</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Se muestran las últimas 200 remisiones recibidas/cerradas según el filtro.
            </p>
          </div>

          <form className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado de precio</span>
              <select name="pricing_status" className="ui-input min-w-56" defaultValue={selectedPricingStatus}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ui-btn ui-btn--ghost">
              Filtrar
            </button>
          </form>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--ui-border)] shadow-sm">
          <table className="min-w-full divide-y divide-[var(--ui-border)] text-sm">
            <thead className="bg-[linear-gradient(90deg,#fff7e6_0%,#f8fcff_100%)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Remisión</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Flujo</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Estado precio</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Líneas</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Fechas</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--ui-border)] bg-white">
              {requestRows.length ? (
                requestRows.map((request) => {
                  const items = itemsByRequestId.get(request.id) ?? [];
                  const variances = variancesByRequestId.get(request.id) ?? [];
                  const total = items.reduce(
                    (sum, item) => sum + Number(item.transfer_total ?? 0),
                    0
                  );
                  const receivedLines = items.filter(
                    (item) => Number(item.received_quantity ?? 0) > 0
                  );
                  const missingPriceLines = receivedLines.filter(
                    (item) => !item.internal_price_list_item_id || item.transfer_total === null
                  );
                  const seller =
                    request.seller_cost_center_id
                      ? costCentersById.get(request.seller_cost_center_id)
                      : null;
                  const buyer =
                    request.buyer_cost_center_id
                      ? costCentersById.get(request.buyer_cost_center_id)
                      : null;
                  const fromSite = request.from_site_id ? sitesById.get(request.from_site_id) : null;
                  const toSite = request.to_site_id ? sitesById.get(request.to_site_id) : null;
                  const sampleProducts = items
                    .slice(0, 3)
                    .map((item) => {
                      const product = productsById.get(item.product_id);
                      return product?.name ?? item.product_id.slice(0, 8);
                    })
                    .join(", ");

                  return (
                    <tr key={request.id}>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/inventory/remissions/${request.id}`}
                          className="font-semibold text-[var(--ui-text)] hover:underline"
                        >
                          {requestDisplayCode(request)}
                        </Link>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {request.status === "closed" ? "Cerrada" : "Recibida"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-[var(--ui-text)]">
                          {seller ? costCenterLabel(seller, sitesById) : siteLabel(fromSite)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          → {buyer ? costCenterLabel(buyer, sitesById) : siteLabel(toSite)}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={pricingStatusChipClass(request.pricing_status)}>
                          {pricingStatusLabel(request.pricing_status)}
                        </span>
                        {request.internal_pos_document_id ? (
                          <div className="mt-1 text-xs text-[var(--ui-muted)]">
                            Con comprobante interno
                          </div>
                        ) : null}
                        {variances.length ? (
                          <div className="mt-1 text-xs text-amber-700">
                            {variances.length} diferencia(s)
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-[var(--ui-text)]">
                          {receivedLines.length} línea(s) recibidas
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {missingPriceLines.length
                            ? `${missingPriceLines.length} sin precio`
                            : sampleProducts || "Sin productos"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-[var(--ui-text)]">
                          {canViewAmounts ? formatMoney(total) : "Restringido"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {request.priced_at ? `Valorizada ${formatDate(request.priced_at)}` : "Sin priced_at"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top text-xs text-[var(--ui-muted)]">
                        <div>Recibida: {formatDate(request.received_at)}</div>
                        <div>Corte: {formatDate(request.closed_at ?? request.received_at)}</div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/inventory/remissions/${request.id}`}
                            className="ui-btn ui-btn--ghost justify-center"
                          >
                            Ver detalle
                          </Link>

                          {canGenerate && !request.internal_pos_document_id ? (
                            <form action={repriceInternalRemission}>
                              <input type="hidden" name="request_id" value={request.id} />
                              <input
                                type="hidden"
                                name="pricing_status"
                                value={selectedPricingStatus}
                              />
                              <button type="submit" className="ui-btn ui-btn--ghost w-full">
                                Revalorizar
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[var(--ui-muted)]">
                    No hay remisiones para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
