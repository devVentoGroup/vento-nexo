"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  applyMasterIdentityDraft,
  applyMasterInventoryProfiles,
  applyMasterPresentationVersions,
  applyMasterProductSites,
  applyMasterProductionRoutes,
  applyMasterRequestPolicies,
  applyMasterRequestPolicyRules,
  applyMasterRequestPolicyUnits,
  applyMasterSupplierPurchases,
  deactivateMasterRequestPolicies,
} from "@/app/inventory/settings/products/actions";

type Zone =
  | "identity"
  | "requests"
  | "presentations"
  | "suppliers"
  | "sites"
  | "inventory"
  | "production"
  | "sales";
type View = "product" | "presentation";
type RequestPolicy = {
  id: string;
  label: string;
  request_unit_code: string;
  base_unit_code: string;
  base_qty_per_request_unit: number;
  minimum_request_qty: number;
  request_step_qty: number;
};
type Row = {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  categoryId: string;
  category: string | null;
  supplier: string | null;
  stockUnit: string | null;
  hasRoute: boolean;
  hasPolicy: boolean;
  requestPolicy: RequestPolicy | null;
};
type Presentation = {
  id: string;
  productId: string;
  productName: string;
  label: string;
  inputUnit: string | null;
  stockQty: number | null;
  stockUnit: string | null;
  isActive: boolean;
  supplierLinkId: string | null;
  supplier: string | null;
  purchaseUnit: string | null;
  purchasePackQty: number | null;
  purchasePrice: number | null;
  currency: string;
  isPrimary: boolean;
};

const zones: Array<{ id: Zone; label: string; hint: string }> = [
  {
    id: "identity",
    label: "Identidad",
    hint: "Nombre, SKU, tipo, categoría y estado.",
  },
  {
    id: "requests",
    label: "Solicitudes",
    hint: "Unidad visible, mínimos, paso y ruta.",
  },
  {
    id: "presentations",
    label: "Presentaciones",
    hint: "Empaques físicos, equivalencias y fotos.",
  },
  { id: "suppliers", label: "Proveedores", hint: "Compra, empaque y costo." },
  {
    id: "sites",
    label: "Sedes y áreas",
    hint: "Disponibilidad, áreas, mínimos y LOCs.",
  },
  {
    id: "inventory",
    label: "Inventario",
    hint: "Unidad base, trazabilidad y medición.",
  },
  {
    id: "production",
    label: "Producción",
    hint: "Área y LOCs de insumos y terminado.",
  },
  { id: "sales", label: "Ventas", hint: "Habilitación operativa por sede." },
];

function status(row: Row, zone: Zone) {
  if (zone === "requests")
    return row.hasPolicy && row.hasRoute
      ? "Listo"
      : row.hasPolicy || row.hasRoute
        ? "Parcial"
        : "Pendiente";
  if (zone === "suppliers") return row.supplier ? "Listo" : "Pendiente";
  if (zone === "inventory") return row.stockUnit ? "Listo" : "Pendiente";
  return row.isActive ? "Listo" : "Pendiente";
}

export function MasterProductsConfigurator({
  canApply,
  rows,
  categories,
  suppliers,
  presentations,
  sites,
  siteSettings,
  inventoryProfiles,
  areas,
  locations,
  batches,
}: {
  canApply: boolean;
  rows: Row[];
  categories: Array<{ id: string; name: string }>;
  suppliers: string[];
  presentations: Presentation[];
  sites: Array<{ id: string; name: string }>;
  siteSettings: Array<{
    productId: string;
    siteId: string;
    isActive: boolean;
    inventoryEnabled: boolean;
    remissionEnabled: boolean;
    salesEnabled: boolean;
    minStockQty: number;
  }>;
  inventoryProfiles: Array<{
    productId: string;
    trackInventory: boolean;
    inventoryKind: string;
    lotTracking: boolean;
    expiryTracking: boolean;
    measurementMode: string;
    defaultTolerancePercent: number;
  }>;
  areas: Array<{ code: string; name: string }>;
  locations: Array<{ id: string; siteId: string; name: string }>;
  batches: Array<{
    id: string;
    zone: string;
    productCount: number;
    createdAt: string;
  }>;
}) {
  const [zone, setZone] = useState<Zone>("identity");
  const [view, setView] = useState<View>("product");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});
  const [requestDraft, setRequestDraft] = useState<
    Record<
      string,
      { minimum: string; step: string; unit?: string; equivalence?: string }
    >
  >({});
  const [selectedPresentations, setSelectedPresentations] = useState<string[]>(
    [],
  );
  const [purchaseDraft, setPurchaseDraft] = useState<
    Record<
      string,
      { price: string; packQty: string; unit: string; primary: boolean }
    >
  >({});
  const [physicalDraft, setPhysicalDraft] = useState<
    Record<string, { label: string; inputUnit: string; stockQty: string }>
  >({});
  const [siteId, setSiteId] = useState("");
  const [siteDraft, setSiteDraft] = useState({
    isActive: true,
    inventoryEnabled: true,
    remissionEnabled: false,
    salesEnabled: false,
    minStockQty: "0",
  });
  const [inventoryDraft, setInventoryDraft] = useState({
    trackInventory: true,
    inventoryKind: "insumo",
    lotTracking: false,
    expiryTracking: false,
    measurementMode: "fixed_presentation",
    defaultTolerancePercent: "0",
  });
  const [productionDraft, setProductionDraft] = useState({
    siteId: "",
    areaKind: "",
    inputLocationId: "",
    outputLocationId: "",
  });
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.name} ${row.sku ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase()) &&
          (!category || row.category === category) &&
          (!supplier || row.supplier === supplier),
      ),
    [rows, q, category, supplier],
  );
  const visiblePresentations = useMemo(
    () =>
      presentations.filter(
        (item) =>
          `${item.productName} ${item.label}`
            .toLowerCase()
            .includes(q.toLowerCase()) &&
          (!supplier || item.supplier === supplier),
      ),
    [presentations, q, supplier],
  );
  const updateDraft = (id: string, patch: Partial<Row>) =>
    setDraft((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const select = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const identityChanges = selected
    .map((id) => {
      const row = rows.find((item) => item.id === id);
      const change = draft[id];
      if (
        !row ||
        !change ||
        (change.name === undefined &&
          change.sku === undefined &&
          change.categoryId === undefined &&
          change.isActive === undefined)
      )
        return null;
      return {
        productId: id,
        name: change.name ?? row.name,
        sku: change.sku ?? row.sku,
        categoryId: change.categoryId ?? row.categoryId,
        isActive: change.isActive ?? row.isActive,
      };
    })
    .filter(
      (
        change,
      ): change is {
        productId: string;
        name: string;
        sku: string | null;
        categoryId: string;
        isActive: boolean;
      } => Boolean(change),
    );
  const selectedPolicyIds = selected
    .map((id) => rows.find((row) => row.id === id)?.requestPolicy?.id)
    .filter((id): id is string => Boolean(id));
  const requestRuleChanges = selected
    .map((id) => {
      const policy = rows.find((row) => row.id === id)?.requestPolicy;
      const change = policy ? requestDraft[policy.id] : null;
      if (!policy || !change) return null;
      const minimum = Number(change.minimum);
      const step = Number(change.step);
      if (
        !Number.isFinite(minimum) ||
        !Number.isFinite(step) ||
        (minimum === Number(policy.minimum_request_qty) &&
          step === Number(policy.request_step_qty))
      )
        return null;
      return {
        policyId: policy.id,
        minimumRequestQty: minimum,
        requestStepQty: step,
      };
    })
    .filter(
      (
        change,
      ): change is {
        policyId: string;
        minimumRequestQty: number;
        requestStepQty: number;
      } => Boolean(change),
    );
  const requestUnitChanges = selected
    .map((id) => {
      const policy = rows.find((row) => row.id === id)?.requestPolicy;
      const change = policy ? requestDraft[policy.id] : null;
      if (!policy || !change) return null;
      const requestUnitCode = change.unit?.trim() ?? policy.request_unit_code;
      const baseQtyPerRequestUnit = Number(
        change.equivalence ?? policy.base_qty_per_request_unit,
      );
      if (
        !requestUnitCode ||
        !Number.isFinite(baseQtyPerRequestUnit) ||
        baseQtyPerRequestUnit <= 0 ||
        (requestUnitCode === policy.request_unit_code &&
          baseQtyPerRequestUnit === Number(policy.base_qty_per_request_unit))
      )
        return null;
      return { policyId: policy.id, requestUnitCode, baseQtyPerRequestUnit };
    })
    .filter(
      (
        change,
      ): change is {
        policyId: string;
        requestUnitCode: string;
        baseQtyPerRequestUnit: number;
      } => Boolean(change),
    );
  const requestChanges = selected
    .map((id) => {
      const policy = rows.find((row) => row.id === id)?.requestPolicy;
      const change = policy ? requestDraft[policy.id] : null;
      if (!policy || !change) return null;
      const requestUnitCode = change.unit?.trim() ?? policy.request_unit_code;
      const baseQtyPerRequestUnit = Number(
        change.equivalence ?? policy.base_qty_per_request_unit,
      );
      const minimumRequestQty = Number(
        change.minimum ?? policy.minimum_request_qty,
      );
      const requestStepQty = Number(change.step ?? policy.request_step_qty);
      if (
        !requestUnitCode ||
        !Number.isFinite(baseQtyPerRequestUnit) ||
        !Number.isFinite(minimumRequestQty) ||
        !Number.isFinite(requestStepQty)
      )
        return null;
      if (
        requestUnitCode === policy.request_unit_code &&
        baseQtyPerRequestUnit === Number(policy.base_qty_per_request_unit) &&
        minimumRequestQty === Number(policy.minimum_request_qty) &&
        requestStepQty === Number(policy.request_step_qty)
      )
        return null;
      return {
        policyId: policy.id,
        requestUnitCode,
        baseQtyPerRequestUnit,
        minimumRequestQty,
        requestStepQty,
      };
    })
    .filter(
      (
        change,
      ): change is {
        policyId: string;
        requestUnitCode: string;
        baseQtyPerRequestUnit: number;
        minimumRequestQty: number;
        requestStepQty: number;
      } => Boolean(change),
    );
  const physicalChanges = selectedPresentations
    .map((id) => {
      const item = presentations.find((presentation) => presentation.id === id);
      const change = item ? physicalDraft[id] : null;
      if (!item || !change) return null;
      const label = change.label.trim();
      const inputUnitCode = change.inputUnit.trim();
      const qtyInStockUnit = Number(change.stockQty);
      if (
        !label ||
        !inputUnitCode ||
        !Number.isFinite(qtyInStockUnit) ||
        qtyInStockUnit <= 0
      )
        return null;
      if (
        label === item.label &&
        inputUnitCode === (item.inputUnit ?? "") &&
        qtyInStockUnit === Number(item.stockQty)
      )
        return null;
      return {
        profileId: item.id,
        label,
        inputUnitCode,
        qtyInStockUnit,
        productName: item.productName,
      };
    })
    .filter(
      (
        change,
      ): change is {
        profileId: string;
        label: string;
        inputUnitCode: string;
        qtyInStockUnit: number;
        productName: string;
      } => Boolean(change),
    );
  const purchaseChanges = selectedPresentations
    .map((id) => {
      const item = presentations.find((presentation) => presentation.id === id);
      const change = item ? purchaseDraft[id] : null;
      if (!item?.supplierLinkId || !change) return null;
      const purchasePrice = Number(change.price);
      const purchasePackQty = Number(change.packQty);
      const purchasePackUnitCode = change.unit.trim();
      if (
        !Number.isFinite(purchasePrice) ||
        !Number.isFinite(purchasePackQty) ||
        !purchasePackUnitCode
      )
        return null;
      return {
        productSupplierId: item.supplierLinkId,
        purchasePrice,
        purchasePackQty,
        purchasePackUnitCode,
        isPrimary: change.primary,
        productName: item.productName,
        label: item.label,
      };
    })
    .filter(
      (
        change,
      ): change is {
        productSupplierId: string;
        purchasePrice: number;
        purchasePackQty: number;
        purchasePackUnitCode: string;
        isPrimary: boolean;
        productName: string;
        label: string;
      } => Boolean(change),
    );
  const siteChanges = siteId
    ? selected
        .map((productId) => ({
          productId,
          siteId,
          isActive: siteDraft.isActive,
          inventoryEnabled: siteDraft.inventoryEnabled,
          remissionEnabled: siteDraft.remissionEnabled,
          salesEnabled: siteDraft.salesEnabled,
          minStockQty: Number(siteDraft.minStockQty),
        }))
        .filter(
          (change) =>
            Number.isFinite(change.minStockQty) && change.minStockQty >= 0,
        )
    : [];
  const inventoryChanges = selected
    .map((productId) => ({
      productId,
      trackInventory: inventoryDraft.trackInventory,
      inventoryKind: inventoryDraft.inventoryKind,
      lotTracking: inventoryDraft.lotTracking,
      expiryTracking: inventoryDraft.expiryTracking,
      measurementMode: inventoryDraft.measurementMode,
      defaultTolerancePercent: Number(inventoryDraft.defaultTolerancePercent),
    }))
    .filter(
      (change) =>
        Number.isFinite(change.defaultTolerancePercent) &&
        change.defaultTolerancePercent >= 0 &&
        change.defaultTolerancePercent <= 100,
    );
  const productionChanges =
    productionDraft.siteId &&
    productionDraft.areaKind &&
    productionDraft.inputLocationId &&
    productionDraft.outputLocationId
      ? selected.map((productId) => ({
          productId,
          siteId: productionDraft.siteId,
          areaKind: productionDraft.areaKind,
          inputLocationId: productionDraft.inputLocationId,
          outputLocationId: productionDraft.outputLocationId,
        }))
      : [];
  const expandedRequest =
    zone === "requests"
      ? (rows.find((row) => row.id === expanded) ?? null)
      : null;
  const applyIdentity = () =>
    startTransition(async () => {
      const result = await applyMasterIdentityDraft(identityChanges);
      setMessage(result.message);
      if (result.ok) {
        setDraft({});
        setSelected([]);
        setPreviewOpen(false);
      }
    });
  const deactivatePolicies = () =>
    startTransition(async () => {
      const result = await deactivateMasterRequestPolicies(selectedPolicyIds);
      setMessage(result.message);
      if (result.ok) {
        setSelected([]);
        setPreviewOpen(false);
      }
    });
  const applyRequestRules = () =>
    startTransition(async () => {
      const result = await applyMasterRequestPolicyRules(requestRuleChanges);
      setMessage(result.message);
      if (result.ok) {
        setRequestDraft({});
        setSelected([]);
        setPreviewOpen(false);
      }
    });
  const applyRequestUnits = () =>
    startTransition(async () => {
      const result = await applyMasterRequestPolicyUnits(requestUnitChanges);
      setMessage(result.message);
      if (result.ok) {
        setRequestDraft({});
        setSelected([]);
        setPreviewOpen(false);
      }
    });
  const applyRequests = () =>
    startTransition(async () => {
      const result = await applyMasterRequestPolicies(requestChanges);
      setMessage(result.message);
      if (result.ok) {
        setRequestDraft({});
        setSelected([]);
        setPreviewOpen(false);
      }
    });
  const applyPhysicalPresentations = () =>
    startTransition(async () => {
      const result = await applyMasterPresentationVersions(physicalChanges);
      setMessage(result.message);
      if (result.ok) {
        setPhysicalDraft({});
        setSelectedPresentations([]);
      }
    });
  const applyPurchases = () =>
    startTransition(async () => {
      const result = await applyMasterSupplierPurchases(purchaseChanges);
      setMessage(result.message);
      if (result.ok) {
        setPurchaseDraft({});
        setSelectedPresentations([]);
      }
    });
  const applySites = () =>
    startTransition(async () => {
      const result = await applyMasterProductSites(siteChanges);
      setMessage(result.message);
      if (result.ok) setSelected([]);
    });
  const applyInventory = () =>
    startTransition(async () => {
      const result = await applyMasterInventoryProfiles(inventoryChanges);
      setMessage(result.message);
      if (result.ok) setSelected([]);
    });
  const applyProduction = () =>
    startTransition(async () => {
      const result = await applyMasterProductionRoutes(productionChanges);
      setMessage(result.message);
      if (result.ok) setSelected([]);
    });

  return (
    <div className="ui-scene w-full space-y-5">
    <section className="ui-panel ui-panel--halo">
        <div className="ui-caption">Configuración maestra · productos</div>
        <h1 className="mt-2 ui-h1">
          Una mesa para configurar todos los productos
        </h1>
        <p className="mt-2 ui-body-muted">
          Filtra, expande y prepara cambios sin salir a una ficha por cada
          producto.
        </p>
    </section>
    {!canApply ? <div className="ui-alert ui-alert--neutral">Modo consulta: solo Propietario o Gerente general puede aplicar cambios masivos. Puedes revisar toda la configuración sin riesgo de modificarla.</div> : null}
      <section className="ui-panel space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="ui-input md:col-span-2"
            placeholder="Buscar nombre o SKU"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="ui-input"
          >
            <option value="">Todas las categorías</option>
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            className="ui-input"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {zones.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setZone(item.id);
                setPreviewOpen(false);
                setMessage(null);
              }}
              className={
                zone === item.id
                  ? "ui-btn ui-btn--brand ui-btn--sm"
                  : "ui-btn ui-btn--ghost ui-btn--sm"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="ui-caption">
            {zones.find((item) => item.id === zone)?.hint}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setView("product")}
              className={
                view === "product"
                  ? "ui-btn ui-btn--brand ui-btn--sm"
                  : "ui-btn ui-btn--ghost ui-btn--sm"
              }
            >
              Por producto
            </button>
            <button
              onClick={() => setView("presentation")}
              className={
                view === "presentation"
                  ? "ui-btn ui-btn--brand ui-btn--sm"
                  : "ui-btn ui-btn--ghost ui-btn--sm"
              }
            >
              Por presentación
            </button>
          </div>
        </div>
        {view === "presentation" ? (
          <div className="ui-alert ui-alert--neutral">
            Cada fila representa una presentación física real. Compra y empaque
            se editan por separado para no mezclar precio futuro con
            equivalencias operativas.
          </div>
        ) : null}
      </section>
      {message ? (
        <div
          className={
            message.startsWith("Se aplicaron")
              ? "ui-alert ui-alert--success"
              : "ui-alert ui-alert--neutral"
          }
        >
          {message}
        </div>
      ) : null}
      {selected.length ? (
        <section className="ui-panel border-amber-200 bg-amber-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">
                Borrador para {selected.length} producto(s)
              </div>
              <div className="ui-caption">
                {zone === "identity"
                  ? `${identityChanges.length} cambio(s) de identidad listo(s) para revisar.`
                  : zone === "requests"
                    ? `${selectedPolicyIds.length} política(s) activa(s) seleccionada(s).`
                    : "Esta zona aún no tiene edición masiva."}
              </div>
            </div>
            <button
              onClick={() => setPreviewOpen(true)}
              disabled={
                (zone === "identity" && !identityChanges.length) ||
                (zone === "requests" && !selectedPolicyIds.length) ||
                (zone !== "identity" && zone !== "requests")
              }
              className="ui-btn ui-btn--brand disabled:opacity-50"
            >
              Revisar impacto
            </button>
          </div>
          {previewOpen ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
              <div className="font-semibold">Vista previa de impacto</div>
              {zone === "requests" ? (
                <>
                  <p className="ui-caption mt-1">
                    Se desactivarán solo para solicitudes futuras. Las
                    remisiones históricas conservan su snapshot. Si algún
                    producto no tiene alternativa activa, se bloqueará el lote
                    completo y conservarás tu selección.
                  </p>
                  <div className="mt-3 space-y-2">
                    {selected.map((id) => {
                      const row = rows.find((item) => item.id === id);
                      return (
                        <div
                          key={id}
                          className="grid gap-1 rounded-lg bg-[var(--ui-surface)] p-3 md:grid-cols-2"
                        >
                          <span>{row?.name}</span>
                          <span className="ui-caption">
                            {row?.requestPolicy
                              ? `${row.requestPolicy.label} · mínimo ${row.requestPolicy.minimum_request_qty} · paso ${row.requestPolicy.request_step_qty}`
                              : "⚠️ Sin política activa: no se incluirá"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setPreviewOpen(false)}
                      className="ui-btn ui-btn--ghost"
                    >
                      Volver al borrador
                    </button>
                    <button
                      onClick={deactivatePolicies}
                      disabled={!canApply || isPending || !selectedPolicyIds.length}
                      className="ui-btn ui-btn--brand"
                    >
                      {isPending
                        ? "Aplicando…"
                        : `Desactivar ${selectedPolicyIds.length} política(s)`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="ui-caption mt-1">
                    Solo se cambiarán estos valores nuevos. Los documentos
                    históricos no se modifican.
                  </p>
                  <div className="mt-3 space-y-2">
                    {identityChanges.map((change) => {
                      const current = rows.find(
                        (row) => row.id === change.productId,
                      );
                      const categoryName =
                        categories.find((item) => item.id === change.categoryId)
                          ?.name ?? "Sin categoría";
                      return (
                        <div
                          key={change.productId}
                          className="grid gap-1 rounded-lg bg-[var(--ui-surface)] p-3 md:grid-cols-2"
                        >
                          <span>
                            {current?.name}{" "}
                            <span className="ui-caption">
                              {current?.sku ?? "Sin SKU"}
                            </span>
                          </span>
                          <span className="ui-caption">
                            → {change.name} · {change.sku ?? "Sin SKU"} ·{" "}
                            {categoryName} ·{" "}
                            {change.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setPreviewOpen(false)}
                      className="ui-btn ui-btn--ghost"
                    >
                      Volver al borrador
                    </button>
                    <button
                      onClick={applyIdentity}
                      disabled={!canApply || isPending}
                      className="ui-btn ui-btn--brand"
                    >
                      {isPending
                        ? "Aplicando…"
                        : `Aplicar a ${identityChanges.length} producto(s)`}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
      {view === "presentation" ? (
        <section className="ui-panel overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_7rem] gap-3 border-b border-[var(--ui-border)] px-3 py-3 ui-caption">
              <span>Producto</span>
              <span>Presentación</span>
              <span>Proveedor</span>
              <span>Equivalencia</span>
              <span>Compra futura</span>
              <span></span>
            </div>
            <div className="divide-y divide-[var(--ui-border)]">
              {visiblePresentations.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_7rem] items-center gap-3 px-3 py-3"
                >
                  <div className="font-semibold">{item.productName}</div>
                  <div>
                    {item.label}
                    <div className="ui-caption">
                      {item.inputUnit ?? "Unidad no definida"}
                    </div>
                  </div>
                  <div>
                    {item.supplier ?? "Sin proveedor vinculado"}
                    <div className="ui-caption">
                      {item.isPrimary ? "Principal" : "Alterno"}
                    </div>
                  </div>
                  <div>
                    {item.stockQty ?? "—"} {item.stockUnit ?? ""}
                    <div className="ui-caption">
                      {item.isActive ? "Activa" : "Inactiva"}
                    </div>
                  </div>
                  <div>
                    {item.purchasePrice ?? "—"} {item.currency}
                    <div className="ui-caption">
                      {item.purchasePackQty ?? "—"} {item.purchaseUnit ?? ""}
                    </div>
                  </div>
                  <Link
                    href={`/inventory/catalog/${item.productId}`}
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    Detalle
                  </Link>
                </div>
              ))}
              {!visiblePresentations.length ? (
                <div className="ui-empty py-12">
                  No hay presentaciones con esos filtros.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="ui-panel overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_9rem_7rem] gap-3 border-b border-[var(--ui-border)] px-2 py-3 ui-caption">
            <span></span>
            <span>Producto</span>
            <span>Estado</span>
            <span></span>
          </div>
          <div className="divide-y divide-[var(--ui-border)]">
            {visible.map((row) => {
              const current = { ...row, ...draft[row.id] };
              const open = expanded === row.id;
              const state = status(current, zone);
              return (
                <div key={row.id}>
                  <article className="grid grid-cols-[2rem_1fr_9rem_7rem] items-center gap-3 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={() => select(row.id)}
                    />
                    <button
                      onClick={() => setExpanded(open ? null : row.id)}
                      className="min-w-0 text-left"
                    >
                      <div className="font-semibold text-[var(--ui-text)]">
                        {open ? "▼" : "▶"} {current.name}
                      </div>
                      <div className="ui-caption">
                        {zone === "requests"
                          ? `${current.hasPolicy ? "Política" : "Sin política"} · ${current.hasRoute ? "Ruta" : "Sin ruta"}`
                          : zone === "suppliers"
                            ? (current.supplier ?? "Sin proveedor")
                            : zone === "inventory"
                              ? (current.stockUnit ?? "Sin unidad")
                              : (current.category ?? "Sin categoría")}
                      </div>
                    </button>
                    <span
                      className={
                        state === "Listo"
                          ? "ui-chip ui-chip--success"
                          : state === "Parcial"
                            ? "ui-chip ui-chip--warn"
                            : "ui-chip"
                      }
                    >
                      {state}
                    </span>
                    <Link
                      href={`/inventory/catalog/${row.id}`}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      Detalle
                    </Link>
                  </article>
                  {open ? (
                    <div className="bg-[var(--ui-surface)] px-5 py-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        {zone === "identity" ? (
                          <>
                            <label>
                              <span className="ui-label">Nombre</span>
                              <input
                                className="ui-input mt-1 w-full"
                                value={current.name}
                                onChange={(event) =>
                                  updateDraft(row.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span className="ui-label">SKU</span>
                              <input
                                className="ui-input mt-1 w-full"
                                value={current.sku ?? ""}
                                onChange={(event) =>
                                  updateDraft(row.id, {
                                    sku: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span className="ui-label">Categoría</span>
                              <select
                                className="ui-input mt-1 w-full"
                                value={current.categoryId}
                                onChange={(event) =>
                                  updateDraft(row.id, {
                                    categoryId: event.target.value,
                                    category:
                                      categories.find(
                                        (item) =>
                                          item.id === event.target.value,
                                      )?.name ?? null,
                                  })
                                }
                              >
                                {categories.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span className="ui-label">Estado</span>
                              <select
                                className="ui-input mt-1 w-full"
                                value={current.isActive ? "active" : "inactive"}
                                onChange={(event) =>
                                  updateDraft(row.id, {
                                    isActive: event.target.value === "active",
                                  })
                                }
                              >
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                              </select>
                            </label>
                          </>
                        ) : (
                          <div className="md:col-span-4 ui-alert ui-alert--neutral">
                            Esta zona muestra su configuración real y se
                            habilitará para edición masiva después de validar
                            reglas históricas. Usa Detalle solo para excepciones
                            complejas.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visible.length ? (
              <div className="ui-empty py-12">
                No hay productos con esos filtros.
              </div>
            ) : null}
          </div>
        </section>
      )}
      {expandedRequest?.requestPolicy ? (
        <section className="ui-panel border-sky-200 bg-sky-50/40">
          <div className="font-semibold">
            Regla de solicitud · {expandedRequest.name}
          </div>
          <div className="ui-caption mt-1">
            {expandedRequest.requestPolicy.label} · 1{" "}
            {expandedRequest.requestPolicy.request_unit_code} ={" "}
            {expandedRequest.requestPolicy.base_qty_per_request_unit}{" "}
            {expandedRequest.requestPolicy.base_unit_code}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <label>
              <span className="ui-label">Unidad visible</span>
              <input
                className="ui-input mt-1 w-32"
                value={
                  requestDraft[expandedRequest.requestPolicy.id]?.unit ??
                  expandedRequest.requestPolicy.request_unit_code
                }
                onChange={(event) =>
                  setRequestDraft((items) => ({
                    ...items,
                    [expandedRequest.requestPolicy!.id]: {
                      ...items[expandedRequest.requestPolicy!.id],
                      minimum:
                        items[expandedRequest.requestPolicy!.id]?.minimum ??
                        String(
                          expandedRequest.requestPolicy!.minimum_request_qty,
                        ),
                      step:
                        items[expandedRequest.requestPolicy!.id]?.step ??
                        String(expandedRequest.requestPolicy!.request_step_qty),
                      unit: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label>
              <span className="ui-label">Equivalencia</span>
              <input
                type="number"
                className="ui-input mt-1 w-28"
                value={
                  requestDraft[expandedRequest.requestPolicy.id]?.equivalence ??
                  String(
                    expandedRequest.requestPolicy.base_qty_per_request_unit,
                  )
                }
                onChange={(event) =>
                  setRequestDraft((items) => ({
                    ...items,
                    [expandedRequest.requestPolicy!.id]: {
                      ...items[expandedRequest.requestPolicy!.id],
                      minimum:
                        items[expandedRequest.requestPolicy!.id]?.minimum ??
                        String(
                          expandedRequest.requestPolicy!.minimum_request_qty,
                        ),
                      step:
                        items[expandedRequest.requestPolicy!.id]?.step ??
                        String(expandedRequest.requestPolicy!.request_step_qty),
                      equivalence: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label>
              <span className="ui-label">Mínimo</span>
              <input
                type="number"
                className="ui-input mt-1 w-28"
                value={
                  requestDraft[expandedRequest.requestPolicy.id]?.minimum ??
                  String(expandedRequest.requestPolicy.minimum_request_qty)
                }
                onChange={(event) =>
                  setRequestDraft((items) => ({
                    ...items,
                    [expandedRequest.requestPolicy!.id]: {
                      ...items[expandedRequest.requestPolicy!.id],
                      minimum: event.target.value,
                      step:
                        items[expandedRequest.requestPolicy!.id]?.step ??
                        String(expandedRequest.requestPolicy!.request_step_qty),
                    },
                  }))
                }
              />
            </label>
            <label>
              <span className="ui-label">Paso</span>
              <input
                type="number"
                className="ui-input mt-1 w-28"
                value={
                  requestDraft[expandedRequest.requestPolicy.id]?.step ??
                  String(expandedRequest.requestPolicy.request_step_qty)
                }
                onChange={(event) =>
                  setRequestDraft((items) => ({
                    ...items,
                    [expandedRequest.requestPolicy!.id]: {
                      ...items[expandedRequest.requestPolicy!.id],
                      minimum:
                        items[expandedRequest.requestPolicy!.id]?.minimum ??
                        String(
                          expandedRequest.requestPolicy!.minimum_request_qty,
                        ),
                      step: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>
          <p className="ui-caption mt-3">
            El borrador permanece si falla el guardado.
          </p>
        </section>
      ) : null}
      {zone === "requests" && requestChanges.length ? (
        <section className="ui-panel border-emerald-200">
          <div className="font-semibold">Vista previa final · Solicitudes</div>
          <p className="ui-caption mt-1">
            Unidad, equivalencia, mínimo y paso se aplicarán como una sola
            versión por producto.
          </p>
          <div className="mt-3 space-y-2">
            {requestChanges.map((change) => {
              const row = rows.find(
                (item) => item.requestPolicy?.id === change.policyId,
              );
              const policy = row?.requestPolicy;
              return (
                <div
                  key={change.policyId}
                  className="rounded-lg bg-[var(--ui-surface)] p-3 ui-caption"
                >
                  <b>{row?.name}</b> · {policy?.request_unit_code}{" "}
                  {policy?.base_qty_per_request_unit} → {change.requestUnitCode}{" "}
                  {change.baseQtyPerRequestUnit} · mínimo{" "}
                  {policy?.minimum_request_qty} → {change.minimumRequestQty} ·
                  paso {policy?.request_step_qty} → {change.requestStepQty}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={applyRequests}
              disabled={!canApply || isPending}
              className="ui-btn ui-btn--brand"
            >
              {isPending
                ? "Aplicando…"
                : `Aplicar cambios de Solicitudes (${requestChanges.length})`}
            </button>
          </div>
        </section>
      ) : null}
      {view === "presentation" ? (
        <section className="ui-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="ui-caption">Compra futura · edición masiva</div>
              <h2 className="mt-1 text-lg font-semibold">
                Proveedor, empaque y precio
              </h2>
              <p className="ui-caption mt-1">
                Estos cambios solo afectan compras y entradas futuras.
              </p>
            </div>
            <span className="ui-chip">
              {selectedPresentations.length} seleccionado(s)
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[980px] divide-y divide-[var(--ui-border)]">
              {visiblePresentations.map((item) => {
                const draft = purchaseDraft[item.id] ?? {
                  price: String(item.purchasePrice ?? ""),
                  packQty: String(item.purchasePackQty ?? ""),
                  unit: item.purchaseUnit ?? "",
                  primary: item.isPrimary,
                };
                const selected = selectedPresentations.includes(item.id);
                const update = (patch: Partial<typeof draft>) =>
                  setPurchaseDraft((current) => ({
                    ...current,
                    [item.id]: { ...draft, ...patch },
                  }));
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[2rem_1.4fr_1fr_8rem_8rem_8rem] items-center gap-3 py-3"
                  >
                    <input
                      type="checkbox"
                      disabled={!item.supplierLinkId}
                      checked={selected}
                      onChange={() =>
                        setSelectedPresentations((items) =>
                          selected
                            ? items.filter((value) => value !== item.id)
                            : [...items, item.id],
                        )
                      }
                    />
                    <div>
                      <div className="font-medium">{item.productName}</div>
                      <div className="ui-caption">
                        {item.label} ·{" "}
                        {item.supplier ?? "Sin proveedor vinculado"}
                      </div>
                    </div>
                    <label>
                      <span className="ui-caption">Unidad compra</span>
                      <input
                        className="ui-input mt-1 w-full"
                        value={draft.unit}
                        onChange={(event) =>
                          update({ unit: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span className="ui-caption">Empaque</span>
                      <input
                        type="number"
                        min="0.0001"
                        className="ui-input mt-1 w-full"
                        value={draft.packQty}
                        onChange={(event) =>
                          update({ packQty: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span className="ui-caption">Precio futuro</span>
                      <input
                        type="number"
                        min="0"
                        className="ui-input mt-1 w-full"
                        value={draft.price}
                        onChange={(event) =>
                          update({ price: event.target.value })
                        }
                      />
                    </label>
                    <label className="ui-caption">
                      <input
                        type="checkbox"
                        checked={draft.primary}
                        onChange={(event) =>
                          update({ primary: event.target.checked })
                        }
                      />{" "}
                      Principal
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
          {purchaseChanges.length ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="font-semibold">Vista previa · compra futura</div>
              <p className="ui-caption mt-1">
                {purchaseChanges.length} presentación(es) cambiarán. Las compras
                históricas no se modifican.
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={applyPurchases}
                  disabled={!canApply || isPending}
                  className="ui-btn ui-btn--brand"
                >
                  {isPending
                    ? "Aplicando…"
                    : `Aplicar ${purchaseChanges.length} cambio(s) de compra`}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {zone === "sites" ? (
        <section className="ui-panel border-indigo-200">
          <div className="ui-caption">Sedes y áreas · configuración masiva</div>
          <h2 className="mt-1 text-lg font-semibold">Operación por sede</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label>
              <span className="ui-label">Sede destino</span>
              <select
                className="ui-input mt-1 w-full"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <option value="">Selecciona una sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ui-label">Mínimo</span>
              <input
                type="number"
                min="0"
                className="ui-input mt-1 w-full"
                value={siteDraft.minStockQty}
                onChange={(event) =>
                  setSiteDraft((value) => ({
                    ...value,
                    minStockQty: event.target.value,
                  }))
                }
              />
            </label>
            <div className="flex flex-wrap items-end gap-3 pb-2 ui-caption">
              <label>
                <input
                  type="checkbox"
                  checked={siteDraft.isActive}
                  onChange={(event) =>
                    setSiteDraft((value) => ({
                      ...value,
                      isActive: event.target.checked,
                    }))
                  }
                />{" "}
                Disponible
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={siteDraft.inventoryEnabled}
                  onChange={(event) =>
                    setSiteDraft((value) => ({
                      ...value,
                      inventoryEnabled: event.target.checked,
                    }))
                  }
                />{" "}
                Inventariable
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={siteDraft.remissionEnabled}
                  onChange={(event) =>
                    setSiteDraft((value) => ({
                      ...value,
                      remissionEnabled: event.target.checked,
                    }))
                  }
                />{" "}
                Remisionable
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={siteDraft.salesEnabled}
                  onChange={(event) =>
                    setSiteDraft((value) => ({
                      ...value,
                      salesEnabled: event.target.checked,
                    }))
                  }
                />{" "}
                Vendible
              </label>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--ui-surface)] p-4">
            <div className="font-semibold">
              Vista previa · {siteChanges.length} producto(s)
            </div>
            <p className="ui-caption mt-1">
              Selecciona productos de la lista superior; se aplicarán a la sede
              elegida sin alterar movimientos históricos.
            </p>
            <div className="mt-3 flex justify-end">
              <button
                onClick={applySites}
                disabled={!canApply || isPending || !siteChanges.length}
                className="ui-btn ui-btn--brand"
              >
                {isPending
                  ? "Aplicando…"
                  : `Aplicar a ${siteChanges.length} producto(s)`}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {zone === "inventory" ? (
        <section className="ui-panel border-teal-200">
          <div className="ui-caption">Inventario · configuración masiva</div>
          <h2 className="mt-1 text-lg font-semibold">
            Trazabilidad y medición
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label>
              <span className="ui-label">Tipo</span>
              <select
                className="ui-input mt-1 w-full"
                value={inventoryDraft.inventoryKind}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    inventoryKind: event.target.value,
                  }))
                }
              >
                <option value="insumo">Insumo</option>
                <option value="preparacion">Preparación</option>
                <option value="venta">Venta</option>
                <option value="asset">Activo</option>
              </select>
            </label>
            <label>
              <span className="ui-label">Modo de medición</span>
              <select
                className="ui-input mt-1 w-full"
                value={inventoryDraft.measurementMode}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    measurementMode: event.target.value,
                  }))
                }
              >
                <option value="fixed_presentation">Presentación fija</option>
                <option value="variable_weight">Peso variable</option>
                <option value="count_with_weight">Conteo con peso</option>
                <option value="bulk_volume">Volumen a granel</option>
              </select>
            </label>
            <label>
              <span className="ui-label">Tolerancia %</span>
              <input
                type="number"
                min="0"
                max="100"
                className="ui-input mt-1 w-full"
                value={inventoryDraft.defaultTolerancePercent}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    defaultTolerancePercent: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 ui-caption">
            <label>
              <input
                type="checkbox"
                checked={inventoryDraft.trackInventory}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    trackInventory: event.target.checked,
                  }))
                }
              />{" "}
              Inventariable
            </label>
            <label>
              <input
                type="checkbox"
                checked={inventoryDraft.lotTracking}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    lotTracking: event.target.checked,
                  }))
                }
              />{" "}
              Requiere lote
            </label>
            <label>
              <input
                type="checkbox"
                checked={inventoryDraft.expiryTracking}
                onChange={(event) =>
                  setInventoryDraft((value) => ({
                    ...value,
                    expiryTracking: event.target.checked,
                  }))
                }
              />{" "}
              Requiere vencimiento
            </label>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--ui-surface)] p-4">
            <div className="font-semibold">
              Vista previa · {inventoryChanges.length} producto(s)
            </div>
            <p className="ui-caption mt-1">
              La nueva regla aplica a entradas, conteos, ajustes y traslados
              futuros.
            </p>
            <div className="mt-3 flex justify-end">
              <button
                onClick={applyInventory}
                disabled={!canApply || isPending || !inventoryChanges.length}
                className="ui-btn ui-btn--brand"
              >
                {isPending
                  ? "Aplicando…"
                  : `Aplicar a ${inventoryChanges.length} producto(s)`}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {zone === "sales" ? (
        <section className="ui-panel border-indigo-200">
          <div className="ui-caption">Ventas · operación por sede</div>
          <h2 className="mt-1 text-lg font-semibold">Habilitación operativa</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label>
              <span className="ui-label">Sede</span>
              <select
                className="ui-input mt-1"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <option value="">Selecciona una sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-caption">
              <input
                type="checkbox"
                checked={siteDraft.salesEnabled}
                onChange={(event) =>
                  setSiteDraft((value) => ({
                    ...value,
                    salesEnabled: event.target.checked,
                  }))
                }
              />{" "}
              Vendible en esta sede
            </label>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--ui-surface)] p-4">
            <div className="font-semibold">
              Vista previa · {siteChanges.length} producto(s)
            </div>
            <p className="ui-caption mt-1">
              No cambia precios, menú ni canales; solo habilita operación de
              venta futura.
            </p>
            <div className="mt-3 flex justify-end">
              <button
                onClick={applySites}
                disabled={!canApply || isPending || !siteChanges.length}
                className="ui-btn ui-btn--brand"
              >
                {isPending
                  ? "Aplicando…"
                  : `Aplicar a ${siteChanges.length} producto(s)`}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {zone === "production" ? (
        <section className="ui-panel border-orange-200">
          <div className="ui-caption">Producción · configuración masiva</div>
          <h2 className="mt-1 text-lg font-semibold">
            Ruta de insumos a terminado
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label>
              <span className="ui-label">Sede</span>
              <select
                className="ui-input mt-1 w-full"
                value={productionDraft.siteId}
                onChange={(event) =>
                  setProductionDraft((value) => ({
                    ...value,
                    siteId: event.target.value,
                    inputLocationId: "",
                    outputLocationId: "",
                  }))
                }
              >
                <option value="">Selecciona sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ui-label">Área</span>
              <select
                className="ui-input mt-1 w-full"
                value={productionDraft.areaKind}
                onChange={(event) =>
                  setProductionDraft((value) => ({
                    ...value,
                    areaKind: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona área</option>
                {areas.map((area) => (
                  <option key={area.code} value={area.code}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ui-label">LOC de insumos</span>
              <select
                className="ui-input mt-1 w-full"
                value={productionDraft.inputLocationId}
                onChange={(event) =>
                  setProductionDraft((value) => ({
                    ...value,
                    inputLocationId: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona LOC</option>
                {locations
                  .filter(
                    (location) => location.siteId === productionDraft.siteId,
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="ui-label">LOC de terminado</span>
              <select
                className="ui-input mt-1 w-full"
                value={productionDraft.outputLocationId}
                onChange={(event) =>
                  setProductionDraft((value) => ({
                    ...value,
                    outputLocationId: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona LOC</option>
                {locations
                  .filter(
                    (location) => location.siteId === productionDraft.siteId,
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--ui-surface)] p-4">
            <div className="font-semibold">
              Vista previa · {productionChanges.length} producto(s)
            </div>
            <p className="ui-caption mt-1">
              Solo se crean rutas futuras. Los lotes históricos conservan sus
              ubicaciones originales.
            </p>
            <div className="mt-3 flex justify-end">
              <button
                onClick={applyProduction}
                disabled={!canApply || isPending || !productionChanges.length}
                className="ui-btn ui-btn--brand"
              >
                {isPending
                  ? "Aplicando…"
                  : `Aplicar a ${productionChanges.length} producto(s)`}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {view === "presentation" ? (
        <section className="ui-panel border-violet-200">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="ui-caption">
                Presentaciones físicas · versión futura
              </div>
              <h2 className="mt-1 text-lg font-semibold">
                Empaque y equivalencia operativa
              </h2>
              <p className="ui-caption mt-1">
                Cambia cómo se recibe, cuenta y prepara el producto. Si esa
                presentación tiene historial, se crea una versión nueva; nunca
                se reescribe el documento anterior.
              </p>
            </div>
            <span className="ui-chip">
              {physicalChanges.length} cambio(s) listo(s)
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {visiblePresentations.map((item) => {
              const draft = physicalDraft[item.id] ?? {
                label: item.label,
                inputUnit: item.inputUnit ?? "",
                stockQty: String(item.stockQty ?? ""),
              };
              const selected = selectedPresentations.includes(item.id);
              const update = (patch: Partial<typeof draft>) =>
                setPhysicalDraft((current) => ({
                  ...current,
                  [item.id]: { ...draft, ...patch },
                }));
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-xl border border-[var(--ui-border)] p-3 md:grid-cols-[2rem_1.5fr_1fr_1fr_8rem]"
                >
                  <input
                    type="checkbox"
                    className="mt-3"
                    checked={selected}
                    onChange={() =>
                      setSelectedPresentations((items) =>
                        selected
                          ? items.filter((value) => value !== item.id)
                          : [...items, item.id],
                      )
                    }
                  />
                  <div>
                    <div className="font-medium">{item.productName}</div>
                    <div className="ui-caption">
                      {item.label} · {item.isActive ? "Activa" : "Inactiva"}
                    </div>
                  </div>
                  <label>
                    <span className="ui-caption">Nombre visible</span>
                    <input
                      className="ui-input mt-1 w-full"
                      value={draft.label}
                      onChange={(event) =>
                        update({ label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="ui-caption">Unidad de entrada</span>
                    <input
                      className="ui-input mt-1 w-full"
                      value={draft.inputUnit}
                      onChange={(event) =>
                        update({ inputUnit: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="ui-caption">Equivale a</span>
                    <input
                      type="number"
                      min="0.0001"
                      className="ui-input mt-1 w-full"
                      value={draft.stockQty}
                      onChange={(event) =>
                        update({ stockQty: event.target.value })
                      }
                    />
                    <span className="ui-caption">
                      {item.stockUnit ?? "unidad base"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          {physicalChanges.length ? (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
              <div className="font-semibold">
                Vista previa · presentaciones físicas
              </div>
              <p className="ui-caption mt-1">
                Se versionarán {physicalChanges.length} presentación(es).
                Compras, conteos, entradas, producción y remisiones futuras
                usarán la nueva equivalencia.
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={applyPhysicalPresentations}
                  disabled={!canApply || isPending}
                  className="ui-btn ui-btn--brand"
                >
                  {isPending
                    ? "Aplicando…"
                    : `Versionar ${physicalChanges.length} presentación(es)`}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {batches.length ? (
        <section className="ui-panel">
          <div className="ui-caption">Trazabilidad</div>
          <h2 className="mt-1 text-lg font-semibold">Cambios recientes</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="rounded-xl bg-[var(--ui-surface)] p-3"
              >
                <div className="font-medium">
                  {zones.find((item) => item.id === batch.zone)?.label ??
                    batch.zone}
                </div>
                <div className="ui-caption">
                  {batch.productCount} producto(s) ·{" "}
                  {new Intl.DateTimeFormat("es-CO", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(batch.createdAt))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
