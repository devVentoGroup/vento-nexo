"use client";

import { useState } from "react";

type MaintenanceLine = {
  id?: string;
  scheduled_date?: string;
  performed_date?: string;
  responsible?: string;
  maintenance_provider?: string;
  work_done?: string;
  parts_replaced?: boolean;
  replaced_parts?: string;
  planner_bucket?: string;
  _delete?: boolean;
};

type TransferLine = {
  id?: string;
  moved_at?: string;
  from_location?: string;
  to_location?: string;
  responsible?: string;
  notes?: string;
  _delete?: boolean;
};

type Props = {
  initialProfile: {
    brand?: string | null;
    model?: string | null;
    serial_number?: string | null;
    physical_location?: string | null;
    purchase_invoice_url?: string | null;
    commercial_value?: number | null;
    purchase_date?: string | null;
    started_use_date?: string | null;
    equipment_status?: string | null;
    maintenance_service_provider?: string | null;
    technical_description?: string | null;
  } | null;
  initialMaintenance: MaintenanceLine[];
  initialTransfers: TransferLine[];
};

const EMPTY_MAINTENANCE: MaintenanceLine = {
  scheduled_date: "",
  performed_date: "",
  responsible: "",
  maintenance_provider: "",
  work_done: "",
  parts_replaced: false,
  replaced_parts: "",
  planner_bucket: "mensual",
};

const EMPTY_TRANSFER: TransferLine = {
  moved_at: "",
  from_location: "",
  to_location: "",
  responsible: "",
  notes: "",
};

export function ProductAssetTechnicalSection({
  initialProfile,
  initialMaintenance,
  initialTransfers,
}: Props) {
  const [maintenanceLines, setMaintenanceLines] = useState<MaintenanceLine[]>(
    initialMaintenance.length ? initialMaintenance : []
  );
  const [transferLines, setTransferLines] = useState<TransferLine[]>(
    initialTransfers.length ? initialTransfers : []
  );

  const visibleMaintenance = maintenanceLines.filter((line) => !line._delete);
  const visibleTransfers = transferLines.filter((line) => !line._delete);

  return (
    <section className="ui-panel space-y-5">
      <h2 className="ui-h2">Ficha técnica de equipo / activo</h2>
      <p className="ui-body-muted">
        Control industrial del activo: identidad técnica, mantenimiento y traslados.
      </p>

      <input type="hidden" name="asset_profile_enabled" value="1" />
      <input type="hidden" name="asset_maintenance_lines" value={JSON.stringify(maintenanceLines)} />
      <input type="hidden" name="asset_transfer_lines" value={JSON.stringify(transferLines)} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Marca</span>
          <input
            name="asset_brand"
            defaultValue={initialProfile?.brand ?? ""}
            className="ui-input"
            placeholder="Ej. Rational, Hobart, Torrey"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Modelo</span>
          <input name="asset_model" defaultValue={initialProfile?.model ?? ""} className="ui-input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Serial</span>
          <input
            name="asset_serial_number"
            defaultValue={initialProfile?.serial_number ?? ""}
            className="ui-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Ubicación física</span>
          <input
            name="asset_physical_location"
            defaultValue={initialProfile?.physical_location ?? ""}
            className="ui-input"
            placeholder="Ej. Cocina caliente · Línea 2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Factura de compra (URL)</span>
          <input
            name="asset_purchase_invoice_url"
            type="url"
            defaultValue={initialProfile?.purchase_invoice_url ?? ""}
            className="ui-input"
            placeholder="https://..."
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Valor comercial</span>
          <input
            name="asset_commercial_value"
            type="number"
            step="0.01"
            defaultValue={initialProfile?.commercial_value ?? ""}
            className="ui-input"
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Fecha de compra</span>
          <input
            name="asset_purchase_date"
            type="date"
            defaultValue={initialProfile?.purchase_date ?? ""}
            className="ui-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Fecha inicio de uso</span>
          <input
            name="asset_started_use_date"
            type="date"
            defaultValue={initialProfile?.started_use_date ?? ""}
            className="ui-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Estado del equipo</span>
          <select name="asset_equipment_status" defaultValue={initialProfile?.equipment_status ?? "operativo"} className="ui-input">
            <option value="operativo">Operativo</option>
            <option value="en_mantenimiento">En mantenimiento</option>
            <option value="fuera_servicio">Fuera de servicio</option>
            <option value="baja">De baja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Proveedor de mantenimiento</span>
          <input
            name="asset_maintenance_service_provider"
            defaultValue={initialProfile?.maintenance_service_provider ?? ""}
            className="ui-input"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Descripción técnica</span>
        <textarea
          name="asset_technical_description"
          defaultValue={initialProfile?.technical_description ?? ""}
          className="ui-input min-h-0 py-2"
          rows={3}
          placeholder="Capacidad, potencia, observaciones y uso operativo."
        />
      </label>

      <div className="space-y-3 rounded-xl border border-[var(--ui-border)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--ui-text)]">Historial de mantenimiento</h3>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => setMaintenanceLines((prev) => [...prev, { ...EMPTY_MAINTENANCE }])}
          >
            + Agregar evento
          </button>
        </div>
        <div className="space-y-2">
          {visibleMaintenance.length === 0 ? (
            <div className="ui-empty">Sin eventos de mantenimiento.</div>
          ) : (
            visibleMaintenance.map((line, idx) => {
              const index = maintenanceLines.findIndex((entry) => entry === line);
              return (
                <div key={line.id ?? `maintenance-${idx}`} className="rounded-lg border border-[var(--ui-border)] p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Programado</span>
                      <input
                        type="date"
                        value={line.scheduled_date ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, scheduled_date: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Realizado</span>
                      <input
                        type="date"
                        value={line.performed_date ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, performed_date: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Responsable</span>
                      <input
                        value={line.responsible ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, responsible: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Planeador</span>
                      <select
                        value={line.planner_bucket ?? "mensual"}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, planner_bucket: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      >
                        <option value="correctivo">Correctivo</option>
                        <option value="semanal">Semanal</option>
                        <option value="mensual">Mensual</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <label className="flex flex-col gap-1 md:col-span-1">
                      <span className="ui-caption">Proveedor servicio</span>
                      <input
                        value={line.maintenance_provider ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, maintenance_provider: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="ui-caption">Trabajo realizado</span>
                      <input
                        value={line.work_done ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, work_done: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(line.parts_replaced)}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, parts_replaced: event.target.checked } : row
                            )
                          )
                        }
                      />
                      <span className="ui-caption">Reemplazo de piezas</span>
                    </label>
                    <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                      <span className="ui-caption">Piezas reemplazadas</span>
                      <input
                        value={line.replaced_parts ?? ""}
                        onChange={(event) =>
                          setMaintenanceLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, replaced_parts: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                        placeholder="Ej. Termostato, válvula, sello"
                      />
                    </label>
                    <button
                      type="button"
                      className="ui-btn ui-btn--danger ui-btn--sm"
                      onClick={() =>
                        setMaintenanceLines((prev) =>
                          prev.map((row, rowIdx) =>
                            rowIdx === index ? { ...row, _delete: true } : row
                          )
                        )
                      }
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--ui-border)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--ui-text)]">Traslados del equipo</h3>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => setTransferLines((prev) => [...prev, { ...EMPTY_TRANSFER }])}
          >
            + Agregar traslado
          </button>
        </div>
        <div className="space-y-2">
          {visibleTransfers.length === 0 ? (
            <div className="ui-empty">Sin traslados registrados.</div>
          ) : (
            visibleTransfers.map((line, idx) => {
              const index = transferLines.findIndex((entry) => entry === line);
              return (
                <div key={line.id ?? `transfer-${idx}`} className="rounded-lg border border-[var(--ui-border)] p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Fecha</span>
                      <input
                        type="date"
                        value={line.moved_at ?? ""}
                        onChange={(event) =>
                          setTransferLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, moved_at: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Desde</span>
                      <input
                        value={line.from_location ?? ""}
                        onChange={(event) =>
                          setTransferLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, from_location: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Hacia</span>
                      <input
                        value={line.to_location ?? ""}
                        onChange={(event) =>
                          setTransferLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, to_location: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Responsable</span>
                      <input
                        value={line.responsible ?? ""}
                        onChange={(event) =>
                          setTransferLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, responsible: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="ui-caption">Nota</span>
                      <input
                        value={line.notes ?? ""}
                        onChange={(event) =>
                          setTransferLines((prev) =>
                            prev.map((row, rowIdx) =>
                              rowIdx === index ? { ...row, notes: event.target.value } : row
                            )
                          )
                        }
                        className="ui-input"
                      />
                    </label>
                    <button
                      type="button"
                      className="ui-btn ui-btn--danger ui-btn--sm"
                      onClick={() =>
                        setTransferLines((prev) =>
                          prev.map((row, rowIdx) =>
                            rowIdx === index ? { ...row, _delete: true } : row
                          )
                        )
                      }
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

