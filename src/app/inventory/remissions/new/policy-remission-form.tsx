"use client";

import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";

type SiteOption = { id: string; name: string };
type ProductOption = { id: string; name: string; stockUnitCode: string; categoryLabel?: string };
export type RequestPolicyOption = {
  id: string;
  productId: string;
  label: string;
  requestUnitCode: string;
  baseUnitCode: string;
  baseQtyPerRequestUnit: number;
  constraintMode: "free" | "strict_multiple" | "preferred_multiple";
  minimumRequestQty: number | null;
  requestStepQty: number | null;
  allowFraction: boolean;
  isDefault: boolean;
  policyKind: "base_unit" | "logical_group" | "physical_presentation" | "actual_quantity";
};
type AreaOption = { value: string; label: string };
type StockReference = { siteId: string; productId: string; currentQty: number; updatedAt: string | null };
type DraftRow = { id: number; productId: string; policyId: string; quantity: string; areaKind: string };
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  toSiteId: string;
  toSiteName: string;
  fromSiteOptions: SiteOption[];
  defaultFromSiteId: string;
  products: ProductOption[];
  policies: RequestPolicyOption[];
  areaOptions: AreaOption[];
  defaultAreaKind?: string;
  stockRows?: StockReference[];
  inventoryPostingEnabled?: boolean;
  requiresSharedDeviceActorSignature?: boolean;
};

const EMPTY_ROW: DraftRow = { id: 0, productId: "", policyId: "", quantity: "", areaKind: "" };

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function policyConstraintText(policy: RequestPolicyOption): string {
  const parts: string[] = [];
  if (policy.minimumRequestQty) parts.push(`mínimo ${formatQuantity(policy.minimumRequestQty)}`);
  if (policy.constraintMode === "strict_multiple" && policy.requestStepQty) parts.push(`múltiplos de ${formatQuantity(policy.requestStepQty)}`);
  if (policy.constraintMode === "preferred_multiple" && policy.requestStepQty) parts.push(`sugerido en múltiplos de ${formatQuantity(policy.requestStepQty)}`);
  if (!policy.allowFraction) parts.push("sin fracciones");
  return parts.join(" · ");
}

function validateQuantity(policy: RequestPolicyOption | null, rawQuantity: string) {
  const quantity = Number(rawQuantity);
  if (!policy || !Number.isFinite(quantity) || quantity <= 0) return { valid: false, error: "Completa producto, política y cantidad.", warning: "" };
  if (!policy.allowFraction && Math.abs(quantity - Math.trunc(quantity)) > 0.000001) return { valid: false, error: "Esta política no permite cantidades fraccionarias.", warning: "" };
  if (policy.minimumRequestQty && quantity < policy.minimumRequestQty) return { valid: false, error: `La cantidad mínima es ${formatQuantity(policy.minimumRequestQty)}.`, warning: "" };
  if (policy.constraintMode === "strict_multiple" && policy.requestStepQty) {
    const ratio = quantity / policy.requestStepQty;
    if (Math.abs(ratio - Math.round(ratio)) > 0.000001) return { valid: false, error: `Debe ser múltiplo de ${formatQuantity(policy.requestStepQty)}.`, warning: "" };
  }
  const warning = policy.constraintMode === "preferred_multiple" && policy.requestStepQty && Math.abs(quantity / policy.requestStepQty - Math.round(quantity / policy.requestStepQty)) > 0.000001 ? `Se recomienda solicitar en múltiplos de ${formatQuantity(policy.requestStepQty)}.` : "";
  return { valid: true, error: "", warning };
}

export function PolicyRemissionForm({ action, toSiteId, toSiteName, fromSiteOptions, defaultFromSiteId, products, policies, areaOptions, defaultAreaKind = "", stockRows = [], inventoryPostingEnabled = false, requiresSharedDeviceActorSignature = false }: Props) {
  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId);
  const [rows, setRows] = useState<DraftRow[]>([{ ...EMPTY_ROW, areaKind: defaultAreaKind }]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const policiesById = useMemo(() => new Map(policies.map((policy) => [policy.id, policy])), [policies]);
  const policiesByProduct = useMemo(() => {
    const map = new Map<string, RequestPolicyOption[]>();
    for (const policy of policies) map.set(policy.productId, [...(map.get(policy.productId) ?? []), policy]);
    for (const current of map.values()) current.sort((a, b) => a.isDefault !== b.isDefault ? (a.isDefault ? -1 : 1) : a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    return map;
  }, [policies]);
  const defaultPolicyByProduct = useMemo(() => {
    const map = new Map<string, RequestPolicyOption>();
    for (const [productId, current] of policiesByProduct.entries()) {
      const policy = current.find((item) => item.isDefault) ?? current[0];
      if (policy) map.set(productId, policy);
    }
    return map;
  }, [policiesByProduct]);
  const stockIndex = useMemo(() => new Map(stockRows.map((row) => [`${row.siteId}:${row.productId}`, Number(row.currentQty ?? 0)])), [stockRows]);
  const productOptions = useMemo(() => products.map((product) => ({ value: product.id, label: product.name, searchText: `${product.name} ${product.categoryLabel ?? ""}`, groupLabel: product.categoryLabel || "Productos" })), [products]);

  const evaluatedRows = rows.map((row) => {
    const policy = policiesById.get(row.policyId) ?? null;
    const validation = validateQuantity(policy, row.quantity);
    const requested = Number(row.quantity);
    const baseQty = policy && Number.isFinite(requested) && requested > 0 ? requested * policy.baseQtyPerRequestUnit : 0;
    const available = row.productId ? stockIndex.get(`${fromSiteId}:${row.productId}`) ?? 0 : 0;
    return { row, policy, validation, baseQty, available };
  });
  const completeRows = evaluatedRows.filter(({ row, validation }) => Boolean(row.productId && row.policyId) && validation.valid);
  const hasIncompleteRows = rows.some((row) => {
    const hasContent = Boolean(row.productId || row.policyId || row.quantity);
    return hasContent && (!row.productId || !row.policyId || !validateQuantity(policiesById.get(row.policyId) ?? null, row.quantity).valid);
  });
  const canSubmit = Boolean(fromSiteId && completeRows.length > 0 && !hasIncompleteRows);
  const updateRow = (id: number, patch: Partial<DraftRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const addRow = () => setRows((current) => [...current, { ...EMPTY_ROW, id: current.length ? Math.max(...current.map((row) => row.id)) + 1 : 0, areaKind: defaultAreaKind }]);
  const removeRow = (id: number) => setRows((current) => current.length === 1 ? [{ ...EMPTY_ROW, areaKind: defaultAreaKind }] : current.filter((row) => row.id !== id));

  return (
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="to_site_id" value={toSiteId} />
      <section className="ui-panel space-y-5">
        <div><div className="ui-chip ui-chip--brand">Nueva solicitud</div><h1 className="mt-3 ui-h1">Crear remisión</h1><p className="mt-2 ui-body-muted">Cada cantidad se solicita mediante una política del catálogo. Supabase valida la equivalencia y guarda una copia histórica de la regla utilizada.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="ui-label">Sede origen</span><select name="from_site_id" value={fromSiteId} onChange={(event) => setFromSiteId(event.target.value)} className="ui-input" required><option value="">Selecciona origen</option>{fromSiteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <div className="flex flex-col gap-1"><span className="ui-label">Sede destino</span><div className="ui-input flex items-center font-semibold">{toSiteName}</div></div>
          <label className="flex flex-col gap-1"><span className="ui-label">Fecha esperada</span><input type="date" name="expected_date" className="ui-input" /></label>
          <label className="flex flex-col gap-1"><span className="ui-label">Notas</span><input name="notes" className="ui-input" placeholder="Notas opcionales" /></label>
        </div>
      </section>
      {requiresSharedDeviceActorSignature ? <section className="ui-panel border-amber-200 bg-amber-50/70"><div className="ui-h3">Firma del trabajador</div><p className="mt-1 text-sm text-amber-900">Ingresa el PIN del trabajador que solicita esta remisión.</p><input name="shared_actor_pin" type="password" inputMode="numeric" autoComplete="off" className="ui-input mt-3 max-w-xs" required /></section> : null}
      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="ui-h3">Productos</div><div className="mt-1 ui-caption">Selecciona producto, agrupación operativa y cantidad.</div></div><span className="ui-chip ui-chip--success">{completeRows.length} línea(s) completa(s)</span></div>
        <div className="space-y-4">
          {evaluatedRows.map(({ row, policy, validation, baseQty, available }, index) => {
            const productPolicies = policiesByProduct.get(row.productId) ?? [];
            const product = productsById.get(row.productId) ?? null;
            const shortage = inventoryPostingEnabled && baseQty > available;
            return <article key={row.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-12 lg:items-start">
                <label className="flex min-w-0 flex-col gap-1 lg:col-span-5"><span className="ui-label">Producto</span><SearchableSingleSelect name="item_product_id" value={row.productId} onValueChange={(productId) => { const defaultPolicy = defaultPolicyByProduct.get(productId) ?? null; updateRow(row.id, { productId, policyId: defaultPolicy?.id ?? "", quantity: "" }); }} options={productOptions} placeholder="Selecciona producto" searchPlaceholder="Buscar producto..." sheetTitle="Productos" mobilePresentation="sheet" mobileBreakpointPx={1024} dropdownMode="inline" /></label>
                <label className="flex flex-col gap-1 lg:col-span-4"><span className="ui-label">Política de solicitud</span><select name="item_request_policy_id" value={row.policyId} onChange={(event) => updateRow(row.id, { policyId: event.target.value, quantity: "" })} className="ui-input" required={Boolean(row.productId)} aria-disabled={!row.productId}><option value="">Selecciona política</option>{productPolicies.map((option) => <option key={option.id} value={option.id}>{option.label}{option.isDefault ? " · predeterminada" : ""}</option>)}</select></label>
                <label className="flex flex-col gap-1 lg:col-span-3"><span className="ui-label">Cantidad{policy ? ` (${policy.requestUnitCode})` : ""}</span><input name="item_requested_policy_qty" type="number" inputMode="decimal" min="0" step={policy?.allowFraction ? "any" : "1"} value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} className="ui-input" placeholder="0" required={Boolean(row.productId)} /></label>
                <input type="hidden" name="item_area_kind" value={row.areaKind || defaultAreaKind || "general"} />
                {areaOptions.length > 1 && !defaultAreaKind ? <label className="flex flex-col gap-1 lg:col-span-4"><span className="ui-label">Área destino</span><select value={row.areaKind} onChange={(event) => updateRow(row.id, { areaKind: event.target.value })} className="ui-input">{areaOptions.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}</select></label> : null}
              </div>
              {policy ? <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"><strong>Equivalencia:</strong> 1 {policy.label} = {formatQuantity(policy.baseQtyPerRequestUnit)} {policy.baseUnitCode}.{policyConstraintText(policy) ? ` ${policyConstraintText(policy)}.` : ""}{baseQty > 0 ? <span className="ml-1 font-semibold">Esta línea equivale a {formatQuantity(baseQty)} {policy.baseUnitCode}.</span> : null}</div> : null}
              {row.productId && productPolicies.length === 0 ? <div className="ui-alert ui-alert--error mt-3">Este producto no tiene políticas activas. Configúralas en Catálogo.</div> : null}
              {row.productId && row.quantity && !validation.valid ? <div className="ui-alert ui-alert--error mt-3">{validation.error}</div> : null}
              {validation.valid && validation.warning ? <div className="ui-alert ui-alert--warn mt-3">{validation.warning}</div> : null}
              {inventoryPostingEnabled && row.productId && policy && baseQty > 0 ? <div className={`mt-3 text-xs font-semibold ${shortage ? "text-amber-800" : "text-emerald-800"}`}>Referencia en origen: {formatQuantity(available)} {policy.baseUnitCode}.{shortage ? " La solicitud supera la referencia disponible." : " Referencia suficiente."}</div> : null}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--ui-border)] pt-3"><span className="text-xs text-[var(--ui-muted)]">Línea {index + 1}{product ? ` · ${product.name}` : ""}</span><button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => removeRow(row.id)}>Quitar</button></div>
            </article>;
          })}
        </div>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={addRow}>+ Agregar producto</button>
      </section>
      {hasIncompleteRows ? <div className="ui-alert ui-alert--warn">Revisa las líneas incompletas o las cantidades que no cumplen su política.</div> : null}
      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-[var(--ui-muted)]">{completeRows.length} producto(s) · destino {toSiteName}</div><button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>Crear remisión</button></div>
    </form>
  );
}
