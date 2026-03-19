import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { roundQuantity } from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import { loadAccessContext } from "./detail-access";
import {
  commitPreparationDraft,
  updateItems,
} from "./detail-actions";
import { RemissionPrepareWorkbench } from "./prepare-workbench";
import { RemissionLineCard } from "./detail-line-card";
import { RemissionLineHiddenActions } from "./detail-line-hidden-actions";
import { RemissionHeroSection, RemissionSummarySection } from "./detail-sections";
import { buildRemissionLineVm } from "./detail-line-vm";
import { loadOriginStockContext } from "./detail-stock";
import { RemissionTopActions } from "./detail-top-actions";
import {
  type LocRow,
  type RemissionOperationalSummary,
  type RestockItemRow,
  type SearchParams,
  asText,
  buildLocDisplayLabel,
  buildLocFriendlyLabel,
  buildRemissionDetailHref,
  formatDate,
  formatDateTime,
  formatStatus,
  formatUnitLabel,
  loadRemissionOperationalSummary,
} from "./detail-utils";

export const dynamic = "force-dynamic";
const APP_ID = "nexo";

export default async function RemissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok === "created"
    ? "Remisión creada."
    : sp.ok === "items_updated"
      ? "Ítems actualizados."
      : sp.ok === "line_shortcut"
        ? "Línea actualizada."
      : sp.ok === "loc_selected"
        ? "LOC seleccionado."
      : sp.ok === "split_item"
        ? "Linea partida. Ya puedes asignar un LOC distinto por linea."
      : sp.ok === "status_updated"
        ? "Estado actualizado."
        : sp.ok === "preparing_started"
          ? "Preparación iniciada."
          : sp.ok === "transit_started"
            ? "Remisión enviada a tránsito."
            : sp.ok === "received_partial"
              ? "Recepción parcial registrada."
              : sp.ok === "received_complete"
                ? "Recepción completa registrada."
                : sp.ok === "cancelled"
                  ? "Remisión cancelada."
        : sp.ok
          ? safeDecodeURIComponent(sp.ok)
          : "";
  const activeLineId = String(sp.line ?? "").trim();
  const activeLineEvent = String(sp.event ?? "").trim();
  const lowStockWarning = sp.warning === "low_stock";
  const cameFromPrepareQueue = sp.from === "prepare";
  const activeSiteId = String(sp.site_id ?? "").trim();
  const backHref = cameFromPrepareQueue
    ? activeSiteId
      ? `/inventory/remissions/prepare?site_id=${encodeURIComponent(activeSiteId)}`
      : "/inventory/remissions/prepare"
    : activeSiteId
      ? `/inventory/remissions?site_id=${encodeURIComponent(activeSiteId)}`
      : "/inventory/remissions";
  const backLabel = cameFromPrepareQueue ? "Volver a cola de preparacion" : "Volver a remisiones";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: activeSiteId
      ? `/inventory/remissions/${id}?site_id=${encodeURIComponent(activeSiteId)}`
      : `/inventory/remissions/${id}`,
  });

  const { data: request } = await supabase
    .from("restock_requests")
    .select("*")
    .eq("id", id)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);

  const { data: items } = await supabase
    .from("restock_request_items")
    .select(
      "id, product_id, quantity, unit, input_qty, input_unit_code, stock_unit_code, source_location_id, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity, item_status, production_area_kind, product:products(name,unit,stock_unit_code)"
    )
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const itemRows = (items ?? []) as unknown as RestockItemRow[];
  const showSourceLocSelector =
    access.canPrepare && access.fromSiteType === "production_center";
  const { data: operationalSummary, error: operationalSummaryError } =
    await loadRemissionOperationalSummary({
      supabase,
      requestId: id,
    });

  if (operationalSummaryError) {
    redirect(
      buildRemissionDetailHref({
        requestId: id,
        from: cameFromPrepareQueue ? "prepare" : "",
        error: operationalSummaryError,
        siteId: activeSiteId,
      })
    );
  }
  const summary = operationalSummary as RemissionOperationalSummary;

  const fromSiteId = request?.from_site_id ?? "";
  const {
    stockBySiteMap,
    stockByLocValueMap,
    stockByLocCandidates,
    originLocRows,
    originLocById,
  } = await loadOriginStockContext({
    supabase,
    fromSiteId,
  });
  const lineIdsByProduct = new Map<string, string[]>();
  for (const item of itemRows) {
    if (!lineIdsByProduct.has(item.product_id)) lineIdsByProduct.set(item.product_id, []);
    lineIdsByProduct.get(item.product_id)!.push(item.id);
  }

  if (!request) {
    return (
      <div className="w-full">
        <Link href={backHref} className="ui-body-muted underline">
          {backLabel}
        </Link>
        <div className="mt-4 ui-alert ui-alert--error">Remisión no encontrada o sin acceso.</div>
      </div>
    );
  }

  const currentStatus = String(request.status ?? "");
  const pendingReceiptLines = summary.pending_receipt_lines;
  const shortageLines = summary.shortage_lines;
  const receivedLines = summary.received_lines;
  const canTransitAction = access.canTransit && currentStatus === "preparing";
  const canReceiveAction =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const canReceivePartialAction = access.canReceive && currentStatus === "in_transit";
  const canEditPrepareItems =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const canEditReceiveItems =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const isProductionView = access.fromSiteType === "production_center" && access.canPrepare;
  const isSatelliteView = access.toSiteType === "satellite" && access.canReceive;
  const linesMissingSourceLoc = itemRows.filter((item) => {
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    return canEditPrepareItems && showSourceLocSelector && plannedQty > 0 && !item.source_location_id;
  }).length;
  const linesPartialPreparation = itemRows.filter((item) => {
    const requestedQty = roundQuantity(Number(item.quantity ?? 0));
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    return canEditPrepareItems && plannedQty > 0 && requestedQty > 0 && plannedQty < requestedQty;
  }).length;
  const linesWithoutCoveringLoc = itemRows.filter((item) => {
    const requestedQty = roundQuantity(Number(item.quantity ?? 0));
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    const targetQty = plannedQty > 0 ? plannedQty : requestedQty;
    const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
    const bestLocQty = stockByLocCandidates.get(item.product_id)?.[0]?.qty ?? 0;
    return canEditPrepareItems && targetQty > 0 && targetQty <= availableSite && bestLocQty < targetQty;
  }).length;
  const dispatchReadyLines = summary.dispatch_ready_lines;
  const dispatchBlockedLines = summary.dispatch_blocked_lines;
  const pendingLocSelectionLines = summary.pending_loc_selection_lines;
  const canStartPreparationNow =
    access.canPrepare && currentStatus === "pending" && summary.can_start_prepare;
  const canTransitNow = canTransitAction && summary.can_transit;
  const isReadyToDispatch = currentStatus === "preparing" && summary.can_transit;
  const hasPrimaryTopAction = canStartPreparationNow || canTransitNow;
  const showTopActionPanel = canTransitAction || (access.canPrepare && currentStatus === "pending");
  let responsibleActor = "Sin actor operativo pendiente.";
  if (["pending", "preparing"].includes(currentStatus)) {
    responsibleActor = `${access.fromSiteName || "Centro"} / bodega`;
  } else if (["in_transit", "partial"].includes(currentStatus)) {
    responsibleActor = `${access.toSiteName || "Destino"} / recepción`;
  } else if (currentStatus === "received") {
    responsibleActor = "Recepción completada";
  } else if (currentStatus === "closed") {
    responsibleActor = "Flujo terminado";
  } else if (currentStatus === "cancelled") {
    responsibleActor = "Remisión cancelada";
  }
  if (isReadyToDispatch) {
    responsibleActor = `${access.fromSiteName || "Centro"} / listo para despacho`;
  }
  const phaseLabel = canEditPrepareItems
    ? "Preparacion en Centro"
    : canEditReceiveItems
      ? "Recepcion en destino"
      : null;
  const stateSupportText = canEditPrepareItems
    ? "Centro prepara y confirma lo que sale."
    : canEditReceiveItems
      ? "Tu sede registra lo recibido y, si hace falta, el faltante."
      : currentStatus === "received"
        ? "Todo quedó recibido y conciliado."
        : currentStatus === "closed"
          ? "La remisión quedó cerrada sin tareas operativas pendientes."
          : currentStatus === "cancelled"
            ? "La remisión fue cancelada y ya no tiene acciones disponibles."
            : "Sin acciones operativas pendientes.";
  const stateSupportTextEffective = isReadyToDispatch
    ? "Preparación completa. Esta remisión ya quedó lista para despacho."
    : stateSupportText;
  const roleFlowLabel = isProductionView
    ? "Centro solo prepara y despacha."
    : isSatelliteView
      ? "Tu sede solo recibe y confirma."
      : "Vista operativa";
  const compactSatelliteView = isSatelliteView && !isProductionView;
  const activeSignals = canEditPrepareItems
    ? linesMissingSourceLoc + linesPartialPreparation + linesWithoutCoveringLoc
    : canEditReceiveItems
      ? pendingReceiptLines + shortageLines
      : 0;
  const currentStatusMeta = formatStatus(currentStatus);
  const currentStatusMetaEffective = isReadyToDispatch
    ? { label: "Lista para despacho", className: "ui-chip ui-chip--success" }
    : currentStatusMeta;
  const expectedDateLabel = request.expected_date
    ? formatDate(request.expected_date ?? null)
    : "Sin fecha esperada";
  const createdAtLabel = formatDateTime(request.created_at);
  const notesLabel = request.notes ?? "-";
  const draftPrepareLines = canEditPrepareItems
    ? itemRows.map((item) => {
        const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
        const lineIdsForProduct = lineIdsByProduct.get(item.product_id) ?? [item.id];
        const vm = buildRemissionLineVm({
          item,
          currentStatus,
          canEditPrepareItems,
          canEditReceiveItems,
          showSourceLocSelector,
          availableSite,
          lineIdsForProduct,
          locCandidates: stockByLocCandidates.get(item.product_id) ?? [],
          originLocById,
          stockByLocValueMap,
          activeLineId,
          activeLineEvent,
        });
        return {
          id: item.id,
          baseItemId: item.id,
          productName: item.product?.name ?? item.product_id,
          requestedQty: roundQuantity(Number(item.quantity ?? 0)),
          unitLabel: vm.itemUnitLabel,
          selectedLocId: String(item.source_location_id ?? ""),
          recommendedLocId: vm.bestLocCandidate?.locationId ?? "",
          locOptions: vm.locCandidates.map((loc) => ({
            id: loc.locationId,
            label: loc.label,
            qty: loc.qty,
          })),
          dispatchQty: roundQuantity(
            Number(item.shipped_quantity ?? item.prepared_quantity ?? 0)
          ),
          shortageReason: "",
          isVirtualSplit: false,
        };
      })
    : [];

  return (
    <div className="ui-scene w-full space-y-6 pb-28 lg:pb-6">
      <RemissionHeroSection
        backHref={backHref}
        backLabel={backLabel}
        phaseLabel={phaseLabel}
        statusLabel={currentStatusMetaEffective.label}
        statusClassName={currentStatusMetaEffective.className}
        requestId={request.id}
        fromSiteName={access.fromSiteName || "-"}
        toSiteName={access.toSiteName || "-"}
        compactSatelliteView={compactSatelliteView}
        itemCount={itemRows.length}
        activeSignals={activeSignals}
        expectedDateLabel={
          request.expected_date ? `Entrega esperada ${expectedDateLabel}` : expectedDateLabel
        }
        responsibleActor={responsibleActor}
      />

      {!compactSatelliteView ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mt-1 ui-caption">
              {roleFlowLabel} Vista: {access.fromSiteType === "production_center" ? "Bodega (Centro)" : "Sede satelite"}.
            </p>
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">{okMsg}</div>
      ) : null}

      {isReadyToDispatch ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          Remisión lista para despacho. Siguiente paso: <strong>Despachar a destino</strong>.
        </div>
      ) : null}

      {lowStockWarning ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          Algunos productos pueden no tener stock suficiente en Centro. Bodega verificara al preparar.
        </div>
      ) : null}

      <RemissionSummarySection
        compactSatelliteView={compactSatelliteView}
        fromSiteName={access.fromSiteName || "-"}
        toSiteName={access.toSiteName || "-"}
        expectedDateLabel={expectedDateLabel}
        createdAtLabel={createdAtLabel}
        notes={notesLabel}
        currentStatusClassName={currentStatusMetaEffective.className}
        currentStatusLabel={currentStatusMetaEffective.label}
        stateSupportText={stateSupportTextEffective}
        responsibleActor={responsibleActor}
      />

      {currentStatus === "partial" && (pendingReceiptLines > 0 || shortageLines > 0) ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-2">
          Recepción parcial activa. Hay <strong>{pendingReceiptLines}</strong> linea(s) con cantidades todavía por conciliar y <strong>{shortageLines}</strong> con faltante registrado.
          {receivedLines > 0 ? ` También hay ${receivedLines} linea(s) con recepción registrada.` : ""}
        </div>
      ) : null}

      {currentStatus === "closed" ? (
        <div className="ui-alert ui-alert--neutral ui-fade-up ui-delay-2">
          Esta remisión viene de una lógica anterior con estado <strong>closed</strong>. Para operación v1 se interpreta como remisión ya recibida.
        </div>
      ) : null}

      {!canEditPrepareItems && showTopActionPanel ? (
        <RemissionTopActions
          title={isProductionView ? "Acción principal" : isSatelliteView ? "Acción principal" : "Acciones"}
          requestId={request.id}
          returnOrigin={cameFromPrepareQueue ? "prepare" : ""}
          siteId={activeSiteId}
          canPreparePending={access.canPrepare && currentStatus === "pending"}
          canStartPreparationNow={canStartPreparationNow}
          pendingLocSelectionLines={pendingLocSelectionLines}
          canTransitAction={canTransitAction}
          canTransitNow={canTransitNow}
          dispatchBlockedLines={dispatchBlockedLines}
          canReceiveAction={canReceiveAction}
          canReceivePartialAction={canReceivePartialAction}
          hasPrimaryTopAction={hasPrimaryTopAction}
        />
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="ui-h3">
          {canEditPrepareItems
            ? "Preparar salida"
            : canEditReceiveItems
              ? "Recibir remision"
              : compactSatelliteView
                ? "Productos"
                : "Items de la remision"}
        </div>
        {canEditPrepareItems ? (
          <div className="mt-4 pb-28 lg:pb-24">
            <RemissionPrepareWorkbench
              requestId={request.id}
              returnOrigin={cameFromPrepareQueue ? "prepare" : ""}
              siteId={activeSiteId}
              lines={draftPrepareLines}
              onCommit={commitPreparationDraft}
            />
          </div>
        ) : (
        <form action={updateItems} className="mt-4 space-y-4 pb-24 lg:pb-0">
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_origin" value={cameFromPrepareQueue ? "prepare" : ""} />
          <input type="hidden" name="site_id" value={activeSiteId} />

          <div className="space-y-3">
            {itemRows.map((item) => {
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const lineIdsForProduct = lineIdsByProduct.get(item.product_id) ?? [item.id];
              const vm = buildRemissionLineVm({
                item,
                currentStatus,
                canEditPrepareItems,
                canEditReceiveItems,
                showSourceLocSelector,
                availableSite,
                lineIdsForProduct,
                locCandidates: stockByLocCandidates.get(item.product_id) ?? [],
                originLocById,
                stockByLocValueMap,
                activeLineId,
                activeLineEvent,
              });
              return (
                <RemissionLineCard
                  key={item.id}
                  item={item}
                  vm={vm}
                  currentStatus={currentStatus}
                  canEditPrepareItems={canEditPrepareItems}
                  canEditReceiveItems={canEditReceiveItems}
                  showSourceLocSelector={showSourceLocSelector}
                  lineIdsForProduct={lineIdsForProduct}
                  originLocRows={originLocRows}
                />
              );
            })}
          </div>
        </form>
        )}

        {!canEditPrepareItems && (canEditPrepareItems || canEditReceiveItems) ? (
          <div className="hidden" aria-hidden="true">
            {itemRows.map((item) => {
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const lineIdsForProduct = lineIdsByProduct.get(item.product_id) ?? [item.id];
              const vm = buildRemissionLineVm({
                item,
                currentStatus,
                canEditPrepareItems,
                canEditReceiveItems,
                showSourceLocSelector,
                availableSite,
                lineIdsForProduct,
                locCandidates: stockByLocCandidates.get(item.product_id) ?? [],
                originLocById,
                stockByLocValueMap,
                activeLineId,
                activeLineEvent,
              });

              return (
                <RemissionLineHiddenActions
                  key={`hidden-actions-${item.id}`}
                  requestId={request.id}
                  activeSiteId={activeSiteId}
                  cameFromPrepareQueue={cameFromPrepareQueue}
                  item={item}
                  vm={vm}
                  canEditPrepareItems={canEditPrepareItems}
                  canEditReceiveItems={canEditReceiveItems}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

