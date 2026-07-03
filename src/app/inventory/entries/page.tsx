import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/guard";
import { EntriesForm } from "@/components/vento/entries-form";
import { formatHistoryDateParts } from "@/lib/formatters";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { createEntry } from "./actions";
import {
  formatStatus,
  type EntryRow,
  type LocRow,
  type ProductProfileWithProduct,
  type ProductRow,
  type ProductSupplierCostRow,
  type PurchaseOrderItemRow,
  type PurchaseOrderRow,
  type SearchParams,
  type SupplierRow,
  type UnitRow,
} from "./helpers";

export const dynamic = "force-dynamic";

function HistoryDate({ value }: { value: string | null | undefined }) {
  const parts = formatHistoryDateParts(value);
  return (
    <div className="min-w-[130px]">
      <div className="font-semibold text-[var(--ui-text)]">{parts.date}</div>
      {parts.time ? <div className="mt-0.5 text-xs text-[var(--ui-muted)]">{parts.time}</div> : null}
    </div>
  );
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const access = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/entries",
    permissionCode: "inventory.entries_emergency",
  });

  const supabase = access.supabase;

  const { data: products } = await supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,unit,stock_unit_code,cost)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  let productRows = ((products ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((row): row is ProductRow => Boolean(row));

  if (productRows.length === 0) {
    const { data: fallbackProducts } = await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code,cost")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400);
    productRows = (fallbackProducts ?? []) as unknown as ProductRow[];
  }
  const productIds = productRows.map((row) => row.id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_default", true)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];
  const { data: supplierCostRowsData } = productIds.length
    ? await supabase
        .from("product_suppliers")
        .select(
          "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_price,purchase_price_net,purchase_price_includes_tax,purchase_tax_rate"
        )
        .in("product_id", productIds)
    : { data: [] as ProductSupplierCostRow[] };
  const supplierCostRows = (supplierCostRowsData ?? []) as ProductSupplierCostRow[];

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", access.user.id)
    .single();

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", access.user.id)
    .maybeSingle();

  const siteId = settings?.selected_site_id ?? employee?.site_id ?? "";

  const { data: locations } = siteId
    ? await supabase
        .from("inventory_locations")
        .select("id,code,zone,description")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(300)
    : { data: [] as LocRow[] };

  const pickDefaultLocationId = (rows: LocRow[]) => {
    const byKeyword = rows.find((loc) => {
      const code = (loc.code ?? "").toLowerCase();
      const zone = (loc.zone ?? "").toLowerCase();
      const desc = (loc.description ?? "").toLowerCase();
      return (
        code.includes("global") ||
        code.includes("almacen") ||
        code.includes("bodega") ||
        zone.includes("global") ||
        zone.includes("almacen") ||
        desc.includes("global") ||
        desc.includes("almacen")
      );
    });
    return byKeyword?.id ?? rows[0]?.id ?? "";
  };

  const { data: entries } = await supabase
    .from("inventory_entries")
    .select("id,supplier_name,invoice_number,status,received_at,created_at,site_id")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(300);

  const supplierRows = (suppliers ?? []) as SupplierRow[];
  const purchaseOrderId = String(sp.purchase_order_id ?? "").trim();
  let prefillSupplierId = "";
  let prefillInvoiceNumber = "";
  let prefillNotes = "";
  let prefillRows: Array<{
    product_id: string;
    quantity_declared: number;
    quantity_received: number;
    input_unit_code: string;
    input_unit_cost: number;
    purchase_order_item_id: string;
    cost_source: "po_prefill";
    notes: string;
  }> = [];

  if (purchaseOrderId) {
    const { data: poRow } = await supabase
      .from("purchase_orders")
      .select("id,supplier_id,site_id,notes")
      .eq("id", purchaseOrderId)
      .maybeSingle();
    const purchaseOrder = poRow as PurchaseOrderRow | null;
    if (purchaseOrder?.site_id && purchaseOrder.site_id === siteId) {
      prefillSupplierId = purchaseOrder.supplier_id ?? "";
      prefillInvoiceNumber = purchaseOrder.id;
      prefillNotes = purchaseOrder.notes ?? "";
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("id,product_id,quantity_ordered,quantity_received,unit_cost,unit")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at", { ascending: true });
      const rawRows = (poItems ?? []) as PurchaseOrderItemRow[];
      prefillRows = rawRows
        .map((row) => {
          const ordered = Number(row.quantity_ordered ?? 0);
          const receivedQty = Number(row.quantity_received ?? 0);
          const pending = roundQuantity(Math.max(ordered - receivedQty, 0), 6);
          if (!row.product_id || pending <= 0) return null;
          return {
            product_id: row.product_id,
            quantity_declared: pending,
            quantity_received: pending,
            input_unit_code: normalizeUnitCode(row.unit || "un"),
            input_unit_cost: Number(row.unit_cost ?? 0),
            purchase_order_item_id: row.id,
            cost_source: "po_prefill" as const,
            notes: "",
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  }

  const entryRows = (entries ?? []) as EntryRow[];
  const pendingEntries = entryRows.filter((row) => row.status === "pending").length;
  const partialEntries = entryRows.filter((row) => row.status === "partial").length;
  const receivedEntries = entryRows.filter((row) => row.status === "received").length;

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
              <h1 className="ui-h1">Entrada de emergencia</h1>
              <p className="ui-body-muted">
                Registra recepciones excepcionales en NEXO cuando no puedes usar el flujo normal de ORIGO.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Uso excepcional
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {supplierRows.length} proveedores
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {productRows.length} productos
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Pendientes</div>
              <div className="ui-remission-kpi-value">{pendingEntries}</div>
              <div className="ui-remission-kpi-note">Entradas creadas sin recepcion completa</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Parciales</div>
              <div className="ui-remission-kpi-value">{partialEntries}</div>
              <div className="ui-remission-kpi-note">Recepcion parcial registrada en las ultimas 25</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Recibidas</div>
              <div className="ui-remission-kpi-value">{receivedEntries}</div>
              <div className="ui-remission-kpi-note">Entradas completas dentro del historial reciente</div>
            </article>
          </div>
        </div>
      </section>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="ui-alert ui-alert--success">Entrada creada correctamente.</div>
      ) : null}

      <EntriesForm
        products={productRows.map((row) => ({
          id: row.id,
          name: row.name,
          unit: row.unit,
          stock_unit_code: row.stock_unit_code,
          default_unit_cost: row.cost,
        }))}
        units={unitsList.map((unit) => ({
          code: unit.code,
          name: unit.name,
          family: unit.family,
          factor_to_base: unit.factor_to_base,
        }))}
        locations={(locations ?? []) as LocRow[]}
        defaultLocationId={pickDefaultLocationId((locations ?? []) as LocRow[])}
        suppliers={supplierRows}
        supplierCostRows={supplierCostRows}
        defaultUomProfiles={defaultUomProfiles}
        defaultSupplierId={prefillSupplierId || undefined}
        defaultInvoiceNumber={prefillInvoiceNumber || undefined}
        defaultNotes={prefillNotes || undefined}
        purchaseOrderId={purchaseOrderId || undefined}
        emergencyOnly
        initialRows={prefillRows}
        action={createEntry}
      />

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Entradas recientes</div>
            <div className="mt-1 ui-body-muted">
              Ultimas 25 entradas registradas en este flujo.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
              Pendientes {pendingEntries}
            </span>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-900">
              Parciales {partialEntries}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-900">
              Recibidas {receivedEntries}
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white">
          <table className="ui-table min-w-full text-sm">
            <thead className="bg-[var(--ui-bg-soft)] text-left text-xs uppercase tracking-[0.08em] text-[var(--ui-muted)]">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entryRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200/70 transition hover:bg-[var(--ui-bg-soft)]">
                  <td className="px-4 py-3"><HistoryDate value={row.received_at ?? row.created_at} /></td>
                  <td className="px-4 py-3 font-medium text-[var(--ui-text)]">{row.supplier_name ?? "-"}</td>
                  <td className="px-4 py-3">{row.invoice_number ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={formatStatus(row.status).className}>
                      {formatStatus(row.status).label}
                    </span>
                  </td>
                </tr>
              ))}
              {!entryRows.length ? (
                <tr>
                  <td className="px-4 py-5 text-[var(--ui-muted)]" colSpan={4}>
                    No hay entradas registradas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

