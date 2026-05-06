"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  normalizeUnitCode,
  normalizeProductUomUsageContext,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  available_qty: number;
};

type WorkerOption = {
  employee_id: string;
  label: string;
  role: string | null;
  destination_label: string;
  has_destination: boolean;
};

type Props = {
  sourceLocationId: string;
  returnTo: string;
  products: ProductOption[];
  workers: WorkerOption[];
  uomProfiles: ProductUomProfile[];
  errorMessage?: string;
  errorProductId?: string;
  initialProductId?: string;
  action: (formData: FormData) => void | Promise<void>;
};

type ConfirmationDialog =
  | { kind: "missing"; missing: string[] }
  | { kind: "confirm" };

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function profileOptionLabel(profile: ProductUomProfile, stockUnitCode: string) {
  const label = String(profile.label ?? "").trim() || normalizeUnitCode(profile.input_unit_code);
  return `${label} (${formatQty(Number(profile.qty_in_input_unit))} ${normalizeUnitCode(
    profile.input_unit_code
  )} = ${formatQty(Number(profile.qty_in_stock_unit))} ${stockUnitCode || "un"})`;
}

function activeProfilesForProduct(profiles: ProductUomProfile[], productId: string) {
  const candidates = profiles.filter((profile) => {
    if (!profile.is_active || profile.product_id !== productId) return false;
    const context = normalizeProductUomUsageContext(profile.usage_context);
    return context !== "general" || profile.is_default;
  });

  const priority = (profile: ProductUomProfile) => {
    const context = normalizeProductUomUsageContext(profile.usage_context);
    if (context === "purchase") return 0;
    if (context === "remission" && profile.source !== "supplier_primary") return 1;
    if (context === "remission") return 2;
    return 3;
  };

  const sorted = [...candidates].sort((a, b) => {
    const priorityDiff = priority(a) - priority(b);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es", { sensitivity: "base" });
  });

  const deduped: ProductUomProfile[] = [];
  const seen = new Set<string>();
  for (const profile of sorted) {
    const qtyInInput = Number(profile.qty_in_input_unit);
    const qtyInStock = Number(profile.qty_in_stock_unit);
    if (!Number.isFinite(qtyInInput) || !Number.isFinite(qtyInStock) || qtyInInput <= 0 || qtyInStock <= 0) {
      continue;
    }

    const key = [
      normalizeUnitCode(profile.input_unit_code),
      Math.round((qtyInStock / qtyInInput) * 1_000_000) / 1_000_000,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(profile);
  }

  return deduped;
}

export function KioskWithdrawForm({
  sourceLocationId,
  returnTo,
  products,
  workers,
  uomProfiles,
  errorMessage = "",
  errorProductId = "",
  initialProductId = "",
  action,
}: Props) {
  const initialProduct = products.find((item) => item.id === initialProductId) ?? null;
  const initialStockUnit = normalizeUnitCode(initialProduct?.stock_unit_code ?? initialProduct?.unit ?? "un");
  const initialProfile = initialProduct
    ? selectProductUomProfileForContext({
        profiles: activeProfilesForProduct(uomProfiles, initialProduct.id),
        productId: initialProduct.id,
        context: "remission",
      })
    : null;
  const [workerId, setWorkerId] = useState("");
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [inputUnitCode, setInputUnitCode] = useState(
    normalizeUnitCode(initialProfile?.input_unit_code ?? "") || (initialProduct ? initialStockUnit : "")
  );
  const [inputUomProfileId, setInputUomProfileId] = useState(initialProfile?.id ?? "");
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState<ConfirmationDialog | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const allowNextSubmitRef = useRef(false);

  const profilesByProduct = useMemo(() => {
    const map = new Map<string, ProductUomProfile[]>();
    for (const profile of uomProfiles) {
      const key = String(profile.product_id ?? "").trim();
      if (!key) continue;
      map.set(key, activeProfilesForProduct(uomProfiles, key));
    }
    return map;
  }, [uomProfiles]);

  const defaultProfileByProduct = useMemo(() => {
    const selected = new Map<string, ProductUomProfile>();
    for (const productOption of products) {
      const profile = selectProductUomProfileForContext({
        profiles: profilesByProduct.get(productOption.id) ?? [],
        productId: productOption.id,
        context: "remission",
      });
      if (profile) selected.set(productOption.id, profile);
    }
    return selected;
  }, [products, profilesByProduct]);

  const product = products.find((item) => item.id === productId) ?? null;
  const selectedWorker = workers.find((worker) => worker.employee_id === workerId) ?? null;

  const productProfiles = productId ? profilesByProduct.get(productId) ?? [] : [];
  const selectedProfile = inputUomProfileId
    ? productProfiles.find((profile) => profile.id === inputUomProfileId) ?? null
    : null;
  const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
  const selectedUnitValue = selectedProfile
    ? `profile:${selectedProfile.id}`
    : inputUnitCode
      ? `unit:${inputUnitCode}`
      : "";
  const selectedFactor = selectedProfile
    ? Number(selectedProfile.qty_in_stock_unit) / Number(selectedProfile.qty_in_input_unit)
    : 1;
  const availableInSelectedUnit =
    selectedProfile && Number.isFinite(selectedFactor) && selectedFactor > 0
      ? Number(product?.available_qty ?? 0) / selectedFactor
      : Number(product?.available_qty ?? 0);
  const selectedUnitLabel = selectedProfile
    ? String(selectedProfile.label ?? selectedProfile.input_unit_code).trim()
    : stockUnitCode;
  const productError = errorMessage && (!errorProductId || errorProductId === productId) ? errorMessage : "";
  const quantityNumber = Number(quantity);
  const canSubmit = Boolean(workerId && productId && inputUnitCode && quantityNumber > 0);

  const productOptions = products.map((item) => ({
    value: item.id,
    label: `${item.name ?? item.id} - ${formatQty(item.available_qty)} ${
      item.stock_unit_code ?? item.unit ?? "un"
    } disponibles`,
    searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""}`,
  }));

  const missingFields = [
    !workerId ? "Trabajador" : "",
    !productId ? "Producto" : "",
    !inputUnitCode ? "Unidad" : "",
    !(quantityNumber > 0) ? "Cantidad mayor a cero" : "",
  ].filter(Boolean);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowNextSubmitRef.current) {
      allowNextSubmitRef.current = false;
      return;
    }

    event.preventDefault();
    if (missingFields.length > 0) {
      setDialog({ kind: "missing", missing: missingFields });
      return;
    }

    setDialog({ kind: "confirm" });
  }

  function submitConfirmed() {
    allowNextSubmitRef.current = true;
    setDialog(null);
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }

  return (
    <form ref={formRef} action={action} noValidate onSubmit={handleSubmit} className="space-y-5 pb-24 lg:pb-0">
      <input type="hidden" name="source_location_id" value={sourceLocationId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <section className="ui-panel ui-remission-section ui-fade-up space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Quien retira</div>
            <div className="ui-caption mt-1">
              Si el trabajador tiene LOC asignado se traslada. Si no, se descuenta del inventario.
            </div>
          </div>
          {selectedWorker ? (
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
              {selectedWorker.has_destination ? `Destino ${selectedWorker.destination_label}` : "Sin destino"}
            </span>
          ) : null}
        </div>

        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Trabajador</span>
            <select
              name="employee_id"
              className="ui-input h-12"
              value={workerId}
              onChange={(event) => setWorkerId(event.target.value)}
            >
              <option value="">Selecciona trabajador</option>
              {workers.map((worker) => (
                <option key={worker.employee_id} value={worker.employee_id}>
                  {worker.label} - {worker.destination_label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Producto</div>
            <div className="ui-caption mt-1">
              Solo aparecen productos con saldo positivo en este LOC.
            </div>
          </div>
          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {products.length} productos con stock
          </span>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm sm:p-5">
          {productError ? (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {productError}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Producto</span>
              <SearchableSingleSelect
                name="product_id"
                value={productId}
                onValueChange={(next) => {
                  const nextProduct = products.find((item) => item.id === next) ?? null;
                  const nextStockUnit = normalizeUnitCode(
                    nextProduct?.stock_unit_code ?? nextProduct?.unit ?? "un"
                  );
                  const nextProfile = defaultProfileByProduct.get(next) ?? null;
                  setProductId(next);
                  setInputUnitCode(normalizeUnitCode(nextProfile?.input_unit_code ?? "") || nextStockUnit);
                  setInputUomProfileId(nextProfile?.id ?? "");
                }}
                options={productOptions}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
                sheetTitle="Selecciona producto"
                mobilePresentation="sheet"
                mobileBreakpointPx={1024}
              />
            </div>

            <label className="flex flex-col gap-1">
              <span className="flex min-h-5 items-center justify-between gap-2">
                <span className="ui-label">Cantidad</span>
                {product ? (
                  <span className="truncate text-xs font-normal text-[var(--ui-muted)]">
                    Disponible: {formatQty(availableInSelectedUnit)} {selectedUnitLabel}
                  </span>
                ) : null}
              </span>
              <input
                name="quantity"
                className="ui-input h-12"
                placeholder="Cantidad"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad</span>
              <select
                className="ui-input h-12"
                value={selectedUnitValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const nextProfileId = nextValue.startsWith("profile:")
                    ? nextValue.slice("profile:".length)
                    : "";
                  const nextProfile = nextProfileId
                    ? productProfiles.find((profile) => profile.id === nextProfileId) ?? null
                    : null;
                  setInputUomProfileId(nextProfile?.id ?? "");
                  setInputUnitCode(
                    nextProfile
                      ? normalizeUnitCode(nextProfile.input_unit_code)
                      : normalizeUnitCode(nextValue.replace(/^unit:/, ""))
                  );
                }}
              >
                <option value="">Unidad</option>
                {stockUnitCode ? <option value={`unit:${stockUnitCode}`}>{stockUnitCode}</option> : null}
                {productProfiles.map((profile) => (
                  <option key={profile.id} value={`profile:${profile.id}`}>
                    {profileOptionLabel(profile, stockUnitCode)}
                  </option>
                ))}
              </select>
              <input type="hidden" name="input_unit_code" value={inputUnitCode} />
              <input type="hidden" name="input_uom_profile_id" value={inputUomProfileId} />
            </label>
          </div>

          <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
              Nota opcional
            </summary>
            <label className="mt-3 flex flex-col gap-1">
              <span className="ui-label">Detalle</span>
              <input
                name="notes"
                className="ui-input"
                placeholder="Ejemplo: retiro para mise en place"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </details>
        </div>
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedWorker
            ? selectedWorker.has_destination
              ? `Traslado a: ${selectedWorker.destination_label}`
              : "Retiro sin destino"
            : "Selecciona trabajador y producto"}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold">
          Confirmar
        </button>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl">
            <div className="border-b border-[var(--ui-border)] bg-[linear-gradient(135deg,rgba(245,158,11,0.18)_0%,rgba(255,255,255,1)_72%)] px-5 py-4">
              <div className="ui-caption">{dialog.kind === "confirm" ? "Confirmar retiro" : "Faltan datos"}</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {dialog.kind === "confirm" ? "Revisa antes de guardar" : "Completa la información"}
              </div>
            </div>

            {dialog.kind === "missing" ? (
              <div className="space-y-4 px-5 py-5">
                <p className="text-sm text-[var(--ui-muted)]">
                  Para registrar el retiro falta completar:
                </p>
                <div className="grid gap-2">
                  {dialog.missing.map((field) => (
                    <div
                      key={field}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
                    >
                      {field}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button type="button" className="ui-btn ui-btn--brand" onClick={() => setDialog(null)}>
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                  <div className="text-sm text-[var(--ui-muted)]">Resumen</div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                        Trabajador
                      </div>
                      <div className="text-base font-semibold text-[var(--ui-text)]">
                        {selectedWorker?.label ?? "Sin trabajador"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                        Producto
                      </div>
                      <div className="text-base font-semibold text-[var(--ui-text)]">
                        {formatQty(quantityNumber)} {selectedUnitLabel} de {product?.name ?? "producto"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                        Movimiento
                      </div>
                      <div className="text-base font-semibold text-[var(--ui-text)]">
                        {selectedWorker?.has_destination
                          ? `Hacia ${selectedWorker.destination_label}`
                          : "Retiro sin destino: descuenta inventario"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDialog(null)}>
                    Revisar
                  </button>
                  <button type="button" className="ui-btn ui-btn--brand" onClick={submitConfirmed} disabled={!canSubmit}>
                    Confirmar retiro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}
