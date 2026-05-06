"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

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

type UnitOption = {
  value: string;
  label: string;
  inputUnitCode: string;
  profileId: string;
};

type CartItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  inputUnitCode: string;
  inputUomProfileId: string;
  unitLabel: string;
  availableQty: number;
  stockUnitCode: string;
};

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

function unitLabel(value: string) {
  const clean = String(value ?? "").trim();
  if (!clean) return "Unidad";
  const normalized = clean.toLowerCase();
  if (normalized === "un") return "Unidad";
  return clean;
}

function normalizeProductSearch(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function activeProfilesForProduct(profiles: ProductUomProfile[], productId: string) {
  const candidates = profiles.filter((profile) => {
    if (!profile.is_active || profile.product_id !== productId) return false;
    return true;
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
  const [productQuery, setProductQuery] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(Boolean(initialProduct));

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

  const productProfiles = useMemo(
    () => (productId ? profilesByProduct.get(productId) ?? [] : []),
    [productId, profilesByProduct]
  );

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
    : unitLabel(inputUnitCode || stockUnitCode);

  const quantityNumber = Number(quantity);
  const canSubmit = Boolean(workerId && cartItems.length > 0);
  const draftCanBeAdded = Boolean(product && inputUnitCode && quantityNumber > 0);

  const productError =
    errorMessage && errorProductId && (errorProductId === productId || cartItems.some((item) => item.productId === errorProductId))
      ? errorMessage
      : "";

  const generalProductError = errorMessage && errorProductId && !productError ? errorMessage : "";

  const selectedProductLabel = product
    ? `${product.name ?? product.id} · Disponible ${formatQty(product.available_qty)} ${product.stock_unit_code ?? product.unit ?? "un"
    }`
    : "";

  const normalizedProductQuery = normalizeProductSearch(productQuery);
  const shouldShowSearchResults = isAddingProduct && !product && normalizedProductQuery.length >= 2;

  const filteredProducts = useMemo(() => {
    const query = normalizeProductSearch(productQuery);

    if (query.length < 2) return [];

    return products.filter((item) => {
      const haystack = normalizeProductSearch([item.name, item.unit, item.stock_unit_code, item.id].join(" "));
      return haystack.includes(query);
    });
  }, [productQuery, products]);

  const unitOptions = useMemo(() => {
    const options: UnitOption[] = [];
    const seen = new Set<string>();

    function addOption(option: UnitOption) {
      const key = option.profileId
        ? `profile:${option.profileId}`
        : `unit:${normalizeUnitCode(option.inputUnitCode)}`;

      if (!option.inputUnitCode || seen.has(key)) return;

      seen.add(key);
      options.push(option);
    }

    addOption({
      value: `unit:${stockUnitCode}`,
      label: unitLabel(stockUnitCode),
      inputUnitCode: stockUnitCode,
      profileId: "",
    });

    for (const profile of productProfiles) {
      addOption({
        value: `profile:${profile.id}`,
        label: profileOptionLabel(profile, stockUnitCode),
        inputUnitCode: normalizeUnitCode(profile.input_unit_code),
        profileId: profile.id,
      });
    }

    const profileInputUnits = new Set(productProfiles.map((profile) => normalizeUnitCode(profile.input_unit_code)));
    const productUnitCode = normalizeUnitCode(product?.unit ?? "");

    if (productUnitCode && productUnitCode !== stockUnitCode && !profileInputUnits.has(productUnitCode)) {
      addOption({
        value: `unit:${productUnitCode}`,
        label: unitLabel(productUnitCode),
        inputUnitCode: productUnitCode,
        profileId: "",
      });
    }

    return options;
  }, [product?.unit, productProfiles, stockUnitCode]);

  const missingFields = [
    !workerId ? "Trabajador" : "",
    cartItems.length === 0 ? "Agrega al menos un producto al retiro" : "",
  ].filter(Boolean);

  function selectProduct(next: string) {
    const nextProduct = products.find((item) => item.id === next) ?? null;
    const nextStockUnit = normalizeUnitCode(nextProduct?.stock_unit_code ?? nextProduct?.unit ?? "un");
    const nextProfile = defaultProfileByProduct.get(next) ?? null;

    setProductId(next);
    setInputUnitCode(normalizeUnitCode(nextProfile?.input_unit_code ?? "") || (nextProduct ? nextStockUnit : ""));
    setInputUomProfileId(nextProfile?.id ?? "");
    setProductQuery("");
  }

  function clearDraftProduct() {
    setProductId("");
    setQuantity("");
    setInputUnitCode("");
    setInputUomProfileId("");
    setProductQuery("");
  }

  function openAddProduct() {
    clearDraftProduct();
    setIsAddingProduct(true);
  }

  function cancelAddProduct() {
    clearDraftProduct();
    setIsAddingProduct(false);
  }

  function addDraftToCart() {
    if (!product || !draftCanBeAdded) return;

    const nextQuantity = Number(quantity);
    const nextInputUnitCode = inputUnitCode || stockUnitCode;
    const nextInputUomProfileId = inputUomProfileId;
    const nextProductName = product.name ?? product.id;
    const nextStockUnitCode = product.stock_unit_code ?? product.unit ?? "un";
    const nextUnitLabel = selectedUnitLabel;

    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (item) =>
          item.productId === product.id &&
          item.inputUnitCode === nextInputUnitCode &&
          item.inputUomProfileId === nextInputUomProfileId
      );

      if (existingIndex >= 0) {
        return currentItems.map((item, index) =>
          index === existingIndex
            ? {
              ...item,
              quantity: item.quantity + nextQuantity,
            }
            : item
        );
      }

      return [
        ...currentItems,
        {
          id: `${product.id}:${nextInputUnitCode}:${nextInputUomProfileId || "unit"}:${Date.now()}`,
          productId: product.id,
          productName: nextProductName,
          quantity: nextQuantity,
          inputUnitCode: nextInputUnitCode,
          inputUomProfileId: nextInputUomProfileId,
          unitLabel: nextUnitLabel,
          availableQty: product.available_qty,
          stockUnitCode: nextStockUnitCode,
        },
      ];
    });

    clearDraftProduct();
    setIsAddingProduct(false);
  }

  function removeCartItem(itemId: string) {
    setCartItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
  }

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

    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }

  return (
    <form ref={formRef} action={action} noValidate onSubmit={handleSubmit} className="space-y-5 pb-24 lg:pb-0">
      <input type="hidden" name="source_location_id" value={sourceLocationId} />
      <input type="hidden" name="return_to" value={returnTo} />

      {cartItems.map((item) => (
        <div key={`hidden-${item.id}`} className="hidden">
          <input type="hidden" name="item_product_id" value={item.productId} />
          <input type="hidden" name="item_quantity" value={String(item.quantity)} />
          <input type="hidden" name="item_input_unit_code" value={item.inputUnitCode} />
          <input type="hidden" name="item_input_uom_profile_id" value={item.inputUomProfileId} />
          <input type="hidden" name="item_notes" value="" />
        </div>
      ))}

      <section className="ui-panel ui-remission-section ui-fade-up space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Quién retira</div>
            <div className="ui-caption mt-1">
              Selecciona el trabajador que está retirando productos desde este punto.
            </div>
          </div>

          {selectedWorker ? (
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
              {selectedWorker.has_destination ? `Destino ${selectedWorker.destination_label}` : "Sin destino"}
            </span>
          ) : null}
        </div>

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
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Productos del retiro</div>
            <div className="ui-caption mt-1">
              Agrega solo los productos que realmente se van a retirar o trasladar.
            </div>
          </div>

          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {cartItems.length} agregado{cartItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {generalProductError || productError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {productError || generalProductError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          {cartItems.length > 0 ? (
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-base font-semibold text-[var(--ui-text)]">
                      {item.productName}
                    </div>
                    <div className="mt-1 text-sm text-[var(--ui-muted)]">
                      {formatQty(item.quantity)} {item.unitLabel}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCartItem(item.id)}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-6 text-center">
              <div className="text-base font-semibold text-[var(--ui-text)]">
                No hay productos agregados
              </div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Toca + Agregar producto para comenzar.
              </p>
            </div>
          )}

          {!isAddingProduct ? (
            <button
              type="button"
              onClick={openAddProduct}
              className="ui-btn ui-btn--brand mt-4 h-12 w-full text-base font-semibold"
            >
              + Agregar producto
            </button>
          ) : null}
        </div>

        {isAddingProduct ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="ui-h3">Agregar producto</div>
                <div className="ui-caption mt-1">
                  Busca, selecciona, escribe cantidad y agrega.
                </div>
              </div>

              <button
                type="button"
                onClick={cancelAddProduct}
                className="ui-btn ui-btn--ghost h-10 px-3 text-sm"
              >
                Cancelar
              </button>
            </div>

            {!product ? (
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Buscar producto</span>
                  <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--ui-border)] bg-white px-3 shadow-sm focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100">
                    <input
                      type="search"
                      inputMode="search"
                      enterKeyHint="done"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.currentTarget.value)}
                      onInput={(event) => setProductQuery(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      className="min-h-11 flex-1 bg-transparent text-base font-semibold text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-muted)]"
                      placeholder="Escribe mínimo 2 letras"
                    />

                    {productQuery ? (
                      <button
                        type="button"
                        onClick={() => setProductQuery("")}
                        className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
                        aria-label="Limpiar búsqueda"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </label>

                {!shouldShowSearchResults ? (
                  <div className="rounded-2xl border border-dashed border-amber-200 bg-white px-4 py-5 text-center text-sm text-[var(--ui-muted)]">
                    Escribe mínimo 2 letras para mostrar productos.
                  </div>
                ) : filteredProducts.length > 0 ? (
                  <div className="grid max-h-[34vh] gap-2 overflow-auto pr-1 sm:grid-cols-2">
                    {filteredProducts.slice(0, 40).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectProduct(item.id)}
                        className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 text-left shadow-sm active:scale-[0.99]"
                      >
                        <div className="line-clamp-2 text-sm font-semibold text-[var(--ui-text)]">
                          {item.name ?? item.id}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Disponible:{" "}
                          <span className="font-semibold text-[var(--ui-text)]">
                            {formatQty(item.available_qty)} {item.stock_unit_code ?? item.unit ?? "un"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-5 text-center">
                    <div className="text-base font-semibold text-[var(--ui-text)]">Sin productos</div>
                    <p className="mt-1 text-sm text-[var(--ui-muted)]">
                      No encontramos productos para esa búsqueda.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
                    Producto seleccionado
                  </div>
                  <div className="mt-1 text-base font-semibold text-[var(--ui-text)]">
                    {selectedProductLabel}
                  </div>
                  <button
                    type="button"
                    onClick={clearDraftProduct}
                    className="mt-2 text-xs font-semibold text-amber-950 underline underline-offset-4"
                  >
                    Cambiar producto
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="flex min-h-5 items-center justify-between gap-2">
                      <span className="ui-label">Cantidad</span>
                      <span className="truncate text-xs font-normal text-[var(--ui-muted)]">
                        Disponible: {formatQty(availableInSelectedUnit)} {selectedUnitLabel}
                      </span>
                    </span>
                    <input
                      name="quantity"
                      className="ui-input h-12 bg-white"
                      placeholder="Cantidad"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Unidad</span>
                    <select
                      className="ui-input h-12 bg-white"
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
                      {unitOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="input_unit_code" value={inputUnitCode} />
                <input type="hidden" name="input_uom_profile_id" value={inputUomProfileId} />

                <button
                  type="button"
                  onClick={addDraftToCart}
                  disabled={!draftCanBeAdded}
                  className="ui-btn ui-btn--brand h-12 w-full text-base font-semibold disabled:opacity-50"
                >
                  Agregar al retiro
                </button>
              </div>
            )}
          </div>
        ) : null}

        <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
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
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedWorker
            ? `${cartItems.length} producto${cartItems.length === 1 ? "" : "s"} · ${selectedWorker.has_destination
              ? `Traslado a: ${selectedWorker.destination_label}`
              : "Retiro sin destino"
            }`
            : "Selecciona trabajador"}
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
                        Productos
                      </div>
                      <div className="mt-2 space-y-2">
                        {cartItems.map((item) => (
                          <div
                            key={`confirm-${item.id}`}
                            className="rounded-2xl border border-[var(--ui-border)] bg-white px-3 py-2"
                          >
                            <div className="text-sm font-semibold text-[var(--ui-text)]">
                              {item.productName}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--ui-muted)]">
                              {formatQty(item.quantity)} {item.unitLabel}
                            </div>
                          </div>
                        ))}
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