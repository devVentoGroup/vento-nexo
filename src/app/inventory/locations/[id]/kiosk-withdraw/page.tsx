import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { KioskWithdrawForm } from "@/components/vento/kiosk-withdraw-form";
import { requireAppAccess } from "@/lib/auth/guard";
import {
  formatOperationalPartLabel,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import { submitKioskWithdraw } from "./actions";
import {
  locLabel,
  normalizeProduct,
  normalizeUomProfileRelation,
  productMeasurementMode,
  profileBaseFactor,
  selectPresentationRowsForDisplay,
  type LocationRow,
  type Params,
  type PresentationStockPart,
  type PresentationStockRow,
  type ProductRow,
  type SearchParams,
  type StockRow,
} from "./helpers";

export const dynamic = "force-dynamic";

export default async function KioskWithdrawPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMessage = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const errorField = sp.error_field === "worker" ? "worker" : sp.error_field === "product" ? "product" : "";
  const errorProductId = sp.error_product_id ? String(sp.error_product_id).trim() : "";
  const initialProductId = sp.product_id ? String(sp.product_id).trim() : "";
  const initialEmployeeId = sp.employee_id ? String(sp.employee_id).trim() : "";
  const initialQuantity = sp.quantity ? String(sp.quantity).trim() : "";
  const initialInputUnitCode = sp.input_unit_code ? normalizeUnitCode(String(sp.input_unit_code).trim()) : "";
  const initialInputUomProfileId = sp.input_uom_profile_id ? String(sp.input_uom_profile_id).trim() : "";
  const initialNotes = sp.notes ? safeDecodeURIComponent(sp.notes) : "";
  const returnTo = `/inventory/locations/${encodeURIComponent(id)}/board?kiosk=1`;

  if (!initialProductId) {
    redirect(returnTo);
  }

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/kiosk-withdraw?kiosk=1`,
    permissionCode: ["inventory.transfers", "inventory.withdraw"],
  });

  const [{ data: locationData }, { data: selectedStockData }] = await Promise.all([
    supabase
      .from("inventory_locations")
      .select("id,code,description,zone,site_id")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("inventory_stock_by_location")
      .select("product_id,current_qty,products(id,name,unit,stock_unit_code,product_inventory_profiles(measurement_mode))")
      .eq("location_id", id)
      .eq("product_id", initialProductId)
      .gt("current_qty", 0)
      .maybeSingle(),
  ]);

  const location = (locationData ?? null) as LocationRow | null;
  if (!location?.site_id) notFound();

  const selectedStockRow = (selectedStockData ?? null) as unknown as StockRow | null;
  const selectedProductBase = normalizeProduct(selectedStockRow?.products ?? null);

  if (!selectedStockRow || !selectedProductBase) {
    redirect(returnTo);
  }

  const selectedStock = selectedStockRow;
  const selectedProductBaseRow = selectedProductBase as ProductRow;
  const selectedProduct = {
    ...selectedProductBaseRow,
    available_qty: Number(selectedStock.current_qty ?? 0),
    measurementMode: productMeasurementMode(selectedProductBaseRow),
    presentationParts: [] as PresentationStockPart[],
  };

  const [{ data: uomProfilesData }, { data: presentationStockData }, { data: workersData, error: workersError }] = await Promise.all([
    supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context,image_url,catalog_image_url")
      .eq("product_id", selectedProduct.id)
      .eq("is_active", true),
    supabase
      .from("inventory_stock_by_uom_profile")
      .select("product_id,uom_profile_id,location_position_id,presentation_qty,base_qty,product_uom_profiles(id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context,image_url,catalog_image_url)")
      .eq("location_id", id)
      .eq("product_id", selectedProduct.id)
      .gt("presentation_qty", 0),
    supabase.rpc("nexo_kiosk_withdraw_workers", {
      p_source_location_id: id,
    }),
  ]);
  const presentationRowsForDisplay = selectPresentationRowsForDisplay(
    (presentationStockData ?? []) as unknown as PresentationStockRow[],
    selectedProduct.available_qty
  );

  const presentationPartsByProfile = new Map<
    string,
    {
      uomProfileId: string;
      baseLabel: string;
      qty: number;
      baseQty: number;
      imageUrl: string;
    }
  >();

  for (const row of presentationRowsForDisplay) {
    const profile = normalizeUomProfileRelation(row.product_uom_profiles);
    const qty = Number(row.presentation_qty ?? 0);
    const baseQty = Number(row.base_qty ?? 0);

    if (!profile || qty <= 0 || baseQty <= 0) continue;

    const current = presentationPartsByProfile.get(row.uom_profile_id) ?? {
      uomProfileId: row.uom_profile_id,
      baseLabel: String(profile.label || profile.input_unit_code || "presentación").trim(),
      qty: 0,
      baseQty: 0,
      imageUrl: profile.image_url || profile.catalog_image_url || "",
    };

    current.qty = roundQuantity(current.qty + qty);
    current.baseQty = roundQuantity(current.baseQty + baseQty);
    presentationPartsByProfile.set(row.uom_profile_id, current);
  }

  selectedProduct.presentationParts = Array.from(presentationPartsByProfile.values())
    .map((part) => ({
      uomProfileId: part.uomProfileId,
      label: formatOperationalPartLabel(part.baseLabel, part.qty),
      qty: part.qty,
      baseQty: part.baseQty,
      imageUrl: part.imageUrl,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

  const products = [selectedProduct];
  const workers = ((workersData ?? []) as Array<{
    employee_id: string;
    label: string | null;
    role: string | null;
    destination_label: string | null;
    has_destination: boolean | null;
  }>).map((worker) => ({
    employee_id: worker.employee_id,
    label: String(worker.label ?? worker.employee_id).trim(),
    role: worker.role ?? null,
    destination_label: String(worker.destination_label ?? "Sin destino (descuento)").trim(),
    has_destination: worker.has_destination === true,
  }));

  const title = locLabel(location);

  return (
    <div className="ui-scene w-full space-y-5 px-4 py-5">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <Link
              href={returnTo}
              className="inline-flex min-h-12 w-fit items-center justify-center rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-950 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              ← Volver al quiosco / cambiar producto
            </Link>
            <div className="space-y-2">
              <div className="ui-caption">Quiosco operativo</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Selecciona quien retira. Si tiene LOC asignado, NEXO traslada; si no, descuenta del inventario.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Origen {title}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                Producto seleccionado
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {workers.length} trabajadores disponibles
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Confirmacion</div>
              <div className="ui-remission-kpi-value">Trabajador</div>
              <div className="ui-remission-kpi-note">Sin PIN personal</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Movimiento</div>
              <div className="ui-remission-kpi-value">LOC / retiro</div>
              <div className="ui-remission-kpi-note">Destino asignado o descuento directo</div>
            </article>
          </div>
        </div>
      </section>

      {errorMessage && !errorProductId ? (
        <div className="ui-alert ui-alert--error">Error: {errorMessage}</div>
      ) : null}

      {workersError ? (
        <div className="ui-alert ui-alert--error">
          Error cargando trabajadores: {workersError.message}
        </div>
      ) : null}

      {!workersError && workers.length === 0 ? (
        <div className="ui-alert ui-alert--neutral">
          No hay trabajadores activos para esta sede.
        </div>
      ) : null}

      <KioskWithdrawForm
        key={initialProductId || "blank"}
        sourceLocationId={id}
        returnTo={returnTo}
        products={products}
        workers={workers}
        uomProfiles={(uomProfilesData ?? []) as ProductUomProfile[]}
        errorMessage={errorMessage}
        errorField={errorField}
        errorProductId={errorProductId}
        initialEmployeeId={initialEmployeeId}
        initialInputUnitCode={initialInputUnitCode}
        initialInputUomProfileId={initialInputUomProfileId}
        initialNotes={initialNotes}
        initialProductId={initialProductId}
        initialQuantity={initialQuantity}
        action={submitKioskWithdraw}
      />
    </div>
  );
}
