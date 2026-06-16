"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useRef, useState } from "react";

import {
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type LocOption = { id: string; code: string | null; zone: string | null; description?: string | null };
type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  available_qty?: number | null;
};

type DraftLine = {
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
};

type ReadyLine = {
  product: ProductOption;
  quantity: number;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
  quantityInStock: number;
  stockUnitCode: string;
  availableQty: number;
};

type Props = {
  locations: LocOption[];
  defaultLocationId: string;
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  siteId: string;
  openedFromQr?: boolean;
  mode?: "satellite" | "center" | "general";
  siteLabel?: string;
  returnTo?: string;
  action: (formData: FormData) => void | Promise<void>;
};

function buildLocLabel(loc: LocOption | null | undefined) {
  if (!loc) return "Área seleccionada";
  const description = String(loc.description ?? "").trim();
  const zone = String(loc.zone ?? "").trim();
  return description || zone || "Área seleccionada";
}

function buildProductLabel(product: ProductOption) {
  return String(product.name ?? "").trim() || "Insumo sin nombre";
}

function getStockUnitCode(product: ProductOption) {
  return normalizeUnitCode(product.stock_unit_code ?? product.unit ?? "un") || "un";
}

function parseQuantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function estimateQuantityInStock(params: {
  quantityInInput: number;
  inputUnitCode: string;
  stockUnitCode: string;
  profile: ProductUomProfile | null;
}) {
  const { quantityInInput, inputUnitCode, stockUnitCode, profile } = params;
  if (!Number.isFinite(quantityInInput) || quantityInInput <= 0) return 0;
  if (normalizeUnitCode(inputUnitCode) === normalizeUnitCode(stockUnitCode)) return quantityInInput;
  if (!profile) return quantityInInput;

  const qtyInInputUnit = Number(profile.qty_in_input_unit);
  const qtyInStockUnit = Number(profile.qty_in_stock_unit);
  if (!Number.isFinite(qtyInInputUnit) || qtyInInputUnit <= 0 || !Number.isFinite(qtyInStockUnit)) {
    return quantityInInput;
  }

  return (quantityInInput * qtyInStockUnit) / qtyInInputUnit;
}

export function WithdrawForm({
  locations,
  defaultLocationId,
  products,
  defaultUomProfiles = [],
  siteId,
  openedFromQr = false,
  mode = "general",
  siteLabel = "",
  returnTo = "/inventory/stock",
  action,
}: Props) {
  const [locationId, setLocationId] = useState((defaultLocationId || locations[0]?.id) ?? "");
  const [draftsByProduct, setDraftsByProduct] = useState<Record<string, DraftLine>>({});
  const [clientError, setClientError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const allowSubmitRef = useRef(false);

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId) ?? null,
    [locationId, locations]
  );

  const visibleProducts = useMemo(
    () =>
      [...products]
        .filter((product) => Boolean(product.id))
        .sort((a, b) => buildProductLabel(a).localeCompare(buildProductLabel(b), "es")),
    [products]
  );

  const defaultProfileByProduct = useMemo(() => {
    const profilesByProduct = new Map<string, ProductUomProfile[]>();
    for (const profile of defaultUomProfiles) {
      if (!profile.is_active || !profile.is_default) continue;
      const productId = String(profile.product_id).trim();
      const current = profilesByProduct.get(productId) ?? [];
      current.push(profile);
      profilesByProduct.set(productId, current);
    }
    const selected = new Map<string, ProductUomProfile>();
    for (const [productId, profiles] of profilesByProduct.entries()) {
      const preferred = selectProductUomProfileForContext({
        profiles,
        productId,
        context: "remission",
      });
      if (preferred) selected.set(productId, preferred);
    }
    return selected;
  }, [defaultUomProfiles]);

  const selectedLocLabel = buildLocLabel(selectedLocation);
  const modeHint =
    mode === "satellite"
      ? "Retira solo lo que sale realmente de esta área."
      : mode === "center"
        ? "Descuenta consumos reales desde esta ubicación."
        : "Captura cantidades por insumo y confirma el resumen antes de registrar.";

  const buildDefaultDraft = (product: ProductOption): DraftLine => {
    const stockUnitCode = getStockUnitCode(product);
    const defaultProfile = defaultProfileByProduct.get(product.id) ?? null;
    const preferredUnit = normalizeUnitCode(defaultProfile?.input_unit_code ?? "") || stockUnitCode;
    return {
      quantity: "",
      inputUnitCode: preferredUnit,
      inputUomProfileId: defaultProfile?.id ?? "",
      notes: "",
    };
  };

  const getDraft = (product: ProductOption) => ({
    ...buildDefaultDraft(product),
    ...(draftsByProduct[product.id] ?? {}),
  });

  const updateDraft = (product: ProductOption, patch: Partial<DraftLine>) => {
    setDraftsByProduct((prev) => ({
      ...prev,
      [product.id]: {
        ...buildDefaultDraft(product),
        ...(prev[product.id] ?? {}),
        ...patch,
      },
    }));
  };

  const applyDelta = (product: ProductOption, delta: number) => {
    const draft = getDraft(product);
    const current = parseQuantity(draft.quantity);
    const next = Math.max(0, current + delta);
    updateDraft(product, { quantity: next > 0 ? formatQty(next) : "" });
  };

  const linesReady = useMemo<ReadyLine[]>(() => {
    return visibleProducts
      .map((product) => {
        const stockUnitCode = getStockUnitCode(product);
        const defaultProfile = defaultProfileByProduct.get(product.id) ?? null;
        const draft: DraftLine = draftsByProduct[product.id] ?? {
          quantity: "",
          inputUnitCode: normalizeUnitCode(defaultProfile?.input_unit_code ?? "") || stockUnitCode,
          inputUomProfileId: defaultProfile?.id ?? "",
          notes: "",
        };
        const quantity = parseQuantity(draft.quantity);
        const inputUnitCode = normalizeUnitCode(draft.inputUnitCode || stockUnitCode);
        const selectedProfile =
          draft.inputUomProfileId && defaultProfile?.id === draft.inputUomProfileId ? defaultProfile : null;
        const quantityInStock = estimateQuantityInStock({
          quantityInInput: quantity,
          inputUnitCode,
          stockUnitCode,
          profile: selectedProfile,
        });
        return {
          product,
          quantity,
          inputUnitCode,
          inputUomProfileId: draft.inputUomProfileId,
          notes: draft.notes,
          quantityInStock,
          stockUnitCode,
          availableQty: Number(product.available_qty ?? 0),
        };
      })
      .filter((line) => line.quantity > 0 && Boolean(line.inputUnitCode));
  }, [defaultProfileByProduct, draftsByProduct, visibleProducts]);

  const invalidLines = useMemo(
    () => linesReady.filter((line) => line.availableQty > 0 && line.quantityInStock > line.availableQty + 0.000001),
    [linesReady]
  );

  const canSubmit = Boolean(siteId && locationId && linesReady.length > 0 && invalidLines.length === 0);
  const totalAvailableProducts = visibleProducts.length;

  const handleAreaChange = (nextLocationId: string) => {
    setLocationId(nextLocationId);
    const url = new URL(window.location.href);
    url.searchParams.set("loc_id", nextLocationId);
    url.searchParams.delete("loc");
    window.location.href = `${url.pathname}?${url.searchParams.toString()}`;
  };

  const handleSubmitAttempt = (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    if (!canSubmit) {
      event.preventDefault();
      if (invalidLines.length > 0) {
        setClientError("Hay cantidades mayores al stock disponible del área. Ajustalas antes de registrar.");
      } else {
        setClientError("Captura al menos un insumo con cantidad mayor a 0 antes de registrar el retiro.");
      }
      return;
    }

    if (!allowSubmitRef.current) {
      event.preventDefault();
      setClientError("");
      setConfirmOpen(true);
      return;
    }

    setClientError("");
    setIsSubmitting(true);
  };

  if (!siteId) {
    return (
      <div className="ui-panel ui-remission-section">
        <p className="ui-body-muted">Selecciona una sede activa para retirar insumos.</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="ui-panel ui-remission-section space-y-3">
        <p className="ui-body-muted">
          No hay áreas configuradas en esta sede. Puede que la sede activa no tenga ubicaciones o que el QR abra un área de otra sede.
        </p>
        <Link href="/inventory/locations" className="ui-btn ui-btn--ghost ui-btn--sm">
          Ir a áreas
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        id="withdraw-quick-form"
        action={action}
        onSubmit={handleSubmitAttempt}
        className="space-y-5 pb-28 lg:pb-0"
      >
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="location_id" value={locationId} />
        <div aria-live="polite" className="sr-only">
          {isSubmitting ? "Registrando retiro" : clientError}
        </div>

        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="ui-h3">Origen</div>
              <div className="ui-caption mt-1">Área desde donde sale el inventario.</div>
            </div>
            {!openedFromQr ? (
              <label className="flex flex-col gap-1 sm:min-w-[260px]">
                <span className="ui-label">Cambiar área</span>
                <select
                  value={locationId}
                  onChange={(event) => handleAreaChange(event.target.value)}
                  className="ui-input h-12"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {buildLocLabel(loc)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--ui-brand)]/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16)_0%,rgba(255,255,255,0.96)_100%)] p-4 shadow-sm sm:p-5">
            <div className="ui-caption font-semibold text-[var(--ui-brand)]">
              {openedFromQr ? "Área abierta desde QR" : "Área activa"}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)] sm:text-3xl">
              {selectedLocLabel}
            </div>
            <div className="mt-1 text-sm text-[var(--ui-muted)]">
              {modeHint} {siteLabel ? `Sede: ${siteLabel}.` : ""}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Insumos en área</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{totalAvailableProducts}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Seleccionados</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{linesReady.length}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={returnTo} className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold sm:w-auto">
              Volver al área
            </Link>
            {selectedLocation ? (
              <Link href={`${returnTo}/board`} className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold sm:w-auto">
                Ver contenido del área
              </Link>
            ) : null}
          </div>
        </section>

        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
          <div>
            <div className="ui-h3">Insumos en esta área</div>
            <div className="ui-caption mt-1">
              Solo aparecen insumos con stock disponible en el área seleccionada.
            </div>
          </div>

          {visibleProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-5 text-sm text-[var(--ui-muted)]">
              No hay insumos con stock registrado en esta área. No se puede registrar un retiro desde un área vacía.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleProducts.map((product) => {
                const stockUnitCode = getStockUnitCode(product);
                const defaultProfile = defaultProfileByProduct.get(product.id) ?? null;
                const draft = getDraft(product);
                const availableQty = Number(product.available_qty ?? 0);
                const selectedUnit = normalizeUnitCode(draft.inputUnitCode || stockUnitCode);
                const selectedProfile =
                  draft.inputUomProfileId && defaultProfile?.id === draft.inputUomProfileId ? defaultProfile : null;
                const quantity = parseQuantity(draft.quantity);
                const quantityInStock = estimateQuantityInStock({
                  quantityInInput: quantity,
                  inputUnitCode: selectedUnit,
                  stockUnitCode,
                  profile: selectedProfile,
                });
                const isSelected = quantity > 0;
                const exceedsStock = availableQty > 0 && quantityInStock > availableQty + 0.000001;
                const hasAlternateUnit =
                  defaultProfile && normalizeUnitCode(defaultProfile.input_unit_code) !== normalizeUnitCode(stockUnitCode);

                return (
                  <article
                    key={product.id}
                    className={`rounded-2xl border p-4 shadow-sm transition sm:p-5 ${
                      isSelected
                        ? "border-[var(--ui-brand)]/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,248,235,0.94)_100%)]"
                        : "border-[var(--ui-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,252,0.96)_100%)]"
                    }`}
                  >
                    <input type="hidden" name="item_product_id" value={product.id} />
                    <input type="hidden" name="item_input_unit_code" value={selectedUnit} />
                    <input type="hidden" name="item_input_uom_profile_id" value={draft.inputUomProfileId} />
                    <input type="hidden" name="item_quantity_in_input" value={draft.quantity} />
                    <input type="hidden" name="item_notes" value={draft.notes} />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-[var(--ui-text)] sm:text-lg">
                          {buildProductLabel(product)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">
                            Disponible: {formatQty(availableQty)} {stockUnitCode}
                          </span>
                          {isSelected ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                              En retiro
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2 sm:w-[240px]">
                        <button
                          type="button"
                          onClick={() => applyDelta(product, -1)}
                          className="ui-btn ui-btn--ghost h-12 px-0 text-lg"
                          aria-label={`Restar cantidad de ${buildProductLabel(product)}`}
                        >
                          -
                        </button>
                        <label className="flex flex-col gap-1">
                          <span className="sr-only">Cantidad a retirar</span>
                          <input
                            name="item_quantity"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={draft.quantity}
                            onChange={(event) => updateDraft(product, { quantity: event.target.value })}
                            className={`ui-input h-12 text-center text-lg font-semibold ${exceedsStock ? "border-red-300 bg-red-50 text-red-900" : ""}`}
                            inputMode="decimal"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => applyDelta(product, 1)}
                          className="ui-btn ui-btn--ghost h-12 px-0 text-lg"
                          aria-label={`Sumar cantidad de ${buildProductLabel(product)}`}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="flex flex-col gap-1">
                        <span className="ui-label">Unidad de retiro</span>
                        {hasAlternateUnit ? (
                          <select
                            value={selectedUnit}
                            onChange={(event) => {
                              const nextUnit = normalizeUnitCode(event.target.value);
                              updateDraft(product, {
                                inputUnitCode: nextUnit,
                                inputUomProfileId:
                                  defaultProfile && normalizeUnitCode(defaultProfile.input_unit_code) === nextUnit
                                    ? defaultProfile.id
                                    : "",
                              });
                            }}
                            className="ui-input h-12"
                          >
                            <option value={stockUnitCode}>{stockUnitCode}</option>
                            <option value={normalizeUnitCode(defaultProfile.input_unit_code)}>
                              {normalizeUnitCode(defaultProfile.input_unit_code)} ({defaultProfile.label})
                            </option>
                          </select>
                        ) : (
                          <div className="flex h-12 items-center rounded-xl border border-[var(--ui-border)] bg-white px-3 text-sm font-semibold text-[var(--ui-text)]">
                            {stockUnitCode}
                          </div>
                        )}
                      </div>

                      {isSelected ? (
                        <button
                          type="button"
                          onClick={() => updateDraft(product, { quantity: "", notes: "" })}
                          className="ui-btn ui-btn--ghost h-12 text-sm font-semibold"
                        >
                          Limpiar
                        </button>
                      ) : null}
                    </div>

                    {exceedsStock ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                        La cantidad supera el stock disponible en esta área.
                      </div>
                    ) : null}

                    {isSelected ? (
                      <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
                        <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                          Nota opcional
                        </summary>
                        <label className="mt-3 flex flex-col gap-1">
                          <span className="ui-label">Detalle interno</span>
                          <input
                            placeholder="Ej. producción, merma, mise en place"
                            value={draft.notes}
                            onChange={(event) => updateDraft(product, { notes: event.target.value })}
                            className="ui-input h-11"
                          />
                        </label>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          {clientError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {clientError}
            </div>
          ) : null}
        </section>

        {confirmOpen ? (
          <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="withdraw-confirm-title"
              className="max-h-[85vh] w-full overflow-auto rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-2xl sm:max-w-lg"
            >
              <div className="space-y-1">
                <div id="withdraw-confirm-title" className="ui-h3">Resumen del retiro</div>
                <div className="ui-caption">Revisa antes de descontar inventario.</div>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
                <div className="ui-caption">Área</div>
                <div className="mt-1 font-semibold text-[var(--ui-text)]">{selectedLocLabel}</div>
              </div>

              <div className="mt-4 space-y-2">
                {linesReady.map((line) => (
                  <div key={line.product.id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[var(--ui-text)]">{buildProductLabel(line.product)}</div>
                      <div className="text-xs text-[var(--ui-muted)]">
                        Disponible: {formatQty(line.availableQty)} {line.stockUnitCode}
                      </div>
                    </div>
                    <div className="whitespace-nowrap font-semibold text-[var(--ui-text)]">
                      {formatQty(line.quantity)} {line.inputUnitCode}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold"
                >
                  Seguir editando
                </button>
                <button
                  type="submit"
                  onClick={() => {
                    allowSubmitRef.current = true;
                    setConfirmOpen(false);
                  }}
                  className="ui-btn ui-btn--brand h-12 w-full text-sm font-semibold"
                >
                  Confirmar retiro
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>

      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-3 space-y-4">
          <div>
            <div className="ui-h3">Resumen</div>
            <div className="ui-caption mt-1">Lo seleccionado se revisa antes de registrar.</div>
          </div>

          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
            <div className="ui-caption">Área</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">{selectedLocLabel}</div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Insumos en área</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{totalAvailableProducts}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Seleccionados</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{linesReady.length}</div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
            <div className="ui-caption font-semibold">Retiro preparado</div>
            {linesReady.length > 0 ? (
              <div className="space-y-2 text-sm text-[var(--ui-text)]">
                {linesReady.slice(0, 8).map((line) => (
                  <div key={line.product.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate">{buildProductLabel(line.product)}</span>
                    <span className="font-medium">{formatQty(line.quantity)} {line.inputUnitCode}</span>
                  </div>
                ))}
                {linesReady.length > 8 ? <div className="ui-caption">+ {linesReady.length - 8} ítems más</div> : null}
              </div>
            ) : (
              <div className="ui-caption">Marca cantidad en uno o mas insumos.</div>
            )}
          </div>

          {invalidLines.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              Ajusta las cantidades que superan el stock disponible.
            </div>
          ) : null}

          <button
            type="submit"
            form="withdraw-quick-form"
            className={`ui-btn ui-btn--brand w-full ${!canSubmit || isSubmitting ? "opacity-70" : ""}`}
            aria-disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Registrando..." : "Revisar retiro"}
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ui-border)] bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-[var(--ui-muted)]">{selectedLocLabel}</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {linesReady.length} insumos seleccionados
            </div>
          </div>
          <button
            type="submit"
            form="withdraw-quick-form"
            className={`ui-btn ui-btn--brand h-12 min-w-[160px] ${!canSubmit || isSubmitting ? "opacity-70" : ""}`}
            aria-disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Registrando..." : "Revisar"}
          </button>
        </div>
      </div>
    </div>
  );
}
