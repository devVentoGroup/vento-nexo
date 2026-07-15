import { roundQuantity } from "@/lib/inventory/uom";

import {
  type LocRow,
  type RestockItemRow,
  buildLocDisplayLabel,
  deriveItemStatus,
  formatStatus,
  formatUnitLabel,
} from "./detail-utils";

export type LocCandidate = {
  locationId: string;
  code: string;
  label: string;
  qty: number;
};

export type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function getMeasurementModeFromItem(item: RestockItemRow): MeasurementMode {
  const row = item as RestockItemRow & {
    measurement_mode?: unknown;
    product?: (RestockItemRow["product"] & { measurement_mode?: unknown }) | null;
  };

  return normalizeMeasurementMode(row.measurement_mode ?? row.product?.measurement_mode);
}

function getMeasurementModeLabel(mode: MeasurementMode): string {
  switch (mode) {
    case "variable_weight":
      return "Peso real";
    case "count_with_weight":
      return "Conteo + peso real";
    case "bulk_volume":
      return "Cantidad real";
    default:
      return "Presentación fija";
  }
}

function getActualQuantityLabel(mode: MeasurementMode): string {
  switch (mode) {
    case "variable_weight":
    case "count_with_weight":
      return "peso real";
    case "bulk_volume":
      return "cantidad real";
    default:
      return "cantidad";
  }
}


type BuildRemissionLineVmParams = {
  item: RestockItemRow;
  currentStatus: string;
  canEditPrepareItems: boolean;
  canEditReceiveItems: boolean;
  showSourceLocSelector: boolean;
  availableSite: number;
  lineIdsForProduct: string[];
  locCandidates: LocCandidate[];
  originLocById: Map<string, LocRow>;
  stockByLocValueMap: Map<string, number>;
  activeLineId: string;
  activeLineEvent: string;
};

export function buildRemissionLineVm(params: BuildRemissionLineVmParams) {
  const {
    item,
    currentStatus,
    canEditPrepareItems,
    canEditReceiveItems,
    showSourceLocSelector,
    availableSite,
    lineIdsForProduct,
    locCandidates,
    originLocById,
    stockByLocValueMap,
    activeLineId,
    activeLineEvent,
  } = params;

  const measurementMode = getMeasurementModeFromItem(item);
  const usesActualQuantity = measurementMode !== "fixed_presentation";
  const measurementModeLabel = getMeasurementModeLabel(measurementMode);
  const actualQuantityLabel = getActualQuantityLabel(measurementMode);
  const requestedQty = roundQuantity(Number(item.quantity ?? 0));
  const splitLineIndex = Math.max(lineIdsForProduct.indexOf(item.id), 0) + 1;
  const plannedQtyPreview = Math.max(
    roundQuantity(Number(item.prepared_quantity ?? 0)),
    roundQuantity(Number(item.shipped_quantity ?? 0))
  );
  const targetQtyForOrdering = plannedQtyPreview > 0 ? plannedQtyPreview : requestedQty;
  const sortedLocCandidates = [...locCandidates].sort((a, b) => {
    const aCovers = a.qty >= targetQtyForOrdering;
    const bCovers = b.qty >= targetQtyForOrdering;
    if (aCovers && !bCovers) return -1;
    if (!aCovers && bCovers) return 1;
    if (aCovers && bCovers) {
      const aSlack = a.qty - targetQtyForOrdering;
      const bSlack = b.qty - targetQtyForOrdering;
      return aSlack - bSlack || a.code.localeCompare(b.code);
    }
    return b.qty - a.qty || a.code.localeCompare(b.code);
  });
  const quickLocCandidates = sortedLocCandidates.slice(0, 3);
  const bestLocCandidate = sortedLocCandidates[0] ?? null;
  const selectedOriginLoc = item.source_location_id
    ? originLocById.get(item.source_location_id) ?? null
    : null;
  const selectedOriginLabel = item.source_location_id
    ? buildLocDisplayLabel(
        selectedOriginLoc ?? {
          id: item.source_location_id,
          code: null,
          description:
            sortedLocCandidates.find((candidate) => candidate.locationId === item.source_location_id)
              ?.label ?? null,
        }
      )
    : "";
  const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
  const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
  const receivedQty = roundQuantity(Number(item.received_quantity ?? 0));
  const shortageQty = roundQuantity(Number(item.shortage_quantity ?? 0));
  const plannedQty = Math.max(preparedQty, shippedQty);
  const quantityVarianceQty = roundQuantity(plannedQty - requestedQty);
  const quantityVarianceAbs = roundQuantity(Math.abs(quantityVarianceQty));
  const quantityVarianceLabel =
    requestedQty > 0 && plannedQty > 0 && quantityVarianceAbs > 0
      ? `${quantityVarianceAbs} ${formatUnitLabel(item.stock_unit_code ?? item.unit ?? item.product?.unit ?? "")} ${
          quantityVarianceQty > 0 ? "sobre lo solicitado" : "por debajo de lo solicitado"
        }`
      : "";
  const accountedQty = roundQuantity(receivedQty + shortageQty);
  const availableAtSelectedLoc = item.source_location_id
    ? stockByLocValueMap.get(`${item.source_location_id}|${item.product_id}`) ?? 0
    : 0;
  const itemUnitLabel = formatUnitLabel(
    item.stock_unit_code ?? item.unit ?? item.product?.unit ?? ""
  );
  const requestPolicyLabel = String(item.request_policy_label ?? "").trim();
  const requestedPolicyQty = roundQuantity(Number(item.requested_policy_qty ?? 0));
  const requestPolicySummary =
    requestPolicyLabel && requestedPolicyQty > 0
      ? `${requestedPolicyQty} ${requestPolicyLabel} · equivale a ${requestedQty} ${itemUnitLabel}`
      : "";
  const missingSourceLoc =
    canEditPrepareItems && showSourceLocSelector && plannedQty > 0 && !item.source_location_id;
  const overSiteStock = canEditPrepareItems && plannedQty > availableSite;
  const overLocStock =
    canEditPrepareItems && Boolean(item.source_location_id) && plannedQty > availableAtSelectedLoc;
  const linePreparationPartial =
    canEditPrepareItems &&
    !usesActualQuantity &&
    plannedQty > 0 &&
    requestedQty > 0 &&
    plannedQty < requestedQty;
  const lineActualQuantityDiffers =
    canEditPrepareItems &&
    usesActualQuantity &&
    plannedQty > 0 &&
    requestedQty > 0 &&
    quantityVarianceAbs > 0;
  const targetQtyForLoc = plannedQty > 0 ? plannedQty : requestedQty;
  const lineWithoutCoveringLoc =
    canEditPrepareItems &&
    !usesActualQuantity &&
    targetQtyForLoc > 0 &&
    targetQtyForLoc <= availableSite &&
    (bestLocCandidate?.qty ?? 0) < targetQtyForLoc;
  const canSplitLine =
    canEditPrepareItems &&
    !usesActualQuantity &&
    lineWithoutCoveringLoc &&
    requestedQty > 0 &&
    preparedQty === 0 &&
    shippedQty === 0 &&
    receivedQty === 0 &&
    shortageQty === 0 &&
    (bestLocCandidate?.qty ?? 0) > 0 &&
    (bestLocCandidate?.qty ?? 0) < requestedQty;
  const suggestedSplitQty = canSplitLine
    ? roundQuantity(Math.min(bestLocCandidate?.qty ?? 0, requestedQty))
    : 0;
  const remainingSplitQty = canSplitLine
    ? roundQuantity(requestedQty - suggestedSplitQty)
    : requestedQty;
  // El shortage es alerta/faltante, no "conciliación". Lo que determina conciliación es received.
  const linePendingReceipt =
    canEditReceiveItems && shippedQty > 0 && receivedQty <= 0 && shortageQty <= 0;
  const linePartialReceipt =
    canEditReceiveItems &&
    shippedQty > 0 &&
    receivedQty < shippedQty &&
    (receivedQty > 0 || shortageQty > 0);
  const lineCompleteReceipt = canEditReceiveItems && shippedQty > 0 && receivedQty >= shippedQty;
  const remainingReceiptQty = roundQuantity(Math.max(shippedQty - receivedQty, 0));
  const lineStatusLabel = canEditPrepareItems
    ? currentStatus === "pending"
      ? item.source_location_id
        ? "Área elegida"
        : lineWithoutCoveringLoc
          ? "Área insuficiente"
          : "Elegir área"
      : missingSourceLoc
        ? "Área pendiente"
        : shippedQty > 0
          ? usesActualQuantity
            ? "Cantidad real lista"
            : "Lista para despachar"
          : preparedQty > 0
            ? usesActualQuantity
              ? "Real preparado"
              : "Preparado"
            : linePreparationPartial
              ? "Preparación parcial"
              : lineWithoutCoveringLoc
                ? "Área insuficiente"
                : "Pendiente de preparación"
    : canEditReceiveItems
      ? linePartialReceipt
        ? "Recepción parcial"
        : lineCompleteReceipt
          ? "Conciliada"
          : linePendingReceipt
            ? "Pendiente de recepción"
            : "Sin envío"
      : formatStatus(
          currentStatus === "cancelled"
            ? "cancelled"
            : item.item_status ||
              deriveItemStatus({
                requestedQty,
                preparedQty,
                shippedQty,
                receivedQty,
                shortageQty,
              })
        ).label;
  const prepareStepLabel =
    currentStatus === "pending"
      ? !item.source_location_id
        ? "Paso 1: elige el área"
        : "Área lista"
      : !item.source_location_id
        ? "Paso 1: elige el área"
        : preparedQty <= 0
          ? usesActualQuantity
            ? `Paso 2: registra ${actualQuantityLabel}`
            : "Paso 2: indica cuánto preparas"
          : shippedQty <= 0
            ? usesActualQuantity
              ? "Paso 3: confirma salida real"
              : "Paso 3: confirma cuánto sale"
            : "Lista para despacho";
  const receiveStepLabel =
    receivedQty <= 0 && shortageQty <= 0
      ? usesActualQuantity
        ? `Paso 1: registra ${actualQuantityLabel} recibido`
        : "Paso 1: registra lo recibido"
      : linePartialReceipt
        ? "Pendiente de conciliación"
        : "Línea conciliada";
  const stepLabel = canEditPrepareItems
    ? prepareStepLabel
    : canEditReceiveItems
      ? receiveStepLabel
      : lineStatusLabel;
  const primaryHint = canEditPrepareItems
    ? overSiteStock
      ? "La cantidad supera el stock total de la sede."
      : overLocStock
        ? "La cantidad supera el disponible del área elegida."
        : lineWithoutCoveringLoc
          ? "Ninguna área alcanza sola."
          : lineActualQuantityDiffers
            ? `Cantidad real registrada: ${plannedQty} ${itemUnitLabel}; diferencia ${quantityVarianceLabel}.`
            : linePreparationPartial
            ? "La preparación va corta frente a lo solicitado."
            : ""
    : canEditReceiveItems
      ? linePartialReceipt
        ? `Van ${receivedQty} ${itemUnitLabel} recibidas y ${shortageQty} ${itemUnitLabel} faltantes.`
        : ""
      : "";
  const nextTaskLabel = canEditPrepareItems
    ? currentStatus === "pending"
      ? canSplitLine
        ? "Divide esta línea"
        : !item.source_location_id
          ? "Elegir área"
          : "Área lista"
      : canSplitLine
        ? "Divide esta línea"
        : !item.source_location_id
          ? "Elegir área"
          : shippedQty > 0
            ? "Lista"
            : preparedQty > 0
              ? "Enviar"
              : "Preparar"
    : canEditReceiveItems
      ? lineCompleteReceipt
        ? "Lista"
        : "Recibir"
      : stepLabel;
  const taskBadgeClassName =
    nextTaskLabel === "Lista"
      ? "ui-chip ui-chip--success"
      : nextTaskLabel === "Divide esta línea"
        ? "ui-chip ui-chip--warn"
        : "ui-chip ui-chip--brand";
  const isActiveLine = activeLineId === item.id;
  const activeLineMessage = !isActiveLine
    ? ""
    : activeLineEvent === "loc"
      ? "Área guardada."
      : activeLineEvent === "complete_line"
        ? "Línea lista para despacho."
        : activeLineEvent === "prepare_auto"
          ? "Preparación guardada."
          : activeLineEvent === "set_prepare_partial"
            ? usesActualQuantity
            ? "Cantidad real guardada."
            : "Envío parcial guardado."
            : activeLineEvent === "ship_prepared"
              ? "Salida confirmada."
              : activeLineEvent === "receive_all"
                ? "Recepción guardada."
                : activeLineEvent === "set_partial"
                  ? "Recepción parcial guardada."
                  : activeLineEvent === "mark_shortage"
                    ? "Faltante guardado."
                    : activeLineEvent === "clear_prepare" ||
                        activeLineEvent === "clear_ship" ||
                        activeLineEvent === "clear_receive"
                      ? "Línea limpiada."
                      : "Línea actualizada.";
  const quantityBadgeText = canEditPrepareItems
    ? shippedQty > 0
      ? usesActualQuantity
        ? `${shippedQty} ${itemUnitLabel} reales listas`
        : `${shippedQty} ${itemUnitLabel} listas`
      : preparedQty > 0
        ? usesActualQuantity
          ? `${preparedQty} ${itemUnitLabel} reales preparadas`
          : `${preparedQty} ${itemUnitLabel} preparadas`
        : usesActualQuantity
          ? `${requestedQty} ${itemUnitLabel} solicitadas`
          : `${requestedQty} ${itemUnitLabel} por preparar`
    : canEditReceiveItems
      ? receivedQty > 0
        ? usesActualQuantity
          ? `${receivedQty} ${itemUnitLabel} reales recibidas`
          : `${receivedQty} ${itemUnitLabel} recibidas`
        : usesActualQuantity
          ? `${shippedQty} ${itemUnitLabel} reales por recibir`
          : `${shippedQty} ${itemUnitLabel} por recibir`
      : usesActualQuantity
        ? `${requestedQty} ${itemUnitLabel} solicitadas`
        : `${requestedQty} ${itemUnitLabel}`;

  return {
    measurementMode,
    usesActualQuantity,
    measurementModeLabel,
    actualQuantityLabel,
    requestedQty,
    splitLineIndex,
    locCandidates: sortedLocCandidates,
    quickLocCandidates,
    bestLocCandidate,
    selectedOriginLabel,
    preparedQty,
    shippedQty,
    receivedQty,
    shortageQty,
    plannedQty,
    quantityVarianceQty,
    quantityVarianceAbs,
    quantityVarianceLabel,
    accountedQty,
    availableSite,
    availableAtSelectedLoc,
    itemUnitLabel,
    missingSourceLoc,
    overSiteStock,
    overLocStock,
    linePreparationPartial,
    lineActualQuantityDiffers,
    targetQtyForLoc,
    lineWithoutCoveringLoc,
    canSplitLine,
    suggestedSplitQty,
    remainingSplitQty,
    linePendingReceipt,
    linePartialReceipt,
    lineCompleteReceipt,
    remainingReceiptQty,
    lineStatusLabel,
    stepLabel,
    primaryHint,
    nextTaskLabel,
    taskBadgeClassName,
    isActiveLine,
    activeLineMessage,
    quantityBadgeText,
    requestPolicySummary,
  };
}

export type RemissionLineVm = ReturnType<typeof buildRemissionLineVm>;
