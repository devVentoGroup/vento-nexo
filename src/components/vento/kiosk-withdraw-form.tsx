"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  normalizeProductUomUsageContext,
  normalizeUnitCode,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  available_qty: number;
  presentationParts: PresentationPart[];
};

type PresentationPart = {
  uomProfileId: string;
  label: string;
  qty: number;
  baseQty: number;
  imageUrl?: string;
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
  errorField?: string;
  errorMessage?: string;
  errorProductId?: string;
  initialEmployeeId?: string;
  initialInputUnitCode?: string;
  initialInputUomProfileId?: string;
  initialNotes?: string;
  initialProductId?: string;
  initialQuantity?: string;
  action: (formData: FormData) => void | Promise<void>;
};

type UnitOption = {
  value: string;
  label: string;
  inputUnitCode: string;
  profileId: string;
};

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function unitLabel(value: string) {
  const clean = String(value ?? "").trim();
  if (!clean) return "Unidad";
  return clean.toLowerCase() === "un" ? "Unidad" : clean;
}

function profileOptionLabel(profile: ProductUomProfile, stockUnitCode: string) {
  const label = String(profile.label ?? "").trim() || normalizeUnitCode(profile.input_unit_code);
  return `${label} (${formatQty(Number(profile.qty_in_input_unit))} ${normalizeUnitCode(
    profile.input_unit_code
  )} = ${formatQty(Number(profile.qty_in_stock_unit))} ${stockUnitCode || "un"})`;
}

function activeProfilesForProduct(profiles: ProductUomProfile[], productId: string) {
  const candidates = profiles.filter((profile) => profile.is_active && profile.product_id === productId);

  const priority = (profile: ProductUomProfile) => {
    const context = normalizeProductUomUsageContext(profile.usage_context);
    if (context === "purchase") return 0;
    if (context === "general") return 1;
    if (context === "remission" && profile.source !== "supplier_primary") return 2;
    if (context === "remission") return 3;
    return 4;
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
  errorField = "",
  errorMessage = "",
  errorProductId = "",
  initialEmployeeId = "",
  initialInputUnitCode = "",
  initialInputUomProfileId = "",
  initialNotes = "",
  initialProductId = "",
  initialQuantity = "",
  action,
}: Props) {
  const submitStartedRef = useRef(false);
  const product = useMemo(
    () => products.find((item) => item.id === initialProductId) ?? null,
    [initialProductId, products]
  );
  const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
  const profiles = useMemo(
    () => activeProfilesForProduct(uomProfiles, product?.id ?? ""),
    [product?.id, uomProfiles]
  );
  const physicalPresentationIds = useMemo(
    () => new Set((product?.presentationParts ?? []).map((part) => part.uomProfileId)),
    [product?.presentationParts]
  );
  const hasPhysicalBreakdown = Boolean(product && product.presentationParts.length > 0);
  const defaultProfile = useMemo(
    () => {
      if (!product) return null;
      if (!hasPhysicalBreakdown) return null;
      const physicalProfiles = profiles.filter((profile) => physicalPresentationIds.has(profile.id));
      if (physicalProfiles.length === 1) return physicalProfiles[0] ?? null;
      if (physicalProfiles.length > 1) {
        const defaultPhysical = physicalProfiles.find((profile) => profile.is_default);
        return defaultPhysical ?? physicalProfiles[0] ?? null;
      }
      return null;
    },
    [hasPhysicalBreakdown, product, profiles, physicalPresentationIds]
  );
  const initialProfileId =
    initialInputUomProfileId && physicalPresentationIds.has(initialInputUomProfileId)
      ? initialInputUomProfileId
      : "";

  const [workerId, setWorkerId] = useState(initialEmployeeId);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [inputUnitCode, setInputUnitCode] = useState(
    normalizeUnitCode((initialProfileId ? initialInputUnitCode : "") || defaultProfile?.input_unit_code || "") ||
      stockUnitCode
  );
  const [inputUomProfileId, setInputUomProfileId] = useState(initialProfileId || defaultProfile?.id || "");
  const [notes, setNotes] = useState(initialNotes);
  const initialWorkerError = errorField === "worker" && errorMessage ? "Trabajador" : "";
  const initialProductError = errorField !== "worker" && errorMessage && !errorProductId ? errorMessage : "";
  const [validationErrors, setValidationErrors] = useState<string[]>(
    [initialWorkerError, initialProductError].filter(Boolean)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedWorker = workers.find((worker) => worker.employee_id === workerId) ?? null;
  const selectedProfile = inputUomProfileId
    ? profiles.find((profile) => profile.id === inputUomProfileId) ?? null
    : null;
  const selectedPresentation = selectedProfile
    ? product?.presentationParts.find((part) => part.uomProfileId === selectedProfile.id) ?? null
    : null;
  const factor = selectedProfile
    ? Number(selectedProfile.qty_in_stock_unit) / Number(selectedProfile.qty_in_input_unit)
    : 1;
  const available = selectedPresentation
    ? selectedPresentation.qty
    : selectedProfile && !hasPhysicalBreakdown && Number.isFinite(factor) && factor > 0
      ? Number(product?.available_qty ?? 0) / factor
      : Number(product?.available_qty ?? 0);

  const unitOptions = useMemo(() => {
    const options: UnitOption[] = [];
    const seen = new Set<string>();

    function add(option: UnitOption) {
      if (!option.inputUnitCode) return;
      const key = option.profileId ? `profile:${option.profileId}` : `unit:${normalizeUnitCode(option.inputUnitCode)}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push(option);
    }

    if (!hasPhysicalBreakdown) {
      add({ value: `unit:${stockUnitCode}`, label: unitLabel(stockUnitCode), inputUnitCode: stockUnitCode, profileId: "" });
    }

    for (const profile of profiles) {
      if (hasPhysicalBreakdown && !physicalPresentationIds.has(profile.id)) continue;
      add({
        value: `profile:${profile.id}`,
        label: profileOptionLabel(profile, stockUnitCode),
        inputUnitCode: normalizeUnitCode(profile.input_unit_code),
        profileId: profile.id,
      });
    }

    return options;
  }, [hasPhysicalBreakdown, physicalPresentationIds, profiles, stockUnitCode]);

  const unitValue = selectedProfile ? `profile:${selectedProfile.id}` : inputUnitCode ? `unit:${inputUnitCode}` : "";
  const selectedUnitLabel = selectedProfile
    ? String(selectedProfile.label ?? selectedProfile.input_unit_code).trim()
    : unitLabel(inputUnitCode);
  const productError =
    errorField !== "worker" && errorMessage && errorProductId && errorProductId === product?.id ? errorMessage : "";
  const missingFields = [
    !workerId ? "Trabajador" : "",
    !product ? "Producto" : "",
    !(Number(quantity) > 0) ? "Cantidad mayor a cero" : "",
    !inputUnitCode ? "Unidad" : "",
  ].filter(Boolean);
  const workerErrors = validationErrors.filter((error) => error === "Trabajador");
  const productSectionErrors = validationErrors.filter((error) => error !== "Trabajador");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitStartedRef.current) {
      event.preventDefault();
      return;
    }

    if (missingFields.length > 0) {
      event.preventDefault();
      setValidationErrors(missingFields);
      return;
    }

    submitStartedRef.current = true;
    setValidationErrors([]);
    setIsSubmitting(true);
  }

  return (
    <form action={action} noValidate onSubmit={handleSubmit} className="space-y-5 pb-24 lg:pb-0">
      <input type="hidden" name="source_location_id" value={sourceLocationId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="item_product_id" value={product?.id ?? ""} />
      <input type="hidden" name="item_input_unit_code" value={inputUnitCode} />
      <input type="hidden" name="item_input_uom_profile_id" value={inputUomProfileId} />

      <section className="ui-panel ui-remission-section ui-fade-up space-y-4">
        <div>
          <div className="ui-h3">Quien retira</div>
          <div className="ui-caption mt-1">Si el trabajador tiene LOC asignado se traslada. Si no, se descuenta del inventario.</div>
        </div>
        {workerErrors.length > 0 ? (
          <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-950 shadow-sm">
            Falta seleccionar trabajador.
          </div>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="ui-label">Trabajador</span>
          <select name="employee_id" className="ui-input h-14 text-base" value={workerId} onChange={(event) => setWorkerId(event.target.value)}>
            <option value="">Selecciona trabajador</option>
            {workers.map((worker) => (
              <option key={worker.employee_id} value={worker.employee_id}>
                {worker.label} - {worker.destination_label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div>
          <div className="ui-h3">Producto</div>
          <div className="ui-caption mt-1">El producto se elige desde el quiosco. Esta pantalla solo confirma el retiro.</div>
        </div>

        {product ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">Producto seleccionado</div>
            <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{product.name ?? product.id}</div>
            <div className="mt-1 text-sm text-[var(--ui-muted)]">
              Base: {formatQty(product.available_qty)} {product.stock_unit_code ?? product.unit ?? "un"}
            </div>
            {product.presentationParts.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {product.presentationParts.map((part) => (
                  <span key={part.uomProfileId} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-950">
                    {formatQty(part.qty)} {part.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs font-semibold text-amber-900">Sin desglose por presentacion</div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Falta seleccionar producto desde el quiosco.
          </div>
        )}

        {productError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {productError}
          </div>
        ) : null}

        {productSectionErrors.length > 0 ? (
          <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950 shadow-sm">
            <div className="font-bold">Falta completar:</div>
            <div className="mt-1 font-semibold">{productSectionErrors.join(", ")}</div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="flex min-h-5 items-center justify-between gap-2">
              <span className="ui-label">Cantidad</span>
              {product ? (
                <span className="truncate text-xs font-normal text-[var(--ui-muted)]">
                  Disponible: {formatQty(available)} {selectedUnitLabel}
                </span>
              ) : null}
            </span>
            <input
              name="item_quantity"
              className="ui-input h-14 text-base"
              inputMode="decimal"
              placeholder="Cantidad"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Unidad</span>
            <select
              className="ui-input h-14 text-base"
              value={unitValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                const profileId = nextValue.startsWith("profile:") ? nextValue.slice("profile:".length) : "";
                const profile = profileId ? profiles.find((item) => item.id === profileId) ?? null : null;
                setInputUomProfileId(profile?.id ?? "");
                setInputUnitCode(
                  profile ? normalizeUnitCode(profile.input_unit_code) : normalizeUnitCode(nextValue.replace(/^unit:/, ""))
                );
              }}
            >
              <option value="">Unidad</option>
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">Nota opcional</summary>
          <label className="mt-3 flex flex-col gap-1">
            <span className="ui-label">Detalle</span>
            <input name="notes" className="ui-input h-12" placeholder="Ejemplo: retiro para mise en place" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </details>
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedWorker
            ? selectedWorker.has_destination
              ? `Traslado a: ${selectedWorker.destination_label}`
              : "Retiro sin destino"
            : "Selecciona trabajador"}
        </div>
        <button
          type="submit"
          className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Retirando..." : "Retirar"}
        </button>
      </div>
    </form>
  );
}
