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
}: RemissionLineCardProps) {
  const splitFormId = `split-line-form-${item.id}`;
  const manualLocFormId = `manual-loc-form-${item.id}`;
  const completeLineShortcutFormId = `complete-line-shortcut-form-${item.id}`;
  const setPartialPrepareFormId = `set-partial-prepare-form-${item.id}`;
  const clearPrepareShortcutFormId = `clear-prepare-shortcut-form-${item.id}`;
  const clearShipShortcutFormId = `clear-ship-shortcut-form-${item.id}`;
  const receiveAllShortcutFormId = `receive-all-shortcut-form-${item.id}`;
  const markShortageShortcutFormId = `mark-shortage-shortcut-form-${item.id}`;
  const clearReceiveShortcutFormId = `clear-receive-shortcut-form-${item.id}`;
  const setPartialReceiveFormId = `set-partial-receive-form-${item.id}`;

  return (
    <div
      className={`rounded-[24px] border p-4 transition ${
        vm.isActiveLine
          ? "border-emerald-300 bg-emerald-50/60 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]"
          : "border-[var(--ui-border)] bg-[var(--ui-bg-soft)]"
      }`}
    >
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
      {vm.isActiveLine ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-900">
          {vm.activeLineMessage}
        </div>
      ) : null}
      {vm.primaryHint ? (
        <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-3 py-2.5 text-sm text-[var(--ui-muted)]">
          {vm.primaryHint}
        </div>
      ) : null}
      {vm.canSplitLine ? (
        <div className="mt-3 rounded-2xl border border-dashed border-[var(--ui-border)] bg-white px-4 py-4">
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
            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              {item.source_location_id ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
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
                        className={`rounded-2xl border px-4 py-4 text-left shadow-sm transition ${
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
                <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3 text-sm text-[var(--ui-muted)]">
                  No hay LOC con stock para este producto.
                </div>
              ) : null}

              <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                  {item.source_location_id ? "Cambiar LOC" : "Ver más LOCs"}
                </summary>
                <div className="mt-3 flex flex-col gap-3 md:max-w-xl">
                  <label className="flex flex-col gap-1">
                    <span className="ui-caption">Otro LOC</span>
                    <select
                      name={`manual_loc_id_${item.id}`}
                      form={manualLocFormId}
                      defaultValue={item.source_location_id ?? ""}
                      className="ui-input h-12 min-w-0"
                    >
                      <option value="">Selecciona LOC</option>
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
                    className="ui-btn ui-btn--ghost h-12 w-full text-base font-semibold md:w-auto"
                  >
                    Usar este LOC
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
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-950">Hecha</div>
                <div className="mt-1 text-sm text-emerald-900">
                  Ya quedaron marcadas {vm.shippedQty} {vm.itemUnitLabel} para esta línea.
                </div>
                <details className="mt-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
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
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="text-sm text-[var(--ui-muted)]">
                  Preparado: <strong className="text-[var(--ui-text)]">{vm.preparedQty} {vm.itemUnitLabel}</strong>
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    form={completeLineShortcutFormId}
                    className="ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
                    disabled={vm.availableAtSelectedLoc < vm.requestedQty}
                  >
                    Dejar lista la línea
                  </button>
                </div>
                <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Cambiar o ajustar
                  </summary>
                  <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                    <div className="ui-caption">Enviar cantidad parcial</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="ui-caption">Cantidad a enviar</span>
                        <input
                          type="number"
                          step="0.01"
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
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="text-sm text-[var(--ui-muted)]">
                  LOC: <strong className="text-[var(--ui-text)]">{vm.selectedOriginLabel}</strong>
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
                <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Cambiar o ajustar
                  </summary>
                  <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                    <div className="ui-caption">Preparar cantidad parcial</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="ui-caption">Cantidad a enviar</span>
                        <input
                          type="number"
                          step="0.01"
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
            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <div className="text-sm text-[var(--ui-muted)]">
                LOC: <strong className="text-[var(--ui-text)]">{vm.selectedOriginLabel}</strong>
              </div>
              <div className="mt-2 text-sm text-[var(--ui-muted)]">
                Sigue asignando los LOC faltantes. Cuando todas las líneas tengan uno, se habilitará <strong>Empezar preparación</strong>.
              </div>
            </div>
          ) : null}
          {canEditReceiveItems ? (
            vm.lineCompleteReceipt ? (
              <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_40px_-28px_rgba(16,185,129,0.45)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">
                      Recepción completa
                    </div>
                    <div className="mt-1 text-sm text-emerald-800/80">
                      Quedó conciliada con {vm.receivedQty} {vm.itemUnitLabel} recibidas.
                    </div>
                  </div>
                  <span className="ui-chip ui-chip--success">Todo listo</span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Ahora: recibir
                </div>
                <div className="mt-1 text-sm text-[var(--ui-muted)]">
                  {vm.linePartialReceipt
                    ? `Van ${vm.receivedQty} ${vm.itemUnitLabel} recibidas.`
                    : vm.shippedQty > 0
                      ? `${vm.shippedQty} ${vm.itemUnitLabel} salieron hacia esta sede.`
                      : "Esta línea todavía no tiene envío confirmado."}
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    form={receiveAllShortcutFormId}
                    className="ui-btn ui-btn--action ui-btn--compact w-full px-4 text-sm font-semibold sm:w-auto"
                    disabled={vm.shippedQty <= 0}
                  >
                    {vm.shippedQty > 0 ? `Recibir ${vm.shippedQty} ${vm.itemUnitLabel}` : "Recibir todo"}
                  </button>
                </div>
                <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Cambiar o ajustar
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {vm.shippedQty > 0 && vm.remainingReceiptQty > 0 ? (
                      <button
                        type="submit"
                        form={markShortageShortcutFormId}
                        className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                      >
                        Marcar faltante {vm.remainingReceiptQty} {vm.itemUnitLabel}
                      </button>
                    ) : null}
                    {vm.accountedQty > 0 ? (
                      <button
                        type="submit"
                        form={clearReceiveShortcutFormId}
                        className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                      >
                        Limpiar
                      </button>
                    ) : null}
                  </div>
                  {vm.shippedQty > 0 ? (
                    <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                      <div className="ui-caption">Recibir cantidad diferente</div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="ui-caption">Cantidad recibida</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={vm.shippedQty}
                            name="receive_qty"
                            defaultValue={vm.receivedQty > 0 ? vm.receivedQty : vm.shippedQty}
                            form={setPartialReceiveFormId}
                            className="ui-input h-11"
                          />
                        </label>
                        <button
                          type="submit"
                          form={setPartialReceiveFormId}
                          className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                        >
                          Guardar parcial
                        </button>
                      </div>
                    </div>
                  ) : null}
                </details>
              </div>
            )
          ) : null}
        </div>
      </div>
      <input type="hidden" name="item_area_kind" value={item.production_area_kind ?? ""} />
    </div>
  );
}
