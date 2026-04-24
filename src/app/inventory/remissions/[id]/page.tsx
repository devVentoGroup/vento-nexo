import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { roundQuantity } from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import { loadAccessContext } from "./detail-access";
import {
  commitPreparationDraft,
  submitTransitChecklist,
  updateItems,
  updateStatus,
} from "./detail-actions";
import { ConductorTransitChecklistForm } from "./conductor-transit-checklist-form";
import { RemissionPrepareWorkbench } from "./prepare-workbench";
import { RemissionLineCard } from "./detail-line-card";
import { RemissionLineHiddenActions } from "./detail-line-hidden-actions";
import { ReceiveBatchCompactProductLine, ReceiveBatchShell } from "./receive-batch-shell";
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
  parseShortageReasonFromItemNotes,
  plannedDispatchQtyFromItem,
} from "./detail-utils";
import { buildPrepareFingerprintHash } from "./prepare-fingerprint";

export const dynamic = "force-dynamic";
const APP_ID = "nexo";

type TraceEmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
};

function displayTraceEmployee(employee?: TraceEmployeeRow | null): string {
  if (!employee) return "-";
  return String(employee.alias ?? employee.full_name ?? employee.id).trim() || employee.id;
}

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
  /** ready_dispatch se muestra en un solo banner dedicado (evita triplicar avisos). */
  const okMsg =
    sp.ok === "ready_dispatch"
      ? ""
      : sp.ok === "created"
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
  const cameFromTransitQueue = sp.from === "transit";
  const activeSiteId = String(sp.site_id ?? "").trim();
  const backHref = cameFromTransitQueue
    ? activeSiteId
      ? `/inventory/remissions/transit?site_id=${encodeURIComponent(activeSiteId)}`
      : "/inventory/remissions/transit"
    : cameFromPrepareQueue
      ? activeSiteId
        ? `/inventory/remissions/prepare?site_id=${encodeURIComponent(activeSiteId)}`
        : "/inventory/remissions/prepare"
      : activeSiteId
        ? `/inventory/remissions?site_id=${encodeURIComponent(activeSiteId)}`
        : "/inventory/remissions";
  const backLabel = cameFromTransitQueue
    ? "Volver a cola de tránsito"
    : cameFromPrepareQueue
      ? "Volver a cola de preparacion"
      : "Volver a remisiones";

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
      "id, product_id, quantity, unit, input_qty, input_unit_code, stock_unit_code, source_location_id, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity, notes, item_status, production_area_kind, product:products(name,unit,stock_unit_code)"
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

  const traceEmployeeIds = Array.from(
    new Set(
      [
        String(request.created_by ?? ""),
        String(request.prepared_by ?? ""),
        String(request.in_transit_by ?? ""),
        String(request.received_by ?? ""),
      ].filter(Boolean)
    )
  );
  const { data: traceEmployeesData } = traceEmployeeIds.length
    ? await supabase
        .from("employees")
        .select("id,full_name,alias")
        .in("id", traceEmployeeIds)
    : { data: [] as TraceEmployeeRow[] };
  const traceEmployeeMap = new Map(
    ((traceEmployeesData ?? []) as TraceEmployeeRow[]).map((employee) => [
      employee.id,
      displayTraceEmployee(employee),
    ])
  );

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
  const isConductorTransitReview = !canEditPrepareItems && canTransitAction;
  const isReceiveDestinationFlow = canEditReceiveItems && !canEditPrepareItems;
  const isReceiveFirstPass = isReceiveDestinationFlow && currentStatus === "in_transit";
  const isReceivePartialFollowUp = isReceiveDestinationFlow && currentStatus === "partial";
  const receiveBatchEligibleIds = isReceiveDestinationFlow
    ? itemRows
      .filter((item) => {
        const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
        const receivedQty = roundQuantity(Number(item.received_quantity ?? 0));
        const shortageQty = roundQuantity(Number(item.shortage_quantity ?? 0));
        const pendingQty = roundQuantity(Math.max(shippedQty - receivedQty - shortageQty, 0));

        return shippedQty > 0 && pendingQty > 0;
      })
      .map((item) => item.id)
    : [];
  const receiveBatchEligibleIdSet = new Set(receiveBatchEligibleIds);

  const receiveBatchEligibleProductGroups = isReceiveDestinationFlow
    ? (() => {
      const map = new Map<string, string[]>();
      for (const item of itemRows) {
        if (!receiveBatchEligibleIdSet.has(item.id)) continue;
        const list = map.get(item.product_id) ?? [];
        list.push(item.id);
        map.set(item.product_id, list);
      }
      return [...map.entries()].map(([productId, itemIds]) => ({
        productId,
        itemIds,
      }));
    })()
    : [];
  const isReadyToDispatch = currentStatus === "preparing" && summary.can_transit;
  const editPrepareRaw = sp.edit_prepare;
  const editPrepareVal = Array.isArray(editPrepareRaw) ? editPrepareRaw[0] : editPrepareRaw;
  const editPrepareRequested = String(editPrepareVal ?? "").trim() === "1";
  const allowPrepareCorrection = isReadyToDispatch && editPrepareRequested;
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
  const phaseLabel = isConductorTransitReview
    ? "Modo Conductor"
    : canEditPrepareItems
      ? allowPrepareCorrection
        ? "Modo Bodeguero · Corregir"
        : "Modo Bodeguero"
      : isReceivePartialFollowUp
        ? "Recepción parcial abierta"
        : canEditReceiveItems
          ? "Recepción en destino"
          : null;
  const stateSupportText = canEditPrepareItems
    ? "Centro prepara y confirma lo que sale."
    : isReceivePartialFollowUp
      ? "La remisión sigue abierta: registra una llegada adicional o resuelve la diferencia pendiente."
      : canEditReceiveItems
        ? "Tu sede registra lo que llegó hoy. Si no llega todo, la remisión queda abierta para seguimiento."
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
  const roleFlowLabel = isConductorTransitReview
    ? "Conductor valida checklist y pone en tránsito."
    : isProductionView
      ? "Bodeguero prepara y marca lista para despacho."
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
  const totalShippedQty = itemRows.reduce(
    (sum, item) => sum + roundQuantity(Number(item.shipped_quantity ?? 0)),
    0
  );
  const totalReceivedQty = itemRows.reduce(
    (sum, item) => sum + roundQuantity(Number(item.received_quantity ?? 0)),
    0
  );
  const totalShortageQty = itemRows.reduce(
    (sum, item) => sum + roundQuantity(Number(item.shortage_quantity ?? 0)),
    0
  );
  const totalPendingResolutionQty = itemRows.reduce((sum, item) => {
    const shipped = roundQuantity(Number(item.shipped_quantity ?? 0));
    const received = roundQuantity(Number(item.received_quantity ?? 0));
    const shortage = roundQuantity(Number(item.shortage_quantity ?? 0));
    return sum + roundQuantity(Math.max(shipped - received - shortage, 0));
  }, 0);

  const receivePanelTitle = isReceivePartialFollowUp
    ? "Resolver recepción parcial"
    : isReceiveFirstPass
      ? "Registrar recepción"
      : "Recibir remisión";

  const receivePanelDescription = isReceivePartialFollowUp
    ? "Esta remisión ya tiene una recepción registrada. Ahora define lo que falta por resolver: registrar una llegada adicional o cerrar la diferencia."
    : isReceiveFirstPass
      ? "Registra lo que llegó hoy. Si no llegó todo, la remisión quedará abierta para seguimiento."
      : "Marca los productos con la casilla. Nada se guarda hasta registrar recepción. Nota opcional debajo.";

  const partialResolutionBanner =
    currentStatus === "partial" && (pendingReceiptLines > 0 || shortageLines > 0);
  const expectedDateLabel = request.expected_date
    ? formatDate(request.expected_date ?? null)
    : "Sin fecha esperada";
  const createdAtLabel = formatDateTime(request.created_at);
  const notesLabel = request.notes ?? "-";
  const receivedSignaturePresent =
    Boolean(request.received_by) ||
    (currentStatus === "received" && Boolean(request.received_at));
  const traceability = [
    {
      label: "Solicitud",
      value: request.created_by
        ? traceEmployeeMap.get(String(request.created_by)) ?? String(request.created_by)
        : "Pendiente",
      at: request.created_at ? formatDateTime(request.created_at) : "",
      done: Boolean(request.created_by),
    },
    {
      label: "Preparacion",
      value: request.prepared_by
        ? traceEmployeeMap.get(String(request.prepared_by)) ?? String(request.prepared_by)
        : "Pendiente",
      at: request.prepared_at ? formatDateTime(request.prepared_at) : "",
      done: Boolean(request.prepared_by),
    },
    {
      label: "Transito",
      value: request.in_transit_by
        ? traceEmployeeMap.get(String(request.in_transit_by)) ?? String(request.in_transit_by)
        : "Pendiente",
      at: request.in_transit_at ? formatDateTime(request.in_transit_at) : "",
      done: Boolean(request.in_transit_by),
    },
    {
      label: "Recepcion",
      value: request.received_by
        ? traceEmployeeMap.get(String(request.received_by)) ?? String(request.received_by)
        : receivedSignaturePresent
          ? "Recepcion registrada (firma historica no disponible)"
          : "Pendiente",
      at: request.received_at ? formatDateTime(request.received_at) : "",
      done: receivedSignaturePresent,
    },
  ];
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
        dispatchQty: plannedDispatchQtyFromItem(item),
        shortageReason: parseShortageReasonFromItemNotes(item.notes),
        isVirtualSplit: false,
      };
    })
    : [];

  const detailNavFrom = cameFromPrepareQueue
    ? "prepare"
    : cameFromTransitQueue
      ? "transit"
      : undefined;
  const prepareSummaryHref = buildRemissionDetailHref({
    requestId: request.id,
    siteId: activeSiteId || undefined,
    from: detailNavFrom,
  });
  const correctPrepareWorkbenchHref = buildRemissionDetailHref({
    requestId: request.id,
    siteId: activeSiteId || undefined,
    from: detailNavFrom,
    editPrepare: true,
  });

  const transitPrepareFingerprint = buildPrepareFingerprintHash(itemRows);

  const conductorTransitLines = itemRows.map((item) => {
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    const locId = item.source_location_id ?? null;
    const locRow = locId ? originLocById.get(locId) : undefined;
    let locDetail: string | null = null;
    if (locId) {
      if (locRow) {
        const label = buildLocDisplayLabel(locRow);
        locDetail = label === "LOC" ? `ID ${locId.slice(0, 8)}…` : label;
      } else {
        locDetail = `ID ubicación ${locId.slice(0, 8)}…`;
      }
    }
    const unitLabel = formatUnitLabel(
      item.stock_unit_code ?? item.unit ?? item.product?.stock_unit_code
    );
    return {
      id: item.id,
      productName: String(item.product?.name ?? item.product_id),
      quantity: plannedQty,
      unitLabel,
      locDetail,
    };
  });

  const deliveryStatusLabel =
    currentStatus === "received"
      ? request.received_at
        ? `Entrega registrada ${formatDate(request.received_at)}`
        : "Entrega registrada"
      : request.expected_date
        ? `Entrega esperada ${expectedDateLabel}`
        : expectedDateLabel;

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
        expectedDateLabel={deliveryStatusLabel}
        responsibleActor={responsibleActor}
        traceability={traceability}
      />

      {!compactSatelliteView ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mt-1 ui-caption">
              {roleFlowLabel} Vista: {access.fromSiteType === "production_center" ? "Bodega (Centro)" : "Sede satelite"}.
            </p>
            {isConductorTransitReview ? (
              <div className="mt-2 inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">
                Checklist de tránsito activo
              </div>
            ) : canEditPrepareItems ? (
              <div
                className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${allowPrepareCorrection
                  ? "bg-amber-200 text-amber-950"
                  : "bg-amber-100 text-amber-900"
                  }`}
              >
                {allowPrepareCorrection ? "Corrigiendo preparación" : "Preparación de bodega activa"}
              </div>
            ) : null}
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

      {sp.ok === "ready_dispatch" ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          Cambios guardados: la remisión quedó <strong>lista para despacho</strong>. El conductor debe
          revisar el checklist y poner en tránsito; siguiente paso operativo:{" "}
          <strong>despachar a destino</strong>.
        </div>
      ) : isReadyToDispatch ? (
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
        traceability={traceability}
      />

      {partialResolutionBanner ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-2">
          <strong>Recepción parcial abierta.</strong> Faltan unidades por registrar o resolver.
          {totalPendingResolutionQty > 0 ? (
            <>
              {" "}
              Pendiente por resolver: <strong>{totalPendingResolutionQty}</strong>.
            </>
          ) : null}
          {totalShortageQty > 0 ? (
            <>
              {" "}
              Faltante registrado: <strong>{totalShortageQty}</strong>.
            </>
          ) : null}
          {" "}Siguiente paso: registra una llegada adicional o cierra la diferencia.
        </div>
      ) : null}

      {isReceiveDestinationFlow ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="ui-h3">
                {isReceivePartialFollowUp ? "Resumen de conciliación" : "Resumen de recepción"}
              </div>
              <div className="mt-1 ui-caption">
                {isReceivePartialFollowUp
                  ? "Esta remisión sigue abierta hasta que la diferencia quede resuelta."
                  : "Verifica lo enviado contra lo que estás registrando en destino."}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-caption">Enviado total</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {totalShippedQty}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-caption">Recibido acumulado</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {totalReceivedQty}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-caption">Pendiente por resolver</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {totalPendingResolutionQty}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-caption">Faltante registrado</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {totalShortageQty}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {currentStatus === "closed" ? (
        <div className="ui-alert ui-alert--neutral ui-fade-up ui-delay-2">
          Esta remisión viene de una lógica anterior con estado <strong>closed</strong>. Para operación v1 se interpreta como remisión ya recibida.
        </div>
      ) : null}

      {!isConductorTransitReview && !canEditPrepareItems && showTopActionPanel ? (
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

      {isConductorTransitReview ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2 overflow-hidden border-stone-200/80 bg-gradient-to-b from-amber-50/40 via-[var(--ui-bg)] to-[var(--ui-bg)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <span className="inline-flex items-center rounded-full bg-amber-100/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900/80 ring-1 ring-amber-200/60">
                Conductor
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Checklist de tránsito
              </h2>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
                Marca cada ítem al verificarlo. Las notas y la ubicación están en el panel opcional de
                abajo.
              </p>
            </div>
          </div>
          <ConductorTransitChecklistForm
            formAction={submitTransitChecklist}
            requestId={request.id}
            returnOrigin={
              cameFromPrepareQueue ? "prepare" : cameFromTransitQueue ? "transit" : ""
            }
            siteId={activeSiteId}
            prepareFingerprint={transitPrepareFingerprint}
            lines={conductorTransitLines}
            canTransitNow={canTransitNow}
          />
        </div>
      ) : null}

      <div
        className={
          isReceiveDestinationFlow
            ? "ui-panel ui-remission-section ui-fade-up ui-delay-3 overflow-hidden border-stone-200/80 bg-gradient-to-b from-emerald-50/40 via-[var(--ui-bg)] to-[var(--ui-bg)]"
            : "ui-panel ui-remission-section ui-fade-up ui-delay-3"
        }
      >
        {isReceiveDestinationFlow ? (
          <div className="mb-5">
            <span className="inline-flex items-center rounded-full bg-emerald-100/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-900/85 ring-1 ring-emerald-200/60">
              {isReceivePartialFollowUp ? "Seguimiento" : "Recepción"}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              {receivePanelTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">
              {receivePanelDescription}
            </p>
          </div>
        ) : (
          <div className="ui-h3">
            {isConductorTransitReview
              ? "Resumen de insumos listos"
              : canEditPrepareItems
                ? allowPrepareCorrection
                  ? "Modo Bodeguero · Corregir preparación"
                  : isReadyToDispatch
                    ? "Modo Bodeguero · Lista para despacho"
                    : "Modo Bodeguero · Preparar salida"
                : canEditReceiveItems
                  ? "Recibir remision"
                  : compactSatelliteView
                    ? "Productos"
                    : "Items de la remision"}
          </div>
        )}
        {canEditPrepareItems ? (
          <div
            className={
              isReadyToDispatch && !allowPrepareCorrection ? "mt-4 pb-6" : "mt-4 pb-28 lg:pb-24"
            }
          >
            {allowPrepareCorrection ? (
              <div className="ui-alert ui-alert--warn mb-3 ui-fade-up">
                <p className="text-sm font-medium text-[var(--ui-text)]">
                  Estás corrigiendo una remisión que ya estaba lista para despacho. El conductor debe
                  volver a revisar antes de poner en tránsito.
                </p>
                <Link
                  href={prepareSummaryHref}
                  className="mt-2 inline-block text-sm font-semibold text-[var(--ui-text)] underline underline-offset-4"
                >
                  Ver solo resumen
                </Link>
              </div>
            ) : null}
            <RemissionPrepareWorkbench
              requestId={request.id}
              returnOrigin={cameFromPrepareQueue ? "prepare" : ""}
              siteId={activeSiteId}
              lines={draftPrepareLines}
              onCommit={commitPreparationDraft}
              dispatchReadySummary={isReadyToDispatch && !allowPrepareCorrection}
              correctPrepareHref={
                isReadyToDispatch ? correctPrepareWorkbenchHref : undefined
              }
            />
          </div>
        ) : isReceiveDestinationFlow ? (
          <ReceiveBatchShell
            requestId={request.id}
            returnOrigin={cameFromPrepareQueue ? "prepare" : ""}
            siteId={activeSiteId}
            eligibleProductGroups={receiveBatchEligibleProductGroups}
          >
            {isReceivePartialFollowUp ? (
              <>
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <strong>Recepción parcial abierta.</strong> Usa este paso para registrar una llegada adicional de lo pendiente.
                  {totalPendingResolutionQty > 0 ? (
                    <>
                      {" "}Todavía quedan <strong>{totalPendingResolutionQty}</strong> unidad(es) por resolver.
                    </>
                  ) : null}
                </div>

                {totalPendingResolutionQty > 0 ? (
                  <div className="mb-4 rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--ui-text)]">
                          ¿Ya no llegará más mercancía?
                        </div>
                        <div className="mt-1 text-sm text-[var(--ui-muted)]">
                          Cierra toda la diferencia pendiente como faltante registrado.
                        </div>
                      </div>

                      <form action={updateStatus} className="shrink-0">
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="site_id" value={activeSiteId} />
                        <input type="hidden" name="action" value="resolve_shortage" />
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-200"
                        >
                          Cerrar diferencia como faltante
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="mt-4 space-y-3 sm:space-y-4">
              {(() => {
                const eligibleItems = itemRows.filter((item) => receiveBatchEligibleIdSet.has(item.id));
                const groupsByProduct = new Map<string, typeof eligibleItems>();
                for (const it of eligibleItems) {
                  const list = groupsByProduct.get(it.product_id) ?? [];
                  list.push(it);
                  groupsByProduct.set(it.product_id, list);
                }

                return [...groupsByProduct.entries()].map(([productId, groupItems]) => {
                  const first = groupItems[0];
                  const productName = first?.product?.name ?? productId;
                  const unitLabel = formatUnitLabel(
                    first.stock_unit_code ?? first.unit ?? first.product?.unit ?? ""
                  );

                  const shippedQtyTotal = groupItems.reduce((acc, it) => {
                    const shipped = roundQuantity(Number(it.shipped_quantity ?? 0));
                    return acc + shipped;
                  }, 0);

                  const pendingQtyTotal = groupItems.reduce((acc, it) => {
                    const shipped = roundQuantity(Number(it.shipped_quantity ?? 0));
                    const received = roundQuantity(Number(it.received_quantity ?? 0));
                    const shortage = roundQuantity(Number(it.shortage_quantity ?? 0));
                    const pending = roundQuantity(Math.max(shipped - received - shortage, 0));
                    return acc + pending;
                  }, 0);

                  const itemIds = groupItems.map((it) => it.id);
                  const itemPendingQtys = groupItems.map((it) => {
                    const shipped = roundQuantity(Number(it.shipped_quantity ?? 0));
                    const received = roundQuantity(Number(it.received_quantity ?? 0));
                    const shortage = roundQuantity(Number(it.shortage_quantity ?? 0));
                    return roundQuantity(Math.max(shipped - received - shortage, 0));
                  });

                  const receivedQtyTotal = groupItems.reduce((acc, it) => {
                    const received = roundQuantity(Number(it.received_quantity ?? 0));
                    return acc + received;
                  }, 0);

                  const shortageQtyTotal = groupItems.reduce((acc, it) => {
                    const shortage = roundQuantity(Number(it.shortage_quantity ?? 0));
                    return acc + shortage;
                  }, 0);

                  return (
                    <div key={productId} className="space-y-2">
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--ui-text)]">
                              {productName}
                            </div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">
                              Enviado: {shippedQtyTotal} {unitLabel} · Recibido acumulado: {receivedQtyTotal} {unitLabel} · Pendiente: {pendingQtyTotal} {unitLabel} · Faltante registrado: {shortageQtyTotal} {unitLabel}
                            </div>
                          </div>
                          <div>
                            {pendingQtyTotal > 0 ? (
                              <span className="ui-chip ui-chip--warn">Pendiente por resolver</span>
                            ) : shortageQtyTotal > 0 ? (
                              <span className="ui-chip ui-chip--warn">Cerrado con faltante</span>
                            ) : (
                              <span className="ui-chip ui-chip--success">Conciliado</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <ReceiveBatchCompactProductLine
                        key={productId}
                        productId={productId}
                        itemIds={itemIds}
                        itemPendingQtys={itemPendingQtys}
                        productName={productName}
                        unitLabel={unitLabel}
                        shippedQtyTotal={shippedQtyTotal}
                        pendingQtyTotal={pendingQtyTotal}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          </ReceiveBatchShell>
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

