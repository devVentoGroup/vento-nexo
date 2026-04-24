import { buildLocDisplayLabel, type LocRow, type RestockItemRow } from "./detail-utils";
import type { RemissionLineVm } from "./detail-line-vm";

type RemissionLineCardProps = {
  item: RestockItemRow;
  vm: RemissionLineVm;
  currentStatus: string;
  canEditPrepareItems: boolean;
  canEditReceiveItems: boolean;
  showSourceLocSelector: boolean;
  lineIdsForProduct: string[];
  originLocRows: LocRow[];
  /** Recepción en destino: oculta el botón “Recibir X” (se usa barra global + checkboxes). */
  batchReceiveMode?: boolean;
};

export function RemissionLineCard({
  item,
  vm,
  currentStatus,
  canEditPrepareItems,
  canEditReceiveItems,
  showSourceLocSelector,
  lineIdsForProduct,
  originLocRows,
  batchReceiveMode = false,
}: RemissionLineCardProps) {
  const splitFormId = `split-line-form-${item.id}`;
  const manualLocFormId = `manual-loc-form-${item.id}`;
  const completeLineShortcutFormId = `complete-line-shortcut-form-${item.id}`;
  const shipShortcutFormId = `ship-shortcut-form-${item.id}`;
  const setPartialPrepareFormId = `set-partial-prepare-form-${item.id}`;
  const clearPrepareShortcutFormId = `clear-prepare-shortcut-form-${item.id}`;
  const clearShipShortcutFormId = `clear-ship-shortcut-form-${item.id}`;
  const receiveAllShortcutFormId = `receive-all-shortcut-form-${item.id}`;
  const markShortageShortcutFormId = `mark-shortage-shortcut-form-${item.id}`;
  const clearReceiveShortcutFormId = `clear-receive-shortcut-form-${item.id}`;
  const setPartialReceiveFormId = `set-partial-receive-form-${item.id}`;

  const isReceiveOnly = canEditReceiveItems && !canEditPrepareItems;
  const isBatchReceiveOnly = isReceiveOnly && batchReceiveMode;

  const rootClass = isReceiveOnly
    ? [
        "relative overflow-hidden border transition",
        isBatchReceiveOnly
          ? "rounded-xl p-3 pl-[1.6rem] sm:p-3 sm:pl-6"
          : "rounded-2xl p-4 pl-[1.15rem] sm:p-5 sm:pl-6 sm:rounded-3xl",
        vm.isActiveLine
          ? "border-emerald-400 bg-gradient-to-br from-emerald-50/95 to-white shadow-[0_12px_40px_-16px_rgba(5,150,105,0.35)] ring-2 ring-emerald-200/60"
          : vm.lineCompleteReceipt
            ? "border-emerald-200/90 bg-gradient-to-br from-emerald-50/50 via-white to-white shadow-md shadow-stone-900/[0.05]"
            : "border-stone-200/90 bg-white shadow-md shadow-stone-900/[0.06]",
      ].join(" ")
    : [
        "rounded-2xl border p-4 transition",
        vm.isActiveLine
          ? "border-emerald-300 bg-emerald-50/60 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]"
          : "border-[var(--ui-border)] bg-[var(--ui-bg-soft)]",
      ].join(" ");

  return (
    <div className={rootClass}>
      {isReceiveOnly ? (
        <div
          className={[
            "absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl sm:w-1.5 sm:rounded-l-3xl",
            vm.lineCompleteReceipt
              ? "bg-gradient-to-b from-emerald-400 to-emerald-600"
              : "bg-gradient-to-b from-teal-400 to-emerald-500",
          ].join(" ")}
          aria-hidden
        />
      ) : null}

      <div className={isReceiveOnly ? "relative min-w-0" : undefined}>
      {isReceiveOnly ? (
        <div
          className={
            batchReceiveMode
              ? "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          }
        >
          <div className="min-w-0 flex-1">
            <h3
              className={
                batchReceiveMode
                  ? "text-lg font-bold leading-snug tracking-tight text-stone-900 sm:text-xl"
                  : "text-xl font-bold leading-snug tracking-tight text-stone-900 sm:text-2xl"
              }
            >
              {item.product?.name ?? item.product_id}
            </h3>
            <div className={batchReceiveMode ? "mt-1.5 flex flex-wrap items-center gap-2" : "mt-2 flex flex-wrap items-center gap-2"}>
              <span
                className={
                  batchReceiveMode
                    ? "rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-950 ring-1 ring-teal-200/90 sm:px-3 sm:py-1.5 sm:text-sm"
                    : "rounded-full bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-950 ring-1 ring-teal-200/90 sm:px-3.5 sm:py-2 sm:text-base"
                }
              >
                {vm.quantityBadgeText}
              </span>
              {lineIdsForProduct.length > 1 ? (
                <span
                  className={
                    batchReceiveMode
                      ? "rounded-full bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-200/90 sm:px-3 sm:py-1.5 sm:text-sm"
                      : "rounded-full bg-stone-50 px-3 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200/90"
                  }
                >
                  Línea {vm.splitLineIndex} de {lineIdsForProduct.length}
                </span>
              ) : null}
            </div>
          </div>
          {vm.lineCompleteReceipt ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/80 sm:text-sm">
              Conciliada
            </span>
          ) : vm.nextTaskLabel === "Lista" ? (
            <span className={vm.taskBadgeClassName}>{vm.nextTaskLabel}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="ui-h3">{item.product?.name ?? item.product_id}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[15px] font-semibold text-amber-950 shadow-sm">
                {vm.quantityBadgeText}
              </span>
              {lineIdsForProduct.length > 1 ? (
                <span className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-[13px] font-semibold text-[var(--ui-text)] shadow-sm">
                  Línea {vm.splitLineIndex} de {lineIdsForProduct.length}
                </span>
              ) : null}
            </div>
          </div>
          <span className={vm.taskBadgeClassName}>{vm.nextTaskLabel}</span>
        </div>
      )}
      {vm.isActiveLine ? (
        <div
          className={
            isReceiveOnly
              ? batchReceiveMode
                ? "mt-2 rounded-lg bg-emerald-100/90 px-3 py-2 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200/70"
                : "mt-3 rounded-xl bg-emerald-100/90 px-4 py-2.5 text-base font-semibold text-emerald-950 ring-1 ring-emerald-200/70"
              : "mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
          }
        >
          {vm.activeLineMessage}
        </div>
      ) : null}
      {vm.primaryHint ? (
        isReceiveOnly ? (
          <p
            className={
              batchReceiveMode
                ? "mt-2 rounded-lg bg-amber-50/90 px-3 py-2 text-sm leading-snug text-amber-950 ring-1 ring-amber-200/60"
                : "mt-3 rounded-lg bg-amber-50/90 px-3 py-2 text-base leading-snug text-amber-950 ring-1 ring-amber-200/60"
            }
          >
            {vm.primaryHint}
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm text-[var(--ui-muted)]">
            {vm.primaryHint}
          </div>
        )
      ) : null}
      {vm.canSplitLine ? (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-3">
          <div className="text-sm text-[var(--ui-muted)]">
            Se va a dividir en <strong>{vm.suggestedSplitQty} + {vm.remainingSplitQty} {vm.itemUnitLabel}</strong>.
          </div>
          <div className="mt-3">
            <input
              type="hidden"
              name={`split_quantity_${item.id}`}
              value={vm.suggestedSplitQty}
              form={splitFormId}
            />
            <button
              type="submit"
              form={splitFormId}
              className="ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
            >
              Dividir automáticamente
            </button>
          </div>
        </div>
      ) : null}

      <input type="hidden" name="item_id" value={item.id} />

      <div className="mt-4 space-y-3">
        {showSourceLocSelector && canEditPrepareItems && !vm.canSplitLine ? (
          <>
            <input type="hidden" name="source_location_id" value={item.source_location_id ?? ""} />
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
              {item.source_location_id ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                  {vm.selectedOriginLabel} · {vm.availableAtSelectedLoc} {vm.itemUnitLabel}
                </div>
              ) : null}

              {!item.source_location_id && vm.quickLocCandidates.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {vm.quickLocCandidates.map((candidate, index) => {
                    const isBest = index === 0;
                    const isSelected = candidate.locationId === item.source_location_id;
                    return (
                      <button
                        key={`${item.id}-${candidate.locationId}`}
                        type="submit"
                        form={`choose-loc-form-${item.id}-${candidate.locationId}`}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                            : isBest
                              ? "border-amber-200 bg-amber-50 text-[var(--ui-text)] hover:border-amber-300 hover:bg-amber-100"
                              : "border-[var(--ui-border)] bg-[var(--ui-bg-soft)] text-[var(--ui-text)] hover:border-[var(--ui-brand)] hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-base font-semibold">{candidate.label}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            isSelected
                              ? "bg-emerald-200 text-emerald-900"
                              : isBest
                                ? "bg-amber-200 text-amber-900"
                                : "bg-white text-[var(--ui-muted)]"
                          }`}>
                            {isSelected ? "Elegido" : isBest ? "Recomendado" : "Disponible"}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-[var(--ui-muted)]">
                          {candidate.qty} {vm.itemUnitLabel} disponibles
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : !item.source_location_id ? (
                <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm text-[var(--ui-muted)]">
                  No hay áreas con stock para este producto.
                </div>
              ) : null}

              <details className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                  {item.source_location_id ? "Cambiar área" : "Ver más áreas"}
                </summary>
                <div className="mt-3 flex flex-col gap-3 md:max-w-xl">
                  <label className="flex flex-col gap-1">
                    <span className="ui-caption">Otra área</span>
                    <select
                      name={`manual_loc_id_${item.id}`}
                      form={manualLocFormId}
                      defaultValue={item.source_location_id ?? ""}
                      className="ui-input h-12 min-w-0"
                    >
                      <option value="">Selecciona área</option>
                      {originLocRows.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {buildLocDisplayLabel(loc)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    form={manualLocFormId}
                    className="ui-btn ui-btn--ghost h-11 w-full text-sm font-semibold md:w-auto"
                  >
                    Usar esta área
                  </button>
                </div>
              </details>
            </div>
          </>
        ) : (
          <input type="hidden" name="source_location_id" value={item.source_location_id ?? ""} />
        )}
        <div className="space-y-3">
          {canEditPrepareItems && item.source_location_id && currentStatus === "preparing" ? (
            vm.shippedQty > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-sm font-semibold text-emerald-950">Hecha</div>
                <div className="mt-1 text-sm text-emerald-900">
                  Ya quedaron marcadas {vm.shippedQty} {vm.itemUnitLabel} para esta línea.
                </div>
                <details className="mt-3 rounded-xl border border-emerald-200 bg-[var(--ui-bg)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-950">
                    Cambiar esta línea
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      form={clearShipShortcutFormId}
                      className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                    >
                      Limpiar envío
                    </button>
                  </div>
                </details>
              </div>
            ) : vm.preparedQty > 0 ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                <div className="text-sm text-[var(--ui-muted)]">
                  Preparado: <strong className="text-[var(--ui-text)]">{vm.preparedQty} {vm.itemUnitLabel}</strong>
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    form={shipShortcutFormId}
                    className="ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
                    disabled={vm.availableAtSelectedLoc < vm.requestedQty}
                  >
                    Marcar lista para despacho
                  </button>
                </div>
                <details className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Cambiar o ajustar
                  </summary>
                  <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                    <div className="ui-caption">Enviar cantidad parcial</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="ui-caption">Cantidad a enviar</span>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          max={Math.min(vm.requestedQty, vm.availableAtSelectedLoc)}
                          name="prepare_qty"
                          defaultValue={vm.preparedQty > 0 ? vm.preparedQty : Math.min(vm.requestedQty, vm.availableAtSelectedLoc)}
                          form={setPartialPrepareFormId}
                          className="ui-input h-11"
                        />
                      </label>
                      <button
                        type="submit"
                        form={setPartialPrepareFormId}
                        className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                      >
                        Guardar parcial
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      form={clearPrepareShortcutFormId}
                      className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                    >
                      Volver atrás
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                <div className="text-sm text-[var(--ui-muted)]">
                  Área: <strong className="text-[var(--ui-text)]">{vm.selectedOriginLabel}</strong>
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    form={completeLineShortcutFormId}
                    className="ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
                    disabled={vm.availableAtSelectedLoc < vm.requestedQty}
                  >
                    {vm.availableAtSelectedLoc >= vm.requestedQty
                      ? `Preparar ${vm.requestedQty} ${vm.itemUnitLabel}`
                      : `No alcanza para ${vm.requestedQty} ${vm.itemUnitLabel}`}
                  </button>
                </div>
                <details className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Cambiar o ajustar
                  </summary>
                  <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                    <div className="ui-caption">Preparar cantidad parcial</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="ui-caption">Cantidad a enviar</span>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          max={Math.min(vm.requestedQty, vm.availableAtSelectedLoc)}
                          name="prepare_qty"
                          defaultValue={Math.min(vm.requestedQty, vm.availableAtSelectedLoc)}
                          form={setPartialPrepareFormId}
                          className="ui-input h-11"
                        />
                      </label>
                      <button
                        type="submit"
                        form={setPartialPrepareFormId}
                        className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                      >
                        Guardar parcial
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      form={clearPrepareShortcutFormId}
                      className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                    >
                      Limpiar preparación
                    </button>
                  </div>
                </details>
              </div>
            )
          ) : canEditPrepareItems ? (
            <>
              <input type="hidden" name="prepared_quantity" value={item.prepared_quantity ?? 0} />
              <input type="hidden" name="shipped_quantity" value={item.shipped_quantity ?? 0} />
            </>
          ) : null}
          {canEditPrepareItems && item.source_location_id && currentStatus === "pending" ? (
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
              <div className="text-sm text-[var(--ui-muted)]">
                Área: <strong className="text-[var(--ui-text)]">{vm.selectedOriginLabel}</strong>
              </div>
              <div className="mt-2 text-sm text-[var(--ui-muted)]">
                Sigue asignando las áreas faltantes. Cuando todas las líneas tengan una, se habilitará <strong>Empezar preparación</strong>.
              </div>
            </div>
          ) : null}
          {canEditReceiveItems ? (
            vm.lineCompleteReceipt ? (
              <div
                className={
                  isReceiveOnly
                    ? "mt-5 flex flex-col gap-3 border-t border-emerald-100/90 pt-5 sm:flex-row sm:items-center sm:justify-between"
                    : "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                }
              >
                <div>
                  <p
                    className={
                      isReceiveOnly
                        ? "text-lg font-bold text-emerald-900 sm:text-xl"
                        : "text-sm font-semibold text-emerald-900"
                    }
                  >
                    Recepción completa
                  </p>
                  <p
                    className={
                      isReceiveOnly
                        ? "mt-1 text-base text-emerald-800/90 sm:text-lg"
                        : "mt-1 text-sm text-emerald-800/80"
                    }
                  >
                    {vm.receivedQty} {vm.itemUnitLabel} conciliadas en esta línea.
                  </p>
                </div>
                <span
                  className={
                    isReceiveOnly
                      ? "inline-flex w-fit shrink-0 items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-emerald-900/15"
                      : "ui-chip ui-chip--success"
                  }
                >
                  Todo listo
                </span>
              </div>
            ) : (
              <div
                className={
                  isReceiveOnly
                    ? "mt-5 space-y-4 border-t border-stone-100 pt-5"
                    : "mt-0 space-y-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3"
                }
              >
                <p
                  className={
                    isReceiveOnly
                      ? "text-base leading-relaxed text-stone-600 sm:text-lg"
                      : "text-sm font-semibold text-[var(--ui-text)]"
                  }
                >
                  {isReceiveOnly
                    ? batchReceiveMode
                      ? vm.linePartialReceipt
                        ? `Ya registraste ${vm.receivedQty} ${vm.itemUnitLabel}. Marca la casilla cuando hayas verificado el físico; la barra inferior registra todo junto, o usa Más opciones para faltante o parcial.`
                        : vm.shippedQty > 0
                          ? `${vm.shippedQty} ${vm.itemUnitLabel} enviadas desde el centro. Marca la casilla cuando las tengas listas; la confirmación es global abajo.`
                          : "Esta línea aún no tiene envío confirmado hacia tu sede."
                      : vm.linePartialReceipt
                        ? `Ya registraste ${vm.receivedQty} ${vm.itemUnitLabel}. Puedes completar la línea o ajustar abajo si hace falta.`
                        : vm.shippedQty > 0
                          ? `${vm.shippedQty} ${vm.itemUnitLabel} enviadas desde el centro. Confirma que recibiste todo.`
                          : "Esta línea aún no tiene envío confirmado hacia tu sede."
                    : vm.linePartialReceipt
                      ? `Van ${vm.receivedQty} ${vm.itemUnitLabel} recibidas.`
                      : vm.shippedQty > 0
                        ? `${vm.shippedQty} ${vm.itemUnitLabel} salieron hacia esta sede.`
                        : "Esta línea todavía no tiene envío confirmado."}
                </p>
                {!isReceiveOnly ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    Acción principal
                  </div>
                ) : null}
                {!(isReceiveOnly && batchReceiveMode) ? (
                  <button
                    type="submit"
                    form={receiveAllShortcutFormId}
                    disabled={vm.shippedQty <= 0}
                    className={
                      isReceiveOnly
                        ? "h-14 w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-lg font-bold text-white shadow-lg shadow-teal-900/20 transition hover:from-teal-500 hover:to-emerald-500 hover:shadow-xl disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:text-stone-500 disabled:opacity-70 disabled:shadow-none"
                        : "ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
                    }
                  >
                    {vm.shippedQty > 0
                      ? `Recibir ${vm.shippedQty} ${vm.itemUnitLabel}`
                      : "Nada por recibir aún"}
                  </button>
                ) : null}

                <details
                  className={
                    isReceiveOnly
                      ? "group rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/60 open:border-stone-300 open:bg-stone-50"
                      : "rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2"
                  }
                >
                  <summary
                    className={
                      isReceiveOnly
                        ? batchReceiveMode
                          ? "cursor-pointer list-none px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden sm:px-4 sm:py-3"
                          : "cursor-pointer list-none px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden sm:px-5 sm:py-4"
                        : "cursor-pointer text-sm font-semibold text-[var(--ui-text)]"
                    }
                  >
                    {isReceiveOnly ? (
                      <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="text-base font-semibold text-stone-800 sm:text-lg">
                          Más opciones
                        </span>
                        <span className="text-sm font-normal text-stone-500">
                          Faltante · cantidad distinta · limpiar
                        </span>
                      </span>
                    ) : (
                      "Cambiar o ajustar"
                    )}
                  </summary>
                  <div
                    className={
                      isReceiveOnly
                        ? batchReceiveMode
                          ? "space-y-3 border-t border-stone-200/80 px-3 pb-4 pt-3 sm:px-4"
                          : "space-y-5 border-t border-stone-200/80 px-4 pb-5 pt-4 sm:px-5"
                        : "mt-3 space-y-3"
                    }
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {vm.shippedQty > 0 && vm.remainingReceiptQty > 0 ? (
                        <button
                          type="submit"
                          form={markShortageShortcutFormId}
                          className={
                            isReceiveOnly
                              ? batchReceiveMode
                                ? "h-10 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
                                : "h-12 rounded-xl border border-amber-200 bg-amber-50 px-5 text-base font-semibold text-amber-950 transition hover:bg-amber-100"
                              : "ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                          }
                        >
                          Marcar faltante {vm.remainingReceiptQty} {vm.itemUnitLabel}
                        </button>
                      ) : null}
                      {vm.accountedQty > 0 ? (
                        <button
                          type="submit"
                          form={clearReceiveShortcutFormId}
                          className={
                            isReceiveOnly
                              ? batchReceiveMode
                                ? "h-10 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                                : "h-12 rounded-xl border border-stone-200 bg-white px-5 text-base font-semibold text-stone-700 transition hover:bg-stone-50"
                              : "ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                          }
                        >
                          Limpiar recepción
                        </button>
                      ) : null}
                    </div>
                    {vm.shippedQty > 0 ? (
                      <div className={isReceiveOnly ? "space-y-3" : "space-y-2"}>
                        <div>
                          <p
                            className={
                              isReceiveOnly
                                ? "text-sm font-semibold text-stone-800 sm:text-base"
                                : "ui-caption"
                            }
                          >
                            {isReceiveOnly
                              ? "Recibir otra cantidad"
                              : "Recibir cantidad diferente"}
                          </p>
                          {isReceiveOnly ? (
                            <p className="mt-1 text-sm text-stone-500">
                              Si no llegó todo lo enviado, indica cuánto recibiste.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span
                              className={
                                isReceiveOnly
                                  ? "text-sm font-medium text-stone-700"
                                  : "ui-caption"
                              }
                            >
                              Cantidad recibida
                            </span>
                            <input
                              type="number"
                              step="any"
                              min={0}
                              max={vm.shippedQty}
                              name="receive_qty"
                              defaultValue={vm.receivedQty > 0 ? vm.receivedQty : vm.shippedQty}
                              form={setPartialReceiveFormId}
                              className={
                                isReceiveOnly
                                  ? batchReceiveMode
                                    ? "ui-input h-10 text-base font-semibold tabular-nums"
                                    : "ui-input h-12 text-lg font-semibold tabular-nums"
                                  : "ui-input h-11"
                              }
                            />
                          </label>
                          <button
                            type="submit"
                            form={setPartialReceiveFormId}
                            className={
                              isReceiveOnly
                                ? batchReceiveMode
                                  ? "h-10 shrink-0 rounded-lg bg-stone-800 px-5 text-sm font-bold text-white transition hover:bg-stone-700"
                                  : "h-12 shrink-0 rounded-xl bg-stone-800 px-6 text-base font-bold text-white transition hover:bg-stone-700"
                                : "ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                            }
                          >
                            Guardar parcial
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            )
          ) : null}
        </div>
      </div>
      </div>
      <input type="hidden" name="item_area_kind" value={item.production_area_kind ?? ""} />
    </div>
  );
}
