"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  normalizeProductUomUsageContext,
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

type UnitOption = {
  value: string;
  label: string;
  inputUnitCode: string;
  profileId: string;
};

type Dialog =
  | { kind: "missing"; missing: string[] }
  | { kind: "confirm" };

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
  errorMessage = "",
  errorProductId = "",
  initialProductId = "",
  action,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const allowNextSubmitRef = useRef(false);
  const product = useMemo(
    () => products.find((item) => item.id === initialProductId) ?? null,
    [initialProductId, products]
  );
  const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
  const profiles = useMemo(
    () => activeProfilesForProduct(uomProfiles, product?.id ?? ""),
    [product?.id, uomProfiles]
  );
  const defaultProfile = useMemo(
    () =>
      product
        ? selectProductUomProfileForContext({
          profiles,
          productId: product.id,
          context: "remission",
        })
        : null,
    [product, profiles]
  );

  const [workerId, setWorkerId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputUnitCode, setInputUnitCode] = useState(
    normalizeUnitCode(defaultProfile?.input_unit_code ?? "") || stockUnitCode
  );
  const [inputUomProfileId, setInputUomProfileId] = useState(defaultProfile?.id ?? "");
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const selectedWorker = workers.find((worker) => worker.employee_id === workerId) ?? null;
  const selectedProfile = inputUomProfileId
    ? profiles.find((profile) => profile.id === inputUomProfileId) ?? null
    : null;
  const factor = selectedProfile
    ? Number(selectedProfile.qty_in_stock_unit) / Number(selectedProfile.qty_in_input_unit)
    : 1;
  const available =
    selectedProfile && Number.isFinite(factor) && factor > 0
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

    add({ value: `unit:${stockUnitCode}`, label: unitLabel(stockUnitCode), inputUnitCode: stockUnitCode, profileId: "" });

    for (const profile of profiles) {
      add({
        value: `profile:${profile.id}`,
        label: profileOptionLabel(profile, stockUnitCode),
        inputUnitCode: normalizeUnitCode(profile.input_unit_code),
        profileId: profile.id,
      });
    }

    return options;
  }, [profiles, stockUnitCode]);

  const unitValue = selectedProfile ? `profile:${selectedProfile.id}` : inputUnitCode ? `unit:${inputUnitCode}` : "";
  const selectedUnitLabel = selectedProfile
    ? String(selectedProfile.label ?? selectedProfile.input_unit_code).trim()
    : unitLabel(inputUnitCode);
  const productError = errorMessage && errorProductId && errorProductId === product?.id ? errorMessage : "";
  const missingFields = [
    !workerId ? "Trabajador" : "",
    !product ? "Producto" : "",
    !(Number(quantity) > 0) ? "Cantidad mayor a cero" : "",
    !inputUnitCode ? "Unidad" : "",
  ].filter(Boolean);

  function validateAndOpenDialog() {
    if (missingFields.length > 0) {
      setDialog({ kind: "missing", missing: missingFields });
      return;
    }
    setDialog({ kind: "confirm" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowNextSubmitRef.current) {
      allowNextSubmitRef.current = false;
      return;
    }
    event.preventDefault();
    validateAndOpenDialog();
  }

  function submitConfirmed() {
    allowNextSubmitRef.current = true;
    setDialog(null);
    window.setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  return (
    <form ref={formRef} action={action} noValidate onSubmit={handleSubmit} className="space-y-5 pb-24 lg:pb-0">
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
              Disponible: {formatQty(product.available_qty)} {product.stock_unit_code ?? product.unit ?? "un"}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Falta seleccionar producto desde el quiosco.
          </div>
        )}

        {productError || (errorMessage && !errorProductId) ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {productError || errorMessage}
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
        <button type="button" className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold" onClick={validateAndOpenDialog}>
          Retirar
        </button>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl">
            <div className="border-b border-[var(--ui-border)] bg-[linear-gradient(135deg,rgba(245,158,11,0.18)_0%,rgba(255,255,255,1)_72%)] px-5 py-4">
              <div className="ui-caption">{dialog.kind === "confirm" ? "Confirmar retiro" : "Faltan datos"}</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {dialog.kind === "confirm" ? "Revisa antes de guardar" : "Completa la informacion"}
              </div>
            </div>
            {dialog.kind === "missing" ? (
              <div className="space-y-4 px-5 py-5">
                <p className="text-sm text-[var(--ui-muted)]">Para registrar el retiro falta completar:</p>
                <div className="grid gap-2">
                  {dialog.missing.map((field) => (
                    <div key={field} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
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
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">Trabajador</div>
                      <div className="text-base font-semibold text-[var(--ui-text)]">{selectedWorker?.label ?? "Sin trabajador"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">Producto</div>
                      <div className="text-sm font-semibold text-[var(--ui-text)]">
                        {formatQty(Number(quantity))} {selectedUnitLabel} de {product?.name ?? "producto"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">Movimiento</div>
                      <div className="text-base font-semibold text-[var(--ui-text)]">
                        {selectedWorker?.has_destination ? `Hacia ${selectedWorker.destination_label}` : "Retiro sin destino: descuenta inventario"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDialog(null)}>
                    Revisar
                  </button>
                  <button type="button" className="ui-btn ui-btn--brand" onClick={submitConfirmed}>
                    Retirar
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
