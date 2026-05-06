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

type Line = {
  key: string;
  productId: string;
  query: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  isOpen: boolean;
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

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function createKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [workerId, setWorkerId] = useState("");
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const profilesByProduct = useMemo(() => {
    const map = new Map<string, ProductUomProfile[]>();
    const ids = new Set(uomProfiles.map((profile) => String(profile.product_id ?? "").trim()).filter(Boolean));
    for (const id of ids) map.set(id, activeProfilesForProduct(uomProfiles, id));
    return map;
  }, [uomProfiles]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const defaultProfileByProduct = useMemo(() => {
    const selected = new Map<string, ProductUomProfile>();
    for (const product of products) {
      const profile = selectProductUomProfileForContext({
        profiles: profilesByProduct.get(product.id) ?? [],
        productId: product.id,
        context: "remission",
      });
      if (profile) selected.set(product.id, profile);
    }
    return selected;
  }, [products, profilesByProduct]);

  function lineFromProduct(productId: string): Line {
    const product = productById.get(productId) ?? null;
    const stockUnit = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
    const profile = defaultProfileByProduct.get(productId) ?? null;
    return {
      key: createKey(),
      productId: product?.id ?? "",
      query: product?.name ?? "",
      quantity: "",
      inputUnitCode: normalizeUnitCode(profile?.input_unit_code ?? "") || (product ? stockUnit : ""),
      inputUomProfileId: profile?.id ?? "",
      isOpen: false,
    };
  }

  const [lines, setLines] = useState<Line[]>(() => [lineFromProduct(initialProductId)]);
  const selectedWorker = workers.find((worker) => worker.employee_id === workerId) ?? null;

  function productLabel(product: ProductOption | null) {
    if (!product) return "Selecciona producto";
    return `${product.name ?? product.id} - ${formatQty(product.available_qty)} ${
      product.stock_unit_code ?? product.unit ?? "un"
    } disponibles`;
  }

  function getLineProduct(line: Line) {
    return productById.get(line.productId) ?? null;
  }

  function getLineProfiles(line: Line) {
    return line.productId ? profilesByProduct.get(line.productId) ?? [] : [];
  }

  function getUnitOptions(line: Line) {
    const product = getLineProduct(line);
    const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
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

    const profiles = getLineProfiles(line);
    for (const profile of profiles) {
      add({
        value: `profile:${profile.id}`,
        label: profileOptionLabel(profile, stockUnitCode),
        inputUnitCode: normalizeUnitCode(profile.input_unit_code),
        profileId: profile.id,
      });
    }

    return options;
  }

  function selectedUnitLabel(line: Line) {
    const profile = line.inputUomProfileId
      ? getLineProfiles(line).find((item) => item.id === line.inputUomProfileId) ?? null
      : null;
    return profile ? String(profile.label ?? profile.input_unit_code).trim() : unitLabel(line.inputUnitCode);
  }

  function filteredProducts(line: Line) {
    const needle = searchKey(line.query);
    if (!needle) return products;
    return products.filter((product) =>
      searchKey(`${product.name ?? ""} ${product.unit ?? ""} ${product.stock_unit_code ?? ""}`).includes(needle)
    );
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(lineKey: string, productId: string) {
    const next = lineFromProduct(productId);
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              productId: next.productId,
              query: next.query,
              inputUnitCode: next.inputUnitCode,
              inputUomProfileId: next.inputUomProfileId,
              isOpen: false,
            }
          : line
      )
    );
  }

  function addLine() {
    setLines((current) => [...current, lineFromProduct("")]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  const activeLines = lines.filter((line) => line.productId || line.quantity || line.inputUnitCode);
  const missingFields = [
    !workerId ? "Trabajador" : "",
    activeLines.length === 0 ? "Al menos un producto" : "",
    ...lines.flatMap((line, index) => {
      const hasAny = Boolean(line.productId || line.quantity || line.inputUnitCode);
      if (!hasAny) return [];
      return [
        !line.productId ? `Producto en línea ${index + 1}` : "",
        !(Number(line.quantity) > 0) ? `Cantidad mayor a cero en línea ${index + 1}` : "",
        !line.inputUnitCode ? `Unidad en línea ${index + 1}` : "",
      ];
    }),
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

      <section className="ui-panel ui-remission-section ui-fade-up space-y-4 !overflow-visible">
        <div>
          <div className="ui-h3">Quien retira</div>
          <div className="ui-caption mt-1">Si el trabajador tiene LOC asignado se traslada. Si no, se descuenta del inventario.</div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Trabajador</span>
          <select name="employee_id" className="ui-input h-12" value={workerId} onChange={(event) => setWorkerId(event.target.value)}>
            <option value="">Selecciona trabajador</option>
            {workers.map((worker) => (
              <option key={worker.employee_id} value={worker.employee_id}>
                {worker.label} - {worker.destination_label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Productos</div>
            <div className="ui-caption mt-1">Agrega uno o varios productos con saldo positivo en este LOC.</div>
          </div>
          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {products.length} productos con stock
          </span>
        </div>

        {errorMessage && !errorProductId ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
        ) : null}

        <div className="space-y-3">
          {lines.map((line, index) => {
            const product = getLineProduct(line);
            const profiles = getLineProfiles(line);
            const selectedProfile = line.inputUomProfileId
              ? profiles.find((profile) => profile.id === line.inputUomProfileId) ?? null
              : null;
            const factor = selectedProfile
              ? Number(selectedProfile.qty_in_stock_unit) / Number(selectedProfile.qty_in_input_unit)
              : 1;
            const available =
              selectedProfile && Number.isFinite(factor) && factor > 0
                ? Number(product?.available_qty ?? 0) / factor
                : Number(product?.available_qty ?? 0);
            const productError = errorMessage && errorProductId && errorProductId === line.productId ? errorMessage : "";
            const unitOptions = getUnitOptions(line);
            const unitValue = selectedProfile ? `profile:${selectedProfile.id}` : line.inputUnitCode ? `unit:${line.inputUnitCode}` : "";

            return (
              <div key={line.key} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">Producto {index + 1}</div>
                  {lines.length > 1 ? (
                    <button type="button" className="text-sm font-semibold text-red-600" onClick={() => removeLine(line.key)}>
                      Quitar
                    </button>
                  ) : null}
                </div>

                {productError ? (
                  <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{productError}</div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="relative flex flex-col gap-1 md:col-span-2">
                    <span className="ui-label">Buscar o seleccionar producto</span>
                    <input type="hidden" name="item_product_id" value={line.productId} />
                    <input
                      value={line.query}
                      onChange={(event) =>
                        updateLine(line.key, {
                          query: event.target.value,
                          productId: "",
                          inputUnitCode: "",
                          inputUomProfileId: "",
                          isOpen: true,
                        })
                      }
                      onFocus={() => updateLine(line.key, { isOpen: true })}
                      className="ui-input h-14 w-full text-base"
                      placeholder="Buscar producto"
                      autoComplete="off"
                    />
                    {product ? <div className="text-xs text-[var(--ui-muted)]">Seleccionado: {productLabel(product)}</div> : null}
                    {line.isOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white shadow-2xl">
                        <div className="max-h-80 overflow-auto p-2">
                          {filteredProducts(line).slice(0, 80).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="block w-full rounded-xl px-4 py-3 text-left text-sm hover:bg-[var(--ui-bg-soft)]"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectProduct(line.key, item.id);
                              }}
                            >
                              <div className="font-semibold text-[var(--ui-text)]">{item.name ?? item.id}</div>
                              <div className="mt-0.5 text-xs text-[var(--ui-muted)]">
                                Disponible: {formatQty(item.available_qty)} {item.stock_unit_code ?? item.unit ?? "un"}
                              </div>
                            </button>
                          ))}
                          {filteredProducts(line).length === 0 ? (
                            <div className="px-4 py-4 text-sm text-[var(--ui-muted)]">Sin productos para esa busqueda.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="flex min-h-5 items-center justify-between gap-2">
                      <span className="ui-label">Cantidad</span>
                      {product ? (
                        <span className="truncate text-xs font-normal text-[var(--ui-muted)]">
                          Disponible: {formatQty(available)} {selectedUnitLabel(line)}
                        </span>
                      ) : null}
                    </span>
                    <input
                      name="item_quantity"
                      className="ui-input h-12"
                      placeholder="Cantidad"
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Unidad</span>
                    <select
                      className="ui-input h-12"
                      value={unitValue}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        const profileId = nextValue.startsWith("profile:") ? nextValue.slice("profile:".length) : "";
                        const profile = profileId ? profiles.find((item) => item.id === profileId) ?? null : null;
                        updateLine(line.key, {
                          inputUomProfileId: profile?.id ?? "",
                          inputUnitCode: profile
                            ? normalizeUnitCode(profile.input_unit_code)
                            : normalizeUnitCode(nextValue.replace(/^unit:/, "")),
                        });
                      }}
                    >
                      <option value="">Unidad</option>
                      {unitOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="item_input_unit_code" value={line.inputUnitCode} />
                    <input type="hidden" name="item_input_uom_profile_id" value={line.inputUomProfileId} />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="ui-btn ui-btn--ghost h-12 w-full" onClick={addLine}>
          + Agregar otro producto
        </button>

        <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">Nota opcional</summary>
          <label className="mt-3 flex flex-col gap-1">
            <span className="ui-label">Detalle</span>
            <input name="notes" className="ui-input" placeholder="Ejemplo: retiro para mise en place" value={notes} onChange={(event) => setNotes(event.target.value)} />
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
          Confirmar
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
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">Productos</div>
                      <div className="mt-1 space-y-1">
                        {activeLines.map((line) => {
                          const product = getLineProduct(line);
                          return (
                            <div key={line.key} className="text-sm font-semibold text-[var(--ui-text)]">
                              {formatQty(Number(line.quantity))} {selectedUnitLabel(line)} de {product?.name ?? "producto"}
                            </div>
                          );
                        })}
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
