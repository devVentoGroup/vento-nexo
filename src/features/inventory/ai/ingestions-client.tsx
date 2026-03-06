"use client";

import { useMemo, useState } from "react";

type IngestionListRow = {
  id: string;
  flow_type: "catalog_create" | "supplier_entries";
  source_filename: string | null;
  status: string;
  created_at: string;
  error_message: string | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type LocationRow = {
  id: string;
  code: string | null;
};

type IngestionDetail = {
  ingestion: {
    id: string;
    flow_type: "catalog_create" | "supplier_entries";
    status: string;
  };
  items: Array<{
    id: string;
    line_no: number;
    raw_payload: Record<string, unknown>;
    normalized_payload: Record<string, unknown>;
    match_status: string;
    confidence: number;
    review_status: string;
  }>;
};

function formatIso(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO");
}

function inferInitialAction(params: {
  flowType: "catalog_create" | "supplier_entries";
  item: IngestionDetail["items"][number];
}) {
  if (params.item.review_status !== "needs_review") return "none";
  if (params.flowType === "supplier_entries") {
    const best = (params.item.normalized_payload?.best_match ?? null) as
      | { product_id?: string; score?: number }
      | null;
    if (best?.product_id && Number(best.score ?? 0) >= 0.75) return "create_entry";
    return "reject";
  }
  const best = (params.item.normalized_payload?.best_match ?? null) as
    | { product_id?: string; score?: number }
    | null;
  if (best?.product_id && Number(best.score ?? 0) >= 0.92) return "use_existing";
  return "create_product";
}

export function IngestionClient(props: {
  defaultFlowType: "catalog_create" | "supplier_entries";
  initialRows: IngestionListRow[];
  suppliers: SupplierRow[];
  locations: LocationRow[];
}) {
  const [flowType, setFlowType] = useState<"catalog_create" | "supplier_entries">(props.defaultFlowType);
  const [rows, setRows] = useState<IngestionListRow[]>(props.initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>(props.initialRows[0]?.id ?? "");
  const [detail, setDetail] = useState<IngestionDetail | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(props.locations[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");

  const reviewActions = useMemo(() => {
    if (!detail) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const item of detail.items) {
      map.set(item.id, inferInitialAction({ flowType: detail.ingestion.flow_type, item }));
    }
    return map;
  }, [detail]);
  const [actionOverrides, setActionOverrides] = useState<Record<string, string>>({});

  async function refreshList(nextFlowType = flowType) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/ai-ingestions?flow_type=${encodeURIComponent(nextFlowType)}`);
      const json = (await res.json()) as { data?: IngestionListRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo listar");
      setRows(json.data ?? []);
      if (!selectedId && (json.data ?? []).length > 0) setSelectedId((json.data ?? [])[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/ai-ingestions/${id}`);
      const json = (await res.json()) as IngestionDetail & { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo cargar");
      setDetail(json);
      setActionOverrides({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(formData: FormData) {
    setUploading(true);
    setError("");
    try {
      formData.set("flow_type", flowType);
      if (supplierId) formData.set("supplier_id", supplierId);
      const res = await fetch("/api/inventory/ai-ingestions", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { ingestion_id?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo procesar");
      await refreshList(flowType);
      if (json.ingestion_id) {
        setSelectedId(json.ingestion_id);
        await loadDetail(json.ingestion_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUploading(false);
    }
  }

  async function onApprove() {
    if (!detail?.ingestion?.id) return;
    const actions = detail.items
      .filter((item) => item.review_status === "needs_review")
      .map((item) => {
        const selected = actionOverrides[item.id] || reviewActions.get(item.id) || "none";
        if (selected === "none") return null;
        if (selected === "reject") return { item_id: item.id, action: "reject" };
        if (selected === "use_existing") {
          const best = (item.normalized_payload?.best_match ?? {}) as { product_id?: string };
          return { item_id: item.id, action: "use_existing", payload: { product_id: best.product_id } };
        }
        if (selected === "create_product") {
          const proposal = item.normalized_payload?.new_product_proposal ?? {};
          return { item_id: item.id, action: "create_product", payload: proposal };
        }
        if (selected === "create_entry") {
          const proposal = item.normalized_payload?.entry_proposal ?? {};
          return { item_id: item.id, action: "create_entry", payload: proposal };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (!actions.length) {
      setError("No hay acciones seleccionadas.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/ai-ingestions/${detail.ingestion.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions,
          entry_context: {
            supplier_id: supplierId || null,
            invoice_number: invoiceNumber || null,
            location_id: locationId || null,
          },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo aprobar");
      await loadDetail(detail.ingestion.id);
      await refreshList(flowType);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="ui-panel space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="ui-label">Flujo IA</span>
            <select
              className="ui-input"
              value={flowType}
              onChange={(e) => {
                const next = e.target.value === "supplier_entries" ? "supplier_entries" : "catalog_create";
                setFlowType(next);
                void refreshList(next);
              }}
            >
              <option value="catalog_create">Crear productos</option>
              <option value="supplier_entries">Entradas proveedor</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label">Proveedor (opcional)</span>
            <select className="ui-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {props.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name ?? supplier.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label">LOC (para entradas)</span>
            <select className="ui-input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Selecciona LOC</option>
              {props.locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label">Factura (opcional)</span>
            <input
              className="ui-input"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="FAC-001"
            />
          </label>
        </div>

        <form
          action={async (formData) => {
            await onUpload(formData);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input className="ui-input max-w-md" type="file" name="file" required />
          <button className="ui-btn ui-btn--brand" type="submit" disabled={uploading}>
            {uploading ? "Procesando..." : "Cargar documento con IA"}
          </button>
          <button className="ui-btn ui-btn--ghost" type="button" onClick={() => void refreshList(flowType)} disabled={loading}>
            Actualizar
          </button>
        </form>
        {error ? <div className="ui-alert ui-alert--error">{error}</div> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="ui-panel max-h-[70vh] overflow-auto">
          <div className="ui-h3 mb-2">Ingestas</div>
          <div className="space-y-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelectedId(row.id);
                  void loadDetail(row.id);
                }}
                className={`w-full rounded-xl border p-3 text-left ${
                  selectedId === row.id ? "border-[var(--ui-brand)] bg-amber-50" : "border-zinc-200"
                }`}
              >
                <div className="font-medium">{row.source_filename || "Documento sin nombre"}</div>
                <div className="ui-caption mt-1">Estado: {row.status}</div>
                <div className="ui-caption">{formatIso(row.created_at)}</div>
                {row.error_message ? <div className="ui-caption text-red-600">{row.error_message}</div> : null}
              </button>
            ))}
            {!rows.length ? <div className="ui-body-muted">No hay ingestas en este flujo.</div> : null}
          </div>
        </div>

        <div className="ui-panel">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="ui-h3">Revision</div>
            <button className="ui-btn ui-btn--brand" type="button" onClick={onApprove} disabled={loading || !detail}>
              Aprobar seleccion
            </button>
          </div>

          {!detail ? (
            <div className="ui-body-muted">Selecciona una ingesta para revisar lineas.</div>
          ) : (
            <div className="overflow-auto">
              <table className="ui-table min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4 text-left">Linea</th>
                    <th className="py-2 pr-4 text-left">Producto</th>
                    <th className="py-2 pr-4 text-left">Match</th>
                    <th className="py-2 pr-4 text-left">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => {
                    const rawName = String(item.raw_payload?.name ?? item.raw_payload?.raw_text ?? "");
                    const best = (item.normalized_payload?.best_match ?? null) as
                      | { product_id?: string; score?: number }
                      | null;
                    const defaultAction = reviewActions.get(item.id) || "none";
                    const action = actionOverrides[item.id] || defaultAction;
                    return (
                      <tr key={item.id} className="border-t border-zinc-200/60 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-mono text-xs">#{item.line_no}</div>
                          <div>{rawName}</div>
                        </td>
                        <td className="py-3 pr-4">
                          {best?.product_id ? (
                            <span className="font-mono text-xs">{best.product_id}</span>
                          ) : (
                            <span className="ui-body-muted">Sin match exacto</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div>{item.match_status}</div>
                          <div className="ui-caption">{(Number(item.confidence) * 100).toFixed(1)}%</div>
                        </td>
                        <td className="py-3 pr-4">
                          {item.review_status !== "needs_review" ? (
                            <span className="ui-chip">{item.review_status}</span>
                          ) : (
                            <select
                              className="ui-input min-w-[210px]"
                              value={action}
                              onChange={(e) =>
                                setActionOverrides((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                            >
                              <option value="none">Sin accion</option>
                              {detail.ingestion.flow_type === "catalog_create" ? (
                                <>
                                  <option value="create_product">Crear producto</option>
                                  <option value="use_existing">Usar producto existente</option>
                                  <option value="reject">Rechazar</option>
                                </>
                              ) : (
                                <>
                                  <option value="create_entry">Crear entrada</option>
                                  <option value="use_existing">Solo vincular producto</option>
                                  <option value="reject">Rechazar</option>
                                </>
                              )}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!detail.items.length ? (
                    <tr>
                      <td colSpan={4} className="py-4 ui-body-muted">
                        No hay lineas para este documento.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
