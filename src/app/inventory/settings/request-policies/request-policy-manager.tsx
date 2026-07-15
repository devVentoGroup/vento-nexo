"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { saveRequestConfiguration } from "./actions";

export type ManagerPresentation = {
  id: string;
  label: string;
  inputUnitCode: string;
  qtyInStockUnit: number;
  imageUrl: string;
};

export type ManagerSupplierOffer = {
  id: string;
  supplierName: string;
  supplierAlias: string;
  supplierSku: string;
  purchaseUnit: string;
  isPrimary: boolean;
  uomProfileId: string | null;
};

export type ManagerProduct = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  productType: string;
  baseUnitCode: string;
  policy: {
    id: string | null;
    label: string;
    requestUnitCode: string;
    baseQtyPerRequestUnit: number;
    minimumRequestQty: number;
    requestStepQty: number;
    allowFraction: boolean;
    presentationIds: string[];
    preferredPresentationId: string | null;
  };
  presentations: ManagerPresentation[];
  supplierOffers: ManagerSupplierOffer[];
};

type Props = { products: ManagerProduct[] };
type Zone = "request" | "presentations" | "suppliers";

type Draft = ManagerProduct["policy"] & {
  supplierLinks: Record<string, string>;
};

function makeDraft(product: ManagerProduct): Draft {
  return {
    ...product.policy,
    presentationIds: [...product.policy.presentationIds],
    supplierLinks: Object.fromEntries(
      product.supplierOffers.map((offer) => [offer.id, offer.uomProfileId ?? ""]),
    ),
  };
}

function ProductRow({ product, zone }: { product: ManagerProduct; zone: Zone }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => makeDraft(product));
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  function togglePresentation(id: string, checked: boolean) {
    setDraft((current) => {
      const ids = checked
        ? Array.from(new Set([...current.presentationIds, id]))
        : current.presentationIds.filter((value) => value !== id);
      return {
        ...current,
        presentationIds: ids,
        preferredPresentationId:
          current.preferredPresentationId === id && !checked
            ? ids[0] ?? null
            : current.preferredPresentationId,
      };
    });
  }

  function save() {
    setStatus("");
    startTransition(async () => {
      const result = await saveRequestConfiguration({
        productId: product.id,
        policyId: draft.id,
        label: draft.label,
        requestUnitCode: draft.requestUnitCode,
        baseUnitCode: product.baseUnitCode,
        baseQtyPerRequestUnit: Number(draft.baseQtyPerRequestUnit),
        minimumRequestQty: Number(draft.minimumRequestQty),
        requestStepQty: Number(draft.requestStepQty),
        allowFraction: draft.allowFraction,
        presentationIds: draft.presentationIds,
        preferredPresentationId: draft.preferredPresentationId,
        supplierOfferLinks: Object.entries(draft.supplierLinks).map(
          ([productSupplierId, uomProfileId]) => ({
            productSupplierId,
            uomProfileId: uomProfileId || null,
          }),
        ),
      });
      if (result.ok && result.policyId) {
        setDraft((current) => ({ ...current, id: result.policyId ?? current.id }));
      }
      setStatus(result.message);
    });
  }

  const incomplete =
    !draft.label || !draft.requestUnitCode || Number(draft.baseQtyPerRequestUnit) <= 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_110px_32px] items-center gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="font-semibold text-slate-900">{product.name}</div>
          <div className="text-xs text-slate-500">
            {[product.sku, product.categoryName].filter(Boolean).join(" · ") || "Sin categoría"}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{draft.label || "Sin configurar"}</div>
          <div className="text-xs text-slate-500">
            1 {draft.requestUnitCode || "-"} = {draft.baseQtyPerRequestUnit || 0} {product.baseUnitCode}
          </div>
        </div>
        <div className={incomplete ? "text-xs font-bold text-amber-700" : "text-xs font-bold text-emerald-700"}>
          {incomplete ? "PENDIENTE" : "CONFIGURADO"}
        </div>
        <div className="text-lg text-slate-500">{open ? "−" : "+"}</div>
      </button>

      {open ? (
        <div className="border-t border-slate-200 p-4">
          {zone === "request" ? (
            <div className="grid gap-3 md:grid-cols-6">
              <label className="md:col-span-2">
                <span className="ui-label">Nombre visible</span>
                <input className="ui-input mt-1" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </label>
              <label>
                <span className="ui-label">Unidad solicitud</span>
                <input className="ui-input mt-1" value={draft.requestUnitCode} onChange={(e) => setDraft({ ...draft, requestUnitCode: e.target.value })} />
              </label>
              <label>
                <span className="ui-label">Equivalencia</span>
                <input type="number" min="0.000001" step="0.001" className="ui-input mt-1" value={draft.baseQtyPerRequestUnit} onChange={(e) => setDraft({ ...draft, baseQtyPerRequestUnit: Number(e.target.value) })} />
              </label>
              <label>
                <span className="ui-label">Mínimo</span>
                <input type="number" min="0.001" step="0.001" className="ui-input mt-1" value={draft.minimumRequestQty} onChange={(e) => setDraft({ ...draft, minimumRequestQty: Number(e.target.value) })} />
              </label>
              <label>
                <span className="ui-label">Incremento</span>
                <input type="number" min="0.001" step="0.001" className="ui-input mt-1" value={draft.requestStepQty} onChange={(e) => setDraft({ ...draft, requestStepQty: Number(e.target.value) })} />
              </label>
              <label className="md:col-span-6 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <input type="checkbox" checked={draft.allowFraction} onChange={(e) => setDraft({ ...draft, allowFraction: e.target.checked })} />
                Permitir cantidades fraccionadas
              </label>
            </div>
          ) : null}

          {zone === "presentations" ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {product.presentations.length ? product.presentations.map((presentation) => {
                const selected = draft.presentationIds.includes(presentation.id);
                return (
                  <div key={presentation.id} className="rounded-xl border border-slate-200 p-3">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={selected} onChange={(e) => togglePresentation(presentation.id, e.target.checked)} />
                      <span>
                        <span className="block text-sm font-semibold">{presentation.label}</span>
                        <span className="block text-xs text-slate-500">{presentation.qtyInStockUnit} {product.baseUnitCode}</span>
                      </span>
                    </label>
                    {selected ? (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <input type="radio" name={`preferred-${product.id}`} checked={draft.preferredPresentationId === presentation.id} onChange={() => setDraft({ ...draft, preferredPresentationId: presentation.id })} />
                        Presentación preferida
                      </label>
                    ) : null}
                  </div>
                );
              }) : <div className="text-sm text-slate-500">No tiene presentaciones físicas configuradas.</div>}
            </div>
          ) : null}

          {zone === "suppliers" ? (
            <div className="space-y-2">
              {product.supplierOffers.length ? product.supplierOffers.map((offer) => (
                <div key={offer.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_1fr] md:items-center">
                  <div>
                    <div className="text-sm font-semibold">{offer.supplierName}{offer.isPrimary ? " · Principal" : ""}</div>
                    <div className="text-xs text-slate-500">{[offer.supplierAlias, offer.supplierSku, offer.purchaseUnit].filter(Boolean).join(" · ")}</div>
                  </div>
                  <select className="ui-input" value={draft.supplierLinks[offer.id] ?? ""} onChange={(e) => setDraft({ ...draft, supplierLinks: { ...draft.supplierLinks, [offer.id]: e.target.value } })}>
                    <option value="">Sin presentación vinculada</option>
                    {product.presentations.map((presentation) => <option key={presentation.id} value={presentation.id}>{presentation.label}</option>)}
                  </select>
                </div>
              )) : <div className="text-sm text-slate-500">No tiene ofertas de proveedor.</div>}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Link href={`/inventory/catalog/${product.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">Abrir ficha</Link>
            <div className="flex items-center gap-3">
              {status ? <span className={status === "Configuración guardada." ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{status}</span> : null}
              <button type="button" onClick={save} disabled={pending} className="ui-btn ui-btn--brand ui-btn--sm">
                {pending ? "Guardando..." : "Guardar producto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function RequestPolicyManager({ products }: Props) {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<Zone>("request");
  const [onlyPending, setOnlyPending] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matches = !normalized || [product.name, product.sku, product.categoryName, product.policy.label].join(" ").toLowerCase().includes(normalized);
      const pending = !product.policy.label || !product.policy.requestUnitCode || product.policy.baseQtyPerRequestUnit <= 0;
      return matches && (!onlyPending || pending);
    });
  }, [products, query, onlyPending]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="ui-input" placeholder="Buscar producto, SKU, categoría o unidad..." />
          <select value={zone} onChange={(e) => setZone(e.target.value as Zone)} className="ui-input min-w-64">
            <option value="request">Solicitudes y remisiones</option>
            <option value="presentations">Presentaciones físicas</option>
            <option value="suppliers">Proveedores y compra</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo pendientes
          </label>
        </div>
        <div className="mt-2 text-xs text-slate-500">{filtered.length} de {products.length} productos</div>
      </div>
      <div className="grid gap-3">
        {filtered.map((product) => <ProductRow key={product.id} product={product} zone={zone} />)}
      </div>
    </div>
  );
}
