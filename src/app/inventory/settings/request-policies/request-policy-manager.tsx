"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveRequestConfiguration } from "./actions";
import { saveMeasurementConfiguration } from "./measurement-actions";

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

export type ManagerMeasurement = {
  measurementMode: "fixed_presentation" | "variable_weight" | "count_with_weight" | "bulk_volume";
  tolerancePercent: number;
  auxCountUnitCode: string;
  requiresActualProductionQty: boolean;
  requiresActualDispatchQty: boolean;
  requiresActualReceiptQty: boolean;
  requiresCountAlongsideWeight: boolean;
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
    policyKind: string;
    versionNumber: number;
    usageCount: number;
    auditIssues: string[];
    presentationIds: string[];
    preferredPresentationId: string | null;
  };
  measurement: ManagerMeasurement;
  presentations: ManagerPresentation[];
  supplierOffers: ManagerSupplierOffer[];
};

type Zone = "request" | "measurement" | "presentations" | "suppliers";
type Props = { products: ManagerProduct[] };
type Draft = ManagerProduct["policy"] & { supplierLinks: Record<string, string> };

const ISSUE_LABELS: Record<string, string> = {
  missing_policy: "No tiene política de solicitud",
  missing_default: "No tiene política predeterminada",
  base_unit_mismatch: "La unidad base no coincide con inventario",
  invalid_base_policy: "La política base tiene una equivalencia inválida",
  logical_group_has_physical_profile: "Una agrupación lógica apunta a stock físico",
  physical_policy_missing_profile: "La presentación física no tiene perfil vinculado",
  physical_profile_product_mismatch: "La presentación pertenece a otro producto",
  physical_profile_inactive: "La presentación física está inactiva",
  incomplete_historical_snapshot: "Hay solicitudes históricas con snapshot incompleto",
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

function isPending(product: ManagerProduct): boolean {
  return (
    !product.policy.label ||
    !product.policy.requestUnitCode ||
    product.policy.baseQtyPerRequestUnit <= 0 ||
    product.policy.auditIssues.includes("missing_policy")
  );
}

function policyKindLabel(kind: string): string {
  if (kind === "base_unit") return "Unidad base";
  if (kind === "physical_presentation") return "Presentación física";
  if (kind === "actual_quantity") return "Cantidad real";
  return "Agrupación lógica";
}

function policyExplanation(kind: string): string {
  if (kind === "physical_presentation") {
    return "Corresponde a una presentación física real. La solicitud conserva la intención, pero el stock solo se asignará durante preparación o despacho.";
  }
  if (kind === "base_unit") {
    return "Solicita directamente en la unidad canónica de inventario.";
  }
  if (kind === "actual_quantity") {
    return "La cantidad nominal puede requerir confirmación real durante producción, despacho o recepción.";
  }
  return "Agrupación lógica: convierte la demanda a unidad base, pero no crea paquetes ni stock físico.";
}

function ProductRow({ product, zone }: { product: ManagerProduct; zone: Zone }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => makeDraft(product));
  const [measurement, setMeasurement] = useState(product.measurement);
  const [simulationQty, setSimulationQty] = useState(1);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  const simulatedBaseQty = Number.isFinite(simulationQty)
    ? simulationQty * Number(draft.baseQtyPerRequestUnit || 0)
    : 0;

  const derivedKind =
    draft.requestUnitCode === product.baseUnitCode && Number(draft.baseQtyPerRequestUnit) === 1
      ? "base_unit"
      : draft.presentationIds.length === 1
        ? "physical_presentation"
        : "logical_group";

  function togglePresentation(id: string, checked: boolean) {
    setDraft((current) => {
      const ids = checked
        ? Array.from(new Set([...current.presentationIds, id]))
        : current.presentationIds.filter((value) => value !== id);
      return {
        ...current,
        presentationIds: ids,
        preferredPresentationId:
          !checked && current.preferredPresentationId === id
            ? ids[0] ?? null
            : current.preferredPresentationId,
      };
    });
  }

  function presetPackWeight() {
    setMeasurement({
      measurementMode: "count_with_weight",
      tolerancePercent: 5,
      auxCountUnitCode: "empaques",
      requiresActualProductionQty: true,
      requiresActualDispatchQty: true,
      requiresActualReceiptQty: true,
      requiresCountAlongsideWeight: true,
    });
  }

  function save() {
    setStatus("");
    startTransition(async () => {
      if (zone === "measurement") {
        const result = await saveMeasurementConfiguration({
          productId: product.id,
          ...measurement,
        });
        setStatus(result.message);
        return;
      }

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
        changeReason: "Actualización desde configuración operativa de NEXO.",
      });

      if (result.ok && result.policyId) {
        setDraft((current) => ({
          ...current,
          id: result.policyId ?? current.id,
          policyKind: derivedKind,
          versionNumber: result.createdVersion
            ? current.versionNumber + 1
            : current.versionNumber,
        }));
      }
      setStatus(result.message);
    });
  }

  const incomplete =
    !draft.label ||
    !draft.requestUnitCode ||
    Number(draft.baseQtyPerRequestUnit) <= 0;
  const issues = draft.auditIssues.filter(Boolean);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(220px,1.4fr)_minmax(190px,1fr)_140px_32px] items-center gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="font-semibold text-slate-900">{product.name}</div>
          <div className="text-xs text-slate-500">
            {[product.sku, product.categoryName, product.productType]
              .filter(Boolean)
              .join(" · ") || "Sin categoría"}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">
            {zone === "measurement"
              ? measurement.measurementMode
              : draft.label || "Sin configurar"}
          </div>
          <div className="text-xs text-slate-500">
            {zone === "measurement"
              ? `${measurement.auxCountUnitCode || "sin conteo"} · tolerancia ${measurement.tolerancePercent}%`
              : `1 ${draft.requestUnitCode || "-"} = ${draft.baseQtyPerRequestUnit || 0} ${product.baseUnitCode}`}
          </div>
        </div>
        <div className="text-right">
          <div
            className={
              incomplete || issues.length
                ? "text-xs font-bold text-amber-700"
                : "text-xs font-bold text-emerald-700"
            }
          >
            {incomplete ? "PENDIENTE" : issues.length ? `${issues.length} ALERTA(S)` : "CONFIGURADO"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            v{draft.versionNumber} · {draft.usageCount} usos
          </div>
        </div>
        <div className="text-lg text-slate-500">{open ? "−" : "+"}</div>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-200 p-4">
          {issues.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-900">Revisión requerida</div>
              <ul className="mt-1 space-y-1 text-xs text-amber-800">
                {issues.map((issue) => (
                  <li key={issue}>• {ISSUE_LABELS[issue] ?? issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {zone === "request" ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="md:col-span-2">
                  <span className="ui-label">Nombre visible</span>
                  <input
                    className="ui-input mt-1"
                    value={draft.label}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  />
                </label>
                <label>
                  <span className="ui-label">Unidad solicitada</span>
                  <input
                    className="ui-input mt-1"
                    value={draft.requestUnitCode}
                    onChange={(event) =>
                      setDraft({ ...draft, requestUnitCode: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span className="ui-label">Equivalencia base</span>
                  <input
                    type="number"
                    min="0.000001"
                    step="0.001"
                    className="ui-input mt-1"
                    value={draft.baseQtyPerRequestUnit}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        baseQtyPerRequestUnit: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span className="ui-label">Mínimo</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    className="ui-input mt-1"
                    value={draft.minimumRequestQty}
                    onChange={(event) =>
                      setDraft({ ...draft, minimumRequestQty: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  <span className="ui-label">Incremento</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    className="ui-input mt-1"
                    value={draft.requestStepQty}
                    onChange={(event) =>
                      setDraft({ ...draft, requestStepQty: Number(event.target.value) })
                    }
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.allowFraction}
                  onChange={(event) =>
                    setDraft({ ...draft, allowFraction: event.target.checked })
                  }
                />
                Permitir cantidades fraccionadas
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Significado
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {policyKindLabel(derivedKind)}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {policyExplanation(derivedKind)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Simulador
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={draft.minimumRequestQty || 0.001}
                      step={draft.requestStepQty || 1}
                      className="ui-input w-28"
                      value={simulationQty}
                      onChange={(event) => setSimulationQty(Number(event.target.value))}
                    />
                    <span className="text-sm text-slate-600">
                      {draft.requestUnitCode || "unidad solicitada"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    = {Number(simulatedBaseQty.toFixed(6))} {product.baseUnitCode}
                  </div>
                </div>
              </div>

              {draft.usageCount > 0 ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  Esta política tiene {draft.usageCount} usos históricos. Si cambias equivalencia,
                  unidad o reglas, se creará automáticamente una nueva versión y las solicitudes
                  anteriores conservarán su significado.
                </div>
              ) : null}
            </div>
          ) : null}

          {zone === "measurement" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-600">
                  Define cómo se confirma la cantidad real en producción, despacho y recepción.
                </div>
                <button
                  type="button"
                  onClick={presetPackWeight}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  Preset: empaques + peso real
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label>
                  <span className="ui-label">Modo</span>
                  <select
                    className="ui-input mt-1"
                    value={measurement.measurementMode}
                    onChange={(event) =>
                      setMeasurement({
                        ...measurement,
                        measurementMode: event.target.value as ManagerMeasurement["measurementMode"],
                      })
                    }
                  >
                    <option value="fixed_presentation">Presentación fija</option>
                    <option value="variable_weight">Peso variable</option>
                    <option value="count_with_weight">Conteo + peso real</option>
                    <option value="bulk_volume">Volumen real</option>
                  </select>
                </label>
                <label>
                  <span className="ui-label">Unidad auxiliar</span>
                  <input
                    className="ui-input mt-1"
                    placeholder="bolsas, piezas..."
                    value={measurement.auxCountUnitCode}
                    onChange={(event) =>
                      setMeasurement({
                        ...measurement,
                        auxCountUnitCode: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span className="ui-label">Tolerancia informativa %</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="ui-input mt-1"
                    value={measurement.tolerancePercent}
                    onChange={(event) =>
                      setMeasurement({
                        ...measurement,
                        tolerancePercent: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <div className="grid gap-1 text-sm">
                  <label>
                    <input
                      type="checkbox"
                      checked={measurement.requiresActualProductionQty}
                      onChange={(event) =>
                        setMeasurement({
                          ...measurement,
                          requiresActualProductionQty: event.target.checked,
                        })
                      }
                    />{" "}
                    Cantidad real en producción
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={measurement.requiresActualDispatchQty}
                      onChange={(event) =>
                        setMeasurement({
                          ...measurement,
                          requiresActualDispatchQty: event.target.checked,
                        })
                      }
                    />{" "}
                    Cantidad real al despachar
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={measurement.requiresActualReceiptQty}
                      onChange={(event) =>
                        setMeasurement({
                          ...measurement,
                          requiresActualReceiptQty: event.target.checked,
                        })
                      }
                    />{" "}
                    Cantidad real al recibir
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={measurement.requiresCountAlongsideWeight}
                      onChange={(event) =>
                        setMeasurement({
                          ...measurement,
                          requiresCountAlongsideWeight: event.target.checked,
                        })
                      }
                    />{" "}
                    Exigir conteo auxiliar
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {zone === "presentations" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Vincula únicamente presentaciones físicas compatibles con la misma equivalencia.
                Una agrupación lógica puede existir sin seleccionar ninguna.
              </p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {product.presentations.length ? (
                  product.presentations.map((presentation) => {
                    const selected = draft.presentationIds.includes(presentation.id);
                    return (
                      <div key={presentation.id} className="rounded-xl border border-slate-200 p-3">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              togglePresentation(presentation.id, event.target.checked)
                            }
                          />
                          <span>
                            <span className="block text-sm font-semibold">{presentation.label}</span>
                            <span className="block text-xs text-slate-500">
                              {presentation.qtyInStockUnit} {product.baseUnitCode}
                            </span>
                          </span>
                        </label>
                        {selected ? (
                          <label className="mt-2 flex items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name={`preferred-${product.id}`}
                              checked={draft.preferredPresentationId === presentation.id}
                              onChange={() =>
                                setDraft({
                                  ...draft,
                                  preferredPresentationId: presentation.id,
                                })
                              }
                            />
                            Presentación preferida
                          </label>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">
                    No tiene presentaciones físicas configuradas.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {zone === "suppliers" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Las ofertas y presentaciones de compra pertenecen a ORIGO. Aquí solo se vincula
                cada oferta con su presentación física; no se convierten en agrupaciones lógicas.
              </p>
              {product.supplierOffers.length ? (
                product.supplierOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_1fr] md:items-center"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {offer.supplierName}
                        {offer.isPrimary ? " · Principal" : ""}
                      </div>
                      <div className="text-xs text-slate-500">
                        {[offer.supplierAlias, offer.supplierSku, offer.purchaseUnit]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <select
                      className="ui-input"
                      value={draft.supplierLinks[offer.id] ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          supplierLinks: {
                            ...draft.supplierLinks,
                            [offer.id]: event.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Sin presentación vinculada</option>
                      {product.presentations.map((presentation) => (
                        <option key={presentation.id} value={presentation.id}>
                          {presentation.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No tiene ofertas de proveedor.</div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Link
              href={`/inventory/catalog/${product.id}`}
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              Abrir ficha
            </Link>
            <div className="flex items-center gap-3">
              {status ? (
                <span
                  className={
                    status.includes("guardad") || status.includes("nueva versión")
                      ? "text-sm text-emerald-700"
                      : "text-sm text-rose-700"
                  }
                >
                  {status}
                </span>
              ) : null}
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="ui-btn ui-btn--brand ui-btn--sm"
              >
                {pending
                  ? "Guardando..."
                  : zone === "measurement"
                    ? "Guardar medición"
                    : "Guardar configuración"}
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
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [baseUnit, setBaseUnit] = useState("");
  const [status, setStatus] = useState("");

  const options = useMemo(
    () => ({
      types: Array.from(new Set(products.map((product) => product.productType).filter(Boolean))).sort(),
      categories: Array.from(
        new Set(products.map((product) => product.categoryName).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "es")),
      units: Array.from(
        new Set(products.map((product) => product.baseUnitCode).filter(Boolean)),
      ).sort(),
    }),
    [products],
  );

  const auditSummary = useMemo(() => {
    const pendingCount = products.filter(isPending).length;
    const warningCount = products.filter(
      (product) => product.policy.auditIssues.length > 0,
    ).length;
    const usedCount = products.filter((product) => product.policy.usageCount > 0).length;
    return { pendingCount, warningCount, usedCount };
  }, [products]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesText =
        !normalizedQuery ||
        [
          product.name,
          product.sku,
          product.categoryName,
          product.policy.label,
          product.policy.requestUnitCode,
          product.measurement.measurementMode,
          product.measurement.auxCountUnitCode,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const pending = isPending(product);
      const hasWarnings = product.policy.auditIssues.length > 0;
      const matchesStatus =
        !status ||
        (status === "pending" && pending) ||
        (status === "warnings" && hasWarnings) ||
        (status === "configured" && !pending && !hasWarnings) ||
        (status === "used" && product.policy.usageCount > 0);
      return (
        matchesText &&
        (!type || product.productType === type) &&
        (!category || product.categoryName === category) &&
        (!baseUnit || product.baseUnitCode === baseUnit) &&
        matchesStatus
      );
    });
  }, [products, query, type, category, baseUnit, status]);

  const compactControl =
    "h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Pendientes</div>
          <div className="text-xl font-semibold text-slate-900">{auditSummary.pendingCount}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">Con alertas</div>
          <div className="text-xl font-semibold text-amber-900">{auditSummary.warningCount}</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">Con historial protegido</div>
          <div className="text-xl font-semibold text-blue-900">{auditSummary.usedCount}</div>
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${compactControl} min-w-[240px] flex-[2_1_360px]`}
            placeholder="Buscar producto, SKU, categoría o unidad..."
          />
          <select
            value={zone}
            onChange={(event) => setZone(event.target.value as Zone)}
            className={`${compactControl} min-w-[190px] flex-1`}
          >
            <option value="request">Solicitud y remisiones</option>
            <option value="measurement">Medición real</option>
            <option value="presentations">Presentaciones físicas</option>
            <option value="suppliers">Proveedores y compra</option>
          </select>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={`${compactControl} min-w-[130px]`}
          >
            <option value="">Tipo</option>
            {options.types.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={`${compactControl} min-w-[165px] max-w-[230px]`}
          >
            <option value="">Categoría</option>
            {options.categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={baseUnit}
            onChange={(event) => setBaseUnit(event.target.value)}
            className={`${compactControl} min-w-[115px]`}
          >
            <option value="">Unidad base</option>
            {options.units.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={`${compactControl} min-w-[145px]`}
          >
            <option value="">Estado</option>
            <option value="configured">Configurados</option>
            <option value="pending">Pendientes</option>
            <option value="warnings">Con alertas</option>
            <option value="used">Con historial</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setType("");
              setCategory("");
              setBaseUnit("");
              setStatus("");
            }}
            className="h-9 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Limpiar
          </button>
          <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">
            {filtered.length}/{products.length}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map((product) => (
          <ProductRow key={product.id} product={product} zone={zone} />
        ))}
      </div>
    </div>
  );
}
