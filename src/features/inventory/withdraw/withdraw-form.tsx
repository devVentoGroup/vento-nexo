"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type LocOption = { id: string; code: string | null; zone: string | null };
type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
};

type Props = {
  locations: LocOption[];
  defaultLocationId: string;
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  siteId: string;
  action: (formData: FormData) => void | Promise<void>;
};

function createRow(id: number): Row {
  return { id, productId: "", quantity: "", inputUnitCode: "", inputUomProfileId: "", notes: "" };
}

export function WithdrawForm({
  locations,
  defaultLocationId,
  products,
  defaultUomProfiles = [],
  siteId,
  action,
}: Props) {
  const [locationId, setLocationId] = useState((defaultLocationId || locations[0]?.id) ?? "");
  const [rows, setRows] = useState<Row[]>([createRow(0)]);

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId) ?? null,
    [locationId, locations]
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

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: loc.id,
        label: loc.code ?? loc.zone ?? loc.id,
        searchText: `${loc.code ?? ""} ${loc.zone ?? ""}`,
      })),
    [locations]
  );

  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: `${item.name ?? item.id}${
          item.stock_unit_code || item.unit
            ? ` - ${normalizeUnitCode(item.stock_unit_code ?? item.unit ?? "")}`
            : ""
        }`,
        searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""}`,
      })),
    [products]
  );

  const linesReady = useMemo(
    () =>
      rows.filter((row) => {
        const qty = Number(row.quantity);
        return Boolean(row.productId) && Number.isFinite(qty) && qty > 0 && Boolean(row.inputUnitCode);
      }),
    [rows]
  );

  const canSubmit = Boolean(siteId && locationId && linesReady.length > 0);
  const totalCaptured = linesReady.reduce((sum, row) => sum + Number(row.quantity), 0);

  const addRow = () => {
    setRows((prev) => [...prev, createRow((prev.at(-1)?.id ?? -1) + 1)]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  if (!siteId) {
    return (
      <div className="ui-panel">
        <p className="ui-body-muted">Selecciona una sede activa para retirar insumos.</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="ui-panel space-y-3">
        <p className="ui-body-muted">
          No hay LOCs en esta sede. Puede que la sede activa no tenga ubicaciones o que el QR abra un LOC de otra sede.
        </p>
        <Link href="/inventory/locations" className="ui-btn ui-btn--ghost ui-btn--sm">
          Ir a Ubicaciones (LOC)
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form id="withdraw-quick-form" action={action} className="space-y-5 pb-28 lg:pb-0">
        <section className="ui-panel space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="ui-h3">Retiro rapido desde LOC</div>
              <div className="ui-caption mt-1">
                Abre este formulario desde el QR del LOC. El operario confirma el origen, agrega items y registra el retiro.
              </div>
            </div>
            <Link href="/inventory/stock" className="ui-btn ui-btn--ghost ui-btn--sm w-full sm:w-auto">
              Ver stock
            </Link>
          </div>

          <div className="rounded-2xl border border-[var(--ui-brand)]/20 bg-[var(--ui-brand-soft)] p-4 sm:p-5">
            <div className="ui-caption font-semibold text-[var(--ui-brand)]">
              {defaultLocationId ? "LOC abierto desde QR" : "LOC activo"}
            </div>
            <div className="mt-2 text-lg font-semibold text-[var(--ui-text)] sm:text-xl">
              {selectedLocation?.code ?? selectedLocation?.zone ?? selectedLocation?.id ?? "Sin LOC"}
            </div>
            <div className="mt-1 text-sm text-[var(--ui-muted)]">
              Todo el retiro se descuenta de este LOC y de la sede activa.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Items listos</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{linesReady.length}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Cantidad capturada</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{totalCaptured}</div>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="ui-label">Cambiar LOC manualmente</span>
            <SearchableSingleSelect
              name="location_id"
              value={locationId}
              onValueChange={setLocationId}
              options={locationOptions}
              placeholder="Selecciona LOC"
              searchPlaceholder="Buscar LOC..."
              sheetTitle="Selecciona LOC"
              dropdownMode="inline"
            />
            <span className="ui-caption">
              Solo cambialo si el QR abrio el LOC equivocado o si necesitas retirar desde otra ubicacion.
            </span>
          </label>
        </section>

        <section className="ui-panel space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="ui-h3">Items a retirar</div>
              <div className="ui-caption mt-1">Captura aqui todo lo que realmente sale de este LOC.</div>
            </div>
            <button type="button" onClick={addRow} className="ui-btn ui-btn--ghost ui-btn--sm w-full sm:w-auto">
              + Agregar item
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const product = products.find((p) => p.id === row.productId);
              const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "");
              const defaultProfile = row.productId ? defaultProfileByProduct.get(row.productId) ?? null : null;
              const selectedUnit = normalizeUnitCode(
                row.inputUnitCode || defaultProfile?.input_unit_code || stockUnitCode
              );
              const conversionLabel = defaultProfile
                ? `${defaultProfile.qty_in_input_unit} ${normalizeUnitCode(defaultProfile.input_unit_code)} = ${defaultProfile.qty_in_stock_unit} ${stockUnitCode || "un"}`
                : "";

              return (
                <div key={row.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">Item {idx + 1}</div>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_120px_160px]">
                    <label className="flex flex-col gap-1 xl:col-span-1">
                      <span className="ui-label">Producto</span>
                      <SearchableSingleSelect
                        name="item_product_id"
                        value={row.productId}
                        onValueChange={(next) => {
                          const selectedProduct = products.find((item) => item.id === next);
                          const stockUnit = normalizeUnitCode(selectedProduct?.stock_unit_code ?? selectedProduct?.unit ?? "");
                          const nextProfile = defaultProfileByProduct.get(next) ?? null;
                          setRows((prev) =>
                            prev.map((current) =>
                              current.id === row.id
                                ? {
                                    ...current,
                                    productId: next,
                                    inputUnitCode:
                                      normalizeUnitCode(nextProfile?.input_unit_code ?? "") || stockUnit || current.inputUnitCode,
                                    inputUomProfileId: nextProfile?.id ?? "",
                                  }
                                : current
                            )
                          );
                        }}
                        options={productOptions}
                        placeholder="Selecciona producto"
                        searchPlaceholder="Buscar producto..."
                        sheetTitle="Selecciona producto"
                        dropdownMode="inline"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Cantidad</span>
                      <input
                        name="item_quantity"
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={row.quantity}
                        onChange={(event) =>
                          setRows((prev) =>
                            prev.map((current) =>
                              current.id === row.id ? { ...current, quantity: event.target.value } : current
                            )
                          )
                        }
                        className="ui-input h-12"
                        inputMode="decimal"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Unidad</span>
                      <select
                        name="item_input_unit_code"
                        value={selectedUnit}
                        onChange={(event) =>
                          setRows((prev) =>
                            prev.map((current) =>
                              current.id === row.id
                                ? {
                                    ...current,
                                    inputUnitCode: normalizeUnitCode(event.target.value),
                                    inputUomProfileId:
                                      defaultProfile &&
                                      normalizeUnitCode(defaultProfile.input_unit_code) === normalizeUnitCode(event.target.value)
                                        ? defaultProfile.id
                                        : "",
                                  }
                                : current
                            )
                          )
                        }
                        className="ui-input h-12"
                        required
                      >
                        <option value="">Selecciona unidad</option>
                        {stockUnitCode ? <option value={stockUnitCode}>{stockUnitCode}</option> : null}
                        {defaultProfile && normalizeUnitCode(defaultProfile.input_unit_code) !== normalizeUnitCode(stockUnitCode) ? (
                          <option value={normalizeUnitCode(defaultProfile.input_unit_code)}>
                            {normalizeUnitCode(defaultProfile.input_unit_code)} ({defaultProfile.label})
                          </option>
                        ) : null}
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 flex flex-col gap-1">
                    <span className="ui-label">Nota opcional</span>
                    <input
                      name="item_notes"
                      placeholder="Ej. produccion, merma, mise en place"
                      value={row.notes}
                      onChange={(event) =>
                        setRows((prev) =>
                          prev.map((current) =>
                            current.id === row.id ? { ...current, notes: event.target.value } : current
                          )
                        )
                      }
                      className="ui-input h-11"
                    />
                  </label>

                  <input type="hidden" name="item_input_uom_profile_id" value={row.inputUomProfileId} />
                  <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

                  {conversionLabel ? (
                    <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2 text-xs text-[var(--ui-muted)]">
                      Conversion aplicada: {conversionLabel}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </form>

      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Resumen</div>
            <div className="ui-caption mt-1">Antes de guardar, valida LOC, productos y cantidades.</div>
          </div>

          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
            <div className="ui-caption">LOC</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">
              {selectedLocation?.code ?? selectedLocation?.zone ?? selectedLocation?.id ?? "Sin LOC"}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Items listos</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{linesReady.length}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="ui-caption">Cantidad capturada</div>
              <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{totalCaptured}</div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
            <div className="ui-caption font-semibold">Items a registrar</div>
            {linesReady.length > 0 ? (
              <div className="space-y-2 text-sm text-[var(--ui-text)]">
                {linesReady.slice(0, 6).map((row) => {
                  const product = products.find((item) => item.id === row.productId);
                  return (
                    <div key={row.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{product?.name ?? "Producto"}</span>
                      <span className="font-medium">{row.quantity} {row.inputUnitCode}</span>
                    </div>
                  );
                })}
                {linesReady.length > 6 ? <div className="ui-caption">+ {linesReady.length - 6} items mas</div> : null}
              </div>
            ) : (
              <div className="ui-caption">Agrega al menos un item con cantidad valida.</div>
            )}
          </div>

          <button type="submit" form="withdraw-quick-form" className="ui-btn ui-btn--brand w-full" disabled={!canSubmit}>
            Registrar retiro
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ui-border)] bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[var(--ui-muted)]">{selectedLocation?.code ?? "Sin LOC"}</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">{linesReady.length} items listos</div>
          </div>
          <button type="submit" form="withdraw-quick-form" className="ui-btn ui-btn--brand h-12 min-w-[160px]" disabled={!canSubmit}>
            Registrar retiro
          </button>
        </div>
      </div>
    </div>
  );
}
