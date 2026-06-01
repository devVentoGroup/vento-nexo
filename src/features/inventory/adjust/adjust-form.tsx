"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
};

type Location = {
  id: string;
  name: string | null;
  code: string | null;
};

type LocationPosition = {
  id: string;
  location_id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

type Props = {
  products: Product[];
  siteId: string;
  siteName: string;
  currentStock: Record<string, number>;
  locations: Location[];
  selectedLocationId: string;
  currentLocationStock: Record<string, number>;
  locationPositions: LocationPosition[];
  currentPositionStock: Record<string, number>;
};

type AdjustMode = "add" | "remove" | "count";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatQty(value: number) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatProductLabel(product: Product) {
  return `${product.name}${product.sku ? ` (${product.sku})` : ""}`;
}

function formatLocationLabel(location: Location) {
  const name = String(location.name ?? "").trim();
  const code = String(location.code ?? "").trim();

  if (name && code) return `${name} · ${code}`;
  if (name) return name;
  if (code) return code;

  return location.id;
}

function positionBaseLabel(position: LocationPosition) {
  const name = String(position.name || position.code || position.id).trim();
  const code = String(position.code || "").trim();

  if (!code || code === name) return name;
  return `${name} (${code})`;
}

function buildPositionPath(position: LocationPosition, positionById: Map<string, LocationPosition>) {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: LocationPosition | undefined = position;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(positionBaseLabel(current));
    current = current.parent_position_id ? positionById.get(current.parent_position_id) : undefined;
  }

  return chain.join(" > ");
}

function buildPositionOptions(positions: LocationPosition[]) {
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const positionIds = new Set(positions.map((position) => position.id));
  const childrenByParent = new Map<string, LocationPosition[]>();
  const roots: LocationPosition[] = [];

  for (const position of positions) {
    const parentId = position.parent_position_id;
    const hasLocalParent = Boolean(parentId) && positionIds.has(String(parentId));

    if (!hasLocalParent) {
      roots.push(position);
      continue;
    }

    const children = childrenByParent.get(String(parentId)) ?? [];
    children.push(position);
    childrenByParent.set(String(parentId), children);
  }

  const sortRows = (rows: LocationPosition[]) =>
    rows.sort((a, b) => {
      const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return positionBaseLabel(a).localeCompare(positionBaseLabel(b), "es", {
        numeric: true,
        sensitivity: "base",
      });
    });

  sortRows(roots);
  for (const children of childrenByParent.values()) sortRows(children);

  const options: Array<{ position: LocationPosition; label: string }> = [];
  const visit = (position: LocationPosition, depth: number) => {
    const prefix = depth === 0 ? "▾ " : `${"  ".repeat(depth)}↳ `;
    options.push({
      position,
      label: `${prefix}${positionBaseLabel(position)}`,
    });

    for (const child of childrenByParent.get(position.id) ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const root of roots) visit(root, 0);

  return options.map((option) => ({
    ...option,
    fullLabel: buildPositionPath(option.position, positionById),
  }));
}

function positionStockKey(positionId: string, productId: string) {
  return `${positionId}|${productId}`;
}

export function AdjustForm({
  products,
  siteId,
  siteName,
  currentStock,
  locations,
  selectedLocationId,
  currentLocationStock,
  locationPositions,
  currentPositionStock,
}: Props) {
  const router = useRouter();

  const [productId, setProductId] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("count");
  const [quantityValue, setQuantityValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [evidence, setEvidence] = useState<string>("");
  const [unitCostForAdjust, setUnitCostForAdjust] = useState<string>("");
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    productId?: string;
    quantity?: string;
    reason?: string;
  }>({});

  const selectedProduct = products.find((product) => product.id === productId);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null;
  const selectedPosition = locationPositions.find((position) => position.id === selectedPositionId) ?? null;
  const isLocationMode = Boolean(selectedLocationId);
  const isPositionMode = Boolean(selectedPositionId);

  const positionOptions = useMemo(() => buildPositionOptions(locationPositions), [locationPositions]);

  const currentSiteQty = productId ? currentStock[productId] ?? 0 : 0;
  const currentLocQty = productId && selectedLocationId ? currentLocationStock[productId] ?? 0 : 0;
  const currentPositionQty =
    productId && selectedPositionId
      ? currentPositionStock[positionStockKey(selectedPositionId, productId)] ?? 0
      : 0;

  const currentQty = productId
    ? isPositionMode
      ? currentPositionQty
      : isLocationMode
        ? currentLocQty
        : currentSiteQty
    : 0;

  const rawQuantityNum = (() => {
    const value = quantityValue.trim();
    if (value === "") return null;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;

    if (adjustMode === "count") return parsed >= 0 ? parsed : null;
    return parsed > 0 ? parsed : null;
  })();

  const deltaNum =
    rawQuantityNum != null
      ? adjustMode === "count"
        ? rawQuantityNum - currentQty
        : adjustMode === "add"
          ? rawQuantityNum
          : rawQuantityNum * -1
      : null;

  const newQty = deltaNum != null ? currentQty + deltaNum : null;
  const newSiteQty = deltaNum != null ? currentSiteQty + deltaNum : null;
  const newLocationQty = deltaNum != null && isLocationMode ? currentLocQty + deltaNum : null;

  const currentScopeLabel = isPositionMode
    ? "ubicación interna"
    : isLocationMode
      ? "LOC"
      : "sede";

  const canSubmit =
    Boolean(productId) &&
    rawQuantityNum != null &&
    deltaNum != null &&
    deltaNum !== 0 &&
    reason.trim().length > 0 &&
    !loading;

  const visibleProducts = useMemo(() => {
    const query = normalizeSearch(productSearch);
    const rows = query
      ? products.filter((product) => {
          const label = [
            product.name,
            product.sku,
            product.unit,
            String(currentStock[product.id] ?? ""),
            String(currentLocationStock[product.id] ?? ""),
            selectedPositionId
              ? String(currentPositionStock[positionStockKey(selectedPositionId, product.id)] ?? "")
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return normalizeSearch(label).includes(query);
        })
      : products;

    return rows.slice(0, 24);
  }, [currentLocationStock, currentPositionStock, currentStock, productSearch, products, selectedPositionId]);

  const resetConfirmation = () => {
    if (pendingConfirmation) setPendingConfirmation(false);
  };

  const selectProduct = (product: Product) => {
    setProductId(product.id);
    setProductSearch(formatProductLabel(product));
    setQuantityValue("");
    setIsProductPickerOpen(false);
    setFieldErrors((prev) => ({ ...prev, productId: undefined }));
    setPendingConfirmation(false);
  };

  const handleLocationChange = (nextLocationId: string) => {
    const params = new URLSearchParams();
    params.set("site_id", siteId);
    if (nextLocationId) params.set("location_id", nextLocationId);
    router.push(`/inventory/adjust?${params.toString()}`);
  };

  const handleQuickZero = () => {
    setAdjustMode("count");
    setQuantityValue("0");
    if (!reason.trim()) {
      setReason(
        isPositionMode
          ? "Saneamiento: ubicación interna vacía físicamente."
          : isLocationMode
            ? "Saneamiento: LOC vacío físicamente."
            : "Saneamiento: ajuste físico validado."
      );
    }
    setPendingConfirmation(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextFieldErrors: {
      productId?: string;
      quantity?: string;
      reason?: string;
    } = {};

    if (!productId) nextFieldErrors.productId = "Selecciona un producto.";
    if (rawQuantityNum == null) {
      nextFieldErrors.quantity =
        adjustMode === "count"
          ? "Ingresa la cantidad física real. Puede ser 0."
          : "Ingresa una cantidad mayor a 0.";
    } else if (deltaNum == null || deltaNum === 0) {
      nextFieldErrors.quantity = "No hay diferencia para ajustar.";
    } else if (newQty != null && newQty < 0) {
      nextFieldErrors.quantity = `El ajuste deja el stock de ${currentScopeLabel} en negativo.`;
    } else if (newSiteQty != null && newSiteQty < 0) {
      nextFieldErrors.quantity = "El ajuste deja el stock total de la sede en negativo.";
    } else if (newLocationQty != null && newLocationQty < 0) {
      nextFieldErrors.quantity = "El ajuste deja el stock del LOC en negativo.";
    }

    if (!reason.trim()) nextFieldErrors.reason = "Escribe el motivo del ajuste.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setPendingConfirmation(false);
      return;
    }

    if (!pendingConfirmation) {
      setFieldErrors({});
      setSubmitError("");
      setPendingConfirmation(true);
      return;
    }

    setFieldErrors({});
    setSubmitError("");
    setLoading(true);

    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          location_id: selectedLocationId || undefined,
          location_position_id: selectedPositionId || undefined,
          product_id: productId,
          quantity_delta: adjustMode === "count" ? undefined : deltaNum,
          counted_quantity: adjustMode === "count" ? rawQuantityNum : undefined,
          unit_cost_for_adjust:
            deltaNum != null && deltaNum > 0 && unitCostForAdjust.trim() !== ""
              ? Number(unitCostForAdjust)
              : undefined,
          reason: reason.trim(),
          evidence: evidence.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error ?? "Error al guardar el ajuste.");
        setLoading(false);
        setPendingConfirmation(false);
        return;
      }

      router.push(
        `/inventory/adjust?site_id=${encodeURIComponent(siteId)}${
          selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""
        }`
      );
    } catch {
      setSubmitError("Error de red al guardar.");
      setLoading(false);
      setPendingConfirmation(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Contexto</div>
              <div className="ui-caption mt-1">
                Elige producto, LOC y ubicación interna antes de corregir.
              </div>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {siteName}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {locations.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">LOC / destino operativo</span>
                <select
                  value={selectedLocationId}
                  onChange={(event) => handleLocationChange(event.target.value)}
                  className="ui-input"
                >
                  <option value="">Ajuste general de sede</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatLocationLabel(location)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">
                  Para vaciar una ubicación específica, selecciona primero su LOC.
                </span>
              </label>
            ) : (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 text-sm text-[var(--ui-muted)]">
                No hay LOCs activos para esta sede.
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="ui-label">Ubicación interna</span>
              <select
                value={selectedPositionId}
                onChange={(event) => {
                  setSelectedPositionId(event.target.value);
                  setQuantityValue("");
                  resetConfirmation();
                }}
                disabled={!selectedLocationId || positionOptions.length === 0}
                className="ui-input"
              >
                <option value="">
                  {!selectedLocationId
                    ? "Selecciona primero un LOC"
                    : positionOptions.length === 0
                      ? "Este LOC no tiene ubicaciones internas"
                      : "Sin ubicación interna / solo LOC"}
                </option>
                {positionOptions.map(({ position, label }) => (
                  <option key={position.id} value={position.id}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Si seleccionas una ubicación, el conteo impacta esa posición, su LOC y la sede.
              </span>
            </label>
          </div>

          <div className="relative">
            <label className="flex flex-col gap-1">
              <span className="ui-label">
                Producto <span className="text-[var(--ui-danger)]">*</span>
              </span>
              <input
                value={productSearch}
                onFocus={() => setIsProductPickerOpen(true)}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductId("");
                  setQuantityValue("");
                  setIsProductPickerOpen(true);
                  setFieldErrors((prev) => ({ ...prev, productId: undefined }));
                  resetConfirmation();
                }}
                placeholder="Buscar por nombre, SKU o unidad"
                className="ui-input"
                autoComplete="off"
              />
            </label>

            {isProductPickerOpen ? (
              <div className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-white p-2 shadow-xl">
                {visibleProducts.map((product) => {
                  const siteQty = currentStock[product.id] ?? 0;
                  const locQty = selectedLocationId ? currentLocationStock[product.id] ?? 0 : null;
                  const posQty = selectedPositionId
                    ? currentPositionStock[positionStockKey(selectedPositionId, product.id)] ?? 0
                    : null;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="mb-2 w-full rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-left transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-brand)]/5"
                      onClick={() => selectProduct(product)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[var(--ui-text)]">
                            {product.name}
                          </div>
                          <div className="mt-1 text-xs text-[var(--ui-muted)]">
                            {product.sku ? `SKU: ${product.sku} · ` : ""}
                            Unidad: {product.unit ?? "un"}
                          </div>
                        </div>
                        <div className="text-right text-xs text-[var(--ui-muted)]">
                          <div>Sede: {formatQty(siteQty)} {product.unit ?? "un"}</div>
                          {locQty != null ? <div>LOC: {formatQty(locQty)} {product.unit ?? "un"}</div> : null}
                          {posQty != null ? <div>Ubicación: {formatQty(posQty)} {product.unit ?? "un"}</div> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {!visibleProducts.length ? (
                  <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-4 text-sm text-[var(--ui-muted)]">
                    No encontramos ese producto. Prueba por nombre o SKU.
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-1 w-full rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--ui-muted)]"
                  onClick={() => setIsProductPickerOpen(false)}
                >
                  Cerrar buscador
                </button>
              </div>
            ) : null}

            {fieldErrors.productId ? (
              <span className="mt-1 block text-xs font-medium text-[var(--ui-danger)]">
                {fieldErrors.productId}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 ui-mobile-stack md:grid-cols-2 xl:grid-cols-4">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Sede</div>
              <div className="mt-1 font-semibold">{siteName}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">LOC</div>
              <div className="mt-1 font-semibold">
                {selectedLocation ? formatLocationLabel(selectedLocation) : "Ajuste general"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Ubicación interna</div>
              <div className="mt-1 font-semibold">
                {selectedPosition ? buildPositionPath(selectedPosition, new Map(locationPositions.map((p) => [p.id, p]))) : "Sin definir"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Producto</div>
              <div className="mt-1 font-semibold">{selectedProduct?.name ?? "Sin definir"}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3">
              <div className="ui-caption">Stock sede</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">
                {productId ? `${formatQty(currentSiteQty)} ${selectedProduct?.unit ?? "un"}` : "Selecciona producto"}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3">
              <div className="ui-caption">Stock LOC</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">
                {productId && selectedLocationId
                  ? `${formatQty(currentLocQty)} ${selectedProduct?.unit ?? "un"}`
                  : selectedLocationId
                    ? "Selecciona producto"
                    : "Sin LOC"}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3">
              <div className="ui-caption">Stock ubicación</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">
                {productId && selectedPositionId
                  ? `${formatQty(currentPositionQty)} ${selectedProduct?.unit ?? "un"}`
                  : selectedPositionId
                    ? "Selecciona producto"
                    : "Sin ubicación"}
              </div>
            </div>
          </div>

          <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
              Más acciones
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
                Ver stock
              </Link>
              <Link
                href={selectedLocationId ? `/inventory/locations/${encodeURIComponent(selectedLocationId)}/board` : "/inventory/locations"}
                className="ui-btn ui-btn--ghost"
              >
                Ver LOC
              </Link>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                disabled={!productId || currentQty <= 0}
                onClick={handleQuickZero}
              >
                Ajustar {currentScopeLabel} a 0
              </button>
            </div>
          </details>
        </section>

        {productId ? (
          <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="ui-h3">Cambio</div>
                <div className="ui-caption mt-1">
                  Elige si haces conteo físico, sumas o restas. El ajuste se confirma antes de guardar.
                </div>
              </div>
              {deltaNum != null && deltaNum !== 0 ? (
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    newQty != null && newQty >= 0
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border border-red-200 bg-red-50 text-red-900"
                  }`}
                >
                  Resultado {formatQty(newQty ?? 0)} {selectedProduct?.unit ?? "un"}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setAdjustMode("count");
                  setQuantityValue("");
                  resetConfirmation();
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  adjustMode === "count"
                    ? "border-cyan-300 bg-cyan-50 text-cyan-950"
                    : "border-[var(--ui-border)] bg-white text-[var(--ui-text)]"
                }`}
              >
                <div className="text-sm font-semibold">Conteo físico</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Escribes la cantidad real. Sirve para dejar una ubicación en 0.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustMode("remove");
                  setQuantityValue("");
                  resetConfirmation();
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  adjustMode === "remove"
                    ? "border-amber-300 bg-amber-50 text-amber-950"
                    : "border-[var(--ui-border)] bg-white text-[var(--ui-text)]"
                }`}
              >
                <div className="text-sm font-semibold">Restar stock</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Merma, daño, corrección o faltante.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustMode("add");
                  setQuantityValue("");
                  resetConfirmation();
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  adjustMode === "add"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-[var(--ui-border)] bg-white text-[var(--ui-text)]"
                }`}
              >
                <div className="text-sm font-semibold">Sumar stock</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Hallazgo, corrección o sobrante validado.
                </div>
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="ui-label">
                {adjustMode === "count" ? "Cantidad física real" : "Cantidad"}{" "}
                <span className="text-[var(--ui-danger)]">*</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quantityValue}
                  onChange={(event) => {
                    setQuantityValue(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, quantity: undefined }));
                    resetConfirmation();
                  }}
                  placeholder={adjustMode === "count" ? "Ej: 0" : "Cantidad"}
                  required
                  className="ui-input flex-1"
                />
                {selectedProduct?.unit ? <span className="ui-body-muted">{selectedProduct.unit}</span> : null}
              </div>
              {deltaNum != null && deltaNum !== 0 ? (
                <div className="mt-2 text-sm font-medium text-zinc-700">
                  Stock resultante en {currentScopeLabel}:{" "}
                  <span className={newQty != null && newQty >= 0 ? "text-green-600" : "text-red-600"}>
                    {formatQty(newQty ?? 0)} {selectedProduct?.unit ?? "un"}
                  </span>
                </div>
              ) : null}
              {fieldErrors.quantity ? (
                <span className="text-xs font-medium text-[var(--ui-danger)]">{fieldErrors.quantity}</span>
              ) : null}
            </label>

            {deltaNum != null && deltaNum !== 0 ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="ui-label">
                    Motivo <span className="text-[var(--ui-danger)]">*</span>
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setFieldErrors((prev) => ({ ...prev, reason: undefined }));
                      resetConfirmation();
                    }}
                    placeholder="Ej: Merma detectada, corrección por conteo, producto dañado."
                    required
                    rows={3}
                    className="ui-input"
                  />
                  {fieldErrors.reason ? (
                    <span className="text-xs font-medium text-[var(--ui-danger)]">{fieldErrors.reason}</span>
                  ) : null}
                </label>

                <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Evidencia y costo opcionales
                  </summary>
                  <div className="mt-4 space-y-3">
                    {deltaNum != null && deltaNum > 0 ? (
                      <label className="flex flex-col gap-1">
                        <span className="ui-label">Costo unitario del ajuste</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={unitCostForAdjust}
                          onChange={(event) => {
                            setUnitCostForAdjust(event.target.value);
                            resetConfirmation();
                          }}
                          placeholder="Si lo dejas vacío, no cambia costo promedio"
                          className="ui-input"
                        />
                      </label>
                    ) : null}

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Evidencia</span>
                      <textarea
                        value={evidence}
                        onChange={(event) => {
                          setEvidence(event.target.value);
                          resetConfirmation();
                        }}
                        placeholder="Ej: reporte de supervisor, foto, incidencia."
                        rows={2}
                        className="ui-input"
                      />
                    </label>
                  </div>
                </details>

                <div className={pendingConfirmation ? "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" : "rounded-2xl border border-[var(--ui-border)] bg-white p-4 text-sm text-[var(--ui-muted)]"}>
                  <div className="font-bold text-[var(--ui-text)]">Resumen antes de guardar</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>Producto: <span className="font-semibold">{selectedProduct?.name}</span></div>
                    <div>Alcance: <span className="font-semibold">{currentScopeLabel}</span></div>
                    <div>Actual: <span className="font-semibold">{formatQty(currentQty)} {selectedProduct?.unit ?? "un"}</span></div>
                    <div>Diferencia: <span className={deltaNum > 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{deltaNum > 0 ? "+" : ""}{formatQty(deltaNum)} {selectedProduct?.unit ?? "un"}</span></div>
                    <div>Nuevo: <span className="font-semibold">{formatQty(newQty ?? 0)} {selectedProduct?.unit ?? "un"}</span></div>
                    {selectedLocation ? <div>LOC: <span className="font-semibold">{formatLocationLabel(selectedLocation)}</span></div> : null}
                    {selectedPosition ? <div className="md:col-span-2">Ubicación: <span className="font-semibold">{buildPositionPath(selectedPosition, new Map(locationPositions.map((p) => [p.id, p])))}</span></div> : null}
                  </div>
                  {pendingConfirmation ? (
                    <div className="mt-3 font-semibold">
                      Revisa este resumen. Si está correcto, presiona “Confirmar ajuste”.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="ui-alert ui-alert--warn">
                Elige conteo físico, sumar o restar. En conteo físico puedes escribir 0 para vaciar la ubicación, el LOC o la sede seleccionada.
              </div>
            )}
          </section>
        ) : (
          <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
            <div className="ui-alert ui-alert--neutral">
              Primero selecciona el producto. Después aparece el cambio a registrar.
            </div>
          </section>
        )}

        <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
          {submitError ? <div className="w-full ui-alert ui-alert--error">{submitError}</div> : null}
          <div className="text-sm text-[var(--ui-muted)]">
            {selectedProduct?.name ?? "Sin producto"}
            {newQty != null ? ` · ${formatQty(newQty)} ${selectedProduct?.unit ?? ""}` : ""}
          </div>
          <Link href={`/inventory/adjust?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Guardando..." : pendingConfirmation ? "Confirmar ajuste" : "Revisar ajuste"}
          </button>
        </div>
      </form>
    </div>
  );
}
