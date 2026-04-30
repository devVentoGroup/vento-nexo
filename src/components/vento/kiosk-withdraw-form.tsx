"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  normalizeUnitCode,
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
};

type Props = {
  sourceLocationId: string;
  returnTo: string;
  products: ProductOption[];
  workers: WorkerOption[];
  uomProfiles: ProductUomProfile[];
  errorMessage?: string;
  errorProductId?: string;
  clearDraft?: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

type KioskWithdrawDraft = {
  workerId: string;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
};

const STORAGE_KEY = "vento:nexo:kiosk-withdraw-draft";

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

export function KioskWithdrawForm({
  sourceLocationId,
  returnTo,
  products,
  workers,
  uomProfiles,
  errorMessage = "",
  errorProductId = "",
  clearDraft = false,
  action,
}: Props) {
  const [workerId, setWorkerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputUnitCode, setInputUnitCode] = useState("");
  const [inputUomProfileId, setInputUomProfileId] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    if (clearDraft) {
      window.localStorage.removeItem(STORAGE_KEY);
      setDraftLoaded(true);
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setDraftLoaded(true);
      return;
    }

    try {
      const draft = JSON.parse(raw) as Partial<KioskWithdrawDraft>;
      setWorkerId(String(draft.workerId ?? ""));
      setProductId(String(draft.productId ?? ""));
      setQuantity(String(draft.quantity ?? ""));
      setInputUnitCode(String(draft.inputUnitCode ?? ""));
      setInputUomProfileId(String(draft.inputUomProfileId ?? ""));
      setNotes(String(draft.notes ?? ""));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setDraftLoaded(true);
    }
  }, [clearDraft]);

  useEffect(() => {
    if (!draftLoaded || clearDraft) return;
    const hasContent = Boolean(workerId || productId || quantity || inputUnitCode || notes);
    if (!hasContent) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const draft: KioskWithdrawDraft = {
      workerId,
      productId,
      quantity,
      inputUnitCode,
      inputUomProfileId,
      notes,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [clearDraft, draftLoaded, inputUnitCode, inputUomProfileId, notes, productId, quantity, workerId]);

  const product = products.find((item) => item.id === productId) ?? null;
  const selectedWorker = workers.find((worker) => worker.employee_id === workerId) ?? null;

  const profilesByProduct = useMemo(() => {
    const map = new Map<string, ProductUomProfile[]>();
    for (const profile of uomProfiles) {
      if (!profile.is_active) continue;
      const context = String(profile.usage_context ?? "general").trim().toLowerCase();
      if (context === "general" && !profile.is_default) continue;
      const key = String(profile.product_id ?? "").trim();
      const current = map.get(key) ?? [];
      current.push(profile);
      map.set(key, current);
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
  const canSubmit = Boolean(workerId && productId && inputUnitCode && Number(quantity) > 0);

  const productOptions = products.map((item) => ({
    value: item.id,
    label: `${item.name ?? item.id} - ${formatQty(item.available_qty)} ${
      item.stock_unit_code ?? item.unit ?? "un"
    } disponibles`,
    searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""}`,
  }));

  return (
    <form action={action} className="space-y-5 pb-24 lg:pb-0">
      <input type="hidden" name="source_location_id" value={sourceLocationId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <section className="ui-panel ui-remission-section ui-fade-up space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Quien retira</div>
            <div className="ui-caption mt-1">
              El PIN confirma la identidad y define el LOC destino del traslado.
            </div>
          </div>
          {selectedWorker ? (
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
              Destino {selectedWorker.destination_label}
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Trabajador</span>
            <select
              name="employee_id"
              className="ui-input h-12"
              value={workerId}
              onChange={(event) => setWorkerId(event.target.value)}
              required
            >
              <option value="">Selecciona trabajador</option>
              {workers.map((worker) => (
                <option key={worker.employee_id} value={worker.employee_id}>
                  {worker.label} - {worker.destination_label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">PIN personal</span>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className="ui-input h-12"
              placeholder="PIN"
              required
            />
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
                required
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
                required
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
          {selectedWorker ? `Destino: ${selectedWorker.destination_label}` : "Selecciona trabajador y producto"}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold" disabled={!canSubmit}>
          Confirmar retiro
        </button>
      </div>
    </form>
  );
}
