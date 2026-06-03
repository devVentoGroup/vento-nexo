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
    maintenance_cycle_enabled?: boolean | null;
    maintenance_cycle_months?: number | null;
    maintenance_cycle_anchor_date?: string | null;
  } | null;
  initialMaintenance: MaintenanceLine[];
  initialTransfers: TransferLine[];
  defaultTemplate?: "industrial" | "general";
  siteOptions?: Array<{ id: string; name: string }>;
};

function hiddenValue(value: string | number | boolean | null | undefined) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "";
  return String(value);
}

export function ProductAssetTechnicalSection({
  initialProfile,
  initialMaintenance,
  initialTransfers,
  defaultTemplate = "general",
}: Props) {
  const [profileTemplate, setProfileTemplate] = useState<"industrial" | "general">(defaultTemplate);

  const hasLegacyOperationalData = Boolean(
    initialProfile?.serial_number ||
      initialProfile?.physical_location ||
      initialProfile?.purchase_invoice_url ||
      initialProfile?.commercial_value ||
      initialProfile?.purchase_date ||
      initialProfile?.started_use_date ||
      initialProfile?.equipment_status ||
      initialMaintenance.length > 0 ||
      initialTransfers.length > 0
  );

  return (
    <section className="ui-panel space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="ui-h2">Ficha base del modelo de activo</h2>
          <p className="mt-2 ui-body-muted">
            Define solo la información técnica que aplica al modelo del equipo, mobiliario o activo.
          </p>
        </div>
        <a href="/inventory/assets" className="ui-btn ui-btn--ghost ui-btn--sm">
          Abrir Activos físicos
        </a>
      </div>

      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
        <div className="font-black">Esta sección no controla unidades físicas reales</div>
        <p className="mt-1 leading-6">
          Serial, placa interna, ubicación, responsable, QR, estado real, movimientos, conteos y mantenimientos
          reales se gestionan en <strong>Activos físicos</strong>. Aquí solo se guarda la referencia base del catálogo.
        </p>
      </div>

      {hasLegacyOperationalData ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-black">Datos operativos antiguos protegidos</div>
          <p className="mt-1 leading-6">
            Este modelo todavía tiene datos viejos de operación guardados en el catálogo. No se muestran para evitar
            confusión, pero se envían ocultos al guardar para no borrarlos accidentalmente.
          </p>
        </div>
      ) : null}

      <input type="hidden" name="asset_profile_enabled" value="1" />
      <input type="hidden" name="asset_profile_template" value={profileTemplate} />

      {/* Datos operativos legados: se conservan para no borrar información existente al guardar. */}
      <input type="hidden" name="asset_serial_number" value={hiddenValue(initialProfile?.serial_number)} />
      <input type="hidden" name="asset_physical_location" value={hiddenValue(initialProfile?.physical_location)} />
      <input type="hidden" name="asset_purchase_invoice_url" value={hiddenValue(initialProfile?.purchase_invoice_url)} />
      <input type="hidden" name="asset_commercial_value" value={hiddenValue(initialProfile?.commercial_value)} />
      <input type="hidden" name="asset_purchase_date" value={hiddenValue(initialProfile?.purchase_date)} />
      <input type="hidden" name="asset_started_use_date" value={hiddenValue(initialProfile?.started_use_date)} />
      <input type="hidden" name="asset_equipment_status" value={hiddenValue(initialProfile?.equipment_status || "operativo")} />
      <input type="hidden" name="asset_maintenance_lines" value={JSON.stringify(initialMaintenance)} />
      <input type="hidden" name="asset_transfer_lines" value={JSON.stringify(initialTransfers)} />

      <label className="flex flex-col gap-1">
        <span className="ui-label">Tipo de modelo</span>
        <select
          value={profileTemplate}
          onChange={(event) =>
            setProfileTemplate(event.target.value === "industrial" ? "industrial" : "general")
          }
          className="ui-input"
        >
          <option value="general">Activo general / mobiliario / menaje</option>
          <option value="industrial">Equipo técnico o industrial</option>
        </select>
        <span className="text-xs text-[var(--ui-muted)]">
          Usa “equipo técnico o industrial” cuando el modelo requiere proveedor o frecuencia sugerida de mantenimiento.
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Marca base</span>
          <input
            name="asset_brand"
            defaultValue={initialProfile?.brand ?? ""}
            className="ui-input"
            placeholder="Ej. Rational, Hobart, Torrey, McQuay"
          />
          <span className="text-xs text-[var(--ui-muted)]">
            Marca general del modelo. No identifica una unidad física específica.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Modelo / referencia base</span>
          <input
            name="asset_model"
            defaultValue={initialProfile?.model ?? ""}
            className="ui-input"
            placeholder="Ej. SCC 61, Mcc104060ccu236a"
          />
          <span className="text-xs text-[var(--ui-muted)]">
            Referencia técnica del modelo. El serial de cada unidad va en Activos físicos.
          </span>
        </label>

        {profileTemplate === "industrial" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Proveedor de mantenimiento sugerido</span>
              <input
                name="asset_maintenance_service_provider"
                defaultValue={initialProfile?.maintenance_service_provider ?? ""}
                className="ui-input"
                placeholder="Ej. proveedor recomendado para este tipo de equipo"
              />
              <span className="text-xs text-[var(--ui-muted)]">
                Referencia del modelo; el proveedor real usado se registra en el mantenimiento del activo físico.
              </span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <input
                type="checkbox"
                name="asset_maintenance_cycle_enabled"
                defaultChecked={Boolean(initialProfile?.maintenance_cycle_enabled)}
              />
              <span className="text-sm text-[var(--ui-text)]">
                Recomendar mantenimiento recurrente para este modelo
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Frecuencia sugerida en meses</span>
              <input
                name="asset_maintenance_cycle_months"
                type="number"
                min={1}
                max={60}
                defaultValue={initialProfile?.maintenance_cycle_months ?? ""}
                className="ui-input"
                placeholder="Ej. 3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha base sugerida</span>
              <input
                name="asset_maintenance_cycle_anchor_date"
                type="date"
                defaultValue={initialProfile?.maintenance_cycle_anchor_date ?? ""}
                className="ui-input"
              />
              <span className="text-xs text-[var(--ui-muted)]">
                Es solo una referencia del modelo. La programación real queda en la ficha del activo físico.
              </span>
            </label>
          </>
        ) : (
          <>
            <input
              type="hidden"
              name="asset_maintenance_service_provider"
              value={hiddenValue(initialProfile?.maintenance_service_provider)}
            />
            <input
              type="hidden"
              name="asset_maintenance_cycle_months"
              value={hiddenValue(initialProfile?.maintenance_cycle_months)}
            />
            <input
              type="hidden"
              name="asset_maintenance_cycle_anchor_date"
              value={hiddenValue(initialProfile?.maintenance_cycle_anchor_date)}
            />
          </>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Descripción técnica base</span>
        <textarea
          name="asset_technical_description"
          defaultValue={initialProfile?.technical_description ?? ""}
          className="ui-input min-h-0 py-2"
          rows={4}
          placeholder="Capacidad, potencia, dimensiones, uso recomendado, compatibilidades, observaciones generales del modelo."
        />
        <span className="text-xs text-[var(--ui-muted)]">
          Esta descripción debe servir como referencia para cualquier unidad física creada desde este modelo.
        </span>
      </label>

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 text-sm text-[var(--ui-muted)]">
        <div className="font-semibold text-[var(--ui-text)]">Qué NO va aquí</div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-white/70 p-3">
            Serial, placa y QR de una unidad.
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-white/70 p-3">
            Sede, área, LOC, ubicación interna y responsable.
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-white/70 p-3">
            Historial real de mantenimiento, traslados y conteos.
          </div>
        </div>
      </div>
    </section>
  );
}
