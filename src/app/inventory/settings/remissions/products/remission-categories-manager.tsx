"use client";

import { useMemo, useState } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

type Props = {
  categories: CategoryRow[];
  canManage: boolean;
  destinationSiteId: string;
  originSiteId: string;
  bulkProfile: string;
  selectedAreaKind: string;
  selectedAreaLabel: string;
  createAction: ServerAction;
  updateAction: ServerAction;
  mergeAction: ServerAction;
  archiveAction: ServerAction;
  deleteAction: ServerAction;
};

function HiddenContext({
  destinationSiteId,
  originSiteId,
  bulkProfile,
  selectedAreaKind,
}: {
  destinationSiteId: string;
  originSiteId: string;
  bulkProfile: string;
  selectedAreaKind: string;
}) {
  return (
    <>
      <input type="hidden" name="destination_site_id" value={destinationSiteId} />
      <input type="hidden" name="origin_site_id" value={originSiteId} />
      <input type="hidden" name="bulk_profile" value={bulkProfile} />
      <input type="hidden" name="area_kind" value={selectedAreaKind} />
    </>
  );
}

export function RemissionCategoriesManager({
  categories,
  canManage,
  destinationSiteId,
  originSiteId,
  bulkProfile,
  selectedAreaKind,
  selectedAreaLabel,
  createAction,
  updateAction,
  mergeAction,
  archiveAction,
  deleteAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      }),
    [categories],
  );
  const canEditCategories = canManage && Boolean(destinationSiteId && selectedAreaKind);

  return (
    <div className="mt-6 ui-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="ui-h3">Categorías de {selectedAreaLabel || "esta sede"}</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Solo ordenan la selección para el área solicitante seleccionada. No cambian la categoría del catálogo.
          </p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--brand"
          disabled={!canEditCategories}
          onClick={() => setOpen(true)}
        >
          Modificar categorías
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {sortedCategories.length ? (
          sortedCategories.map((category) => (
            <span key={category.id} className="ui-chip">
              {category.name}
            </span>
          ))
        ) : (
          <span className="text-sm text-[var(--ui-muted)]">
            Esta área todavía no tiene categorías visuales de remisión.
          </span>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8">
          <div className="w-full max-w-6xl rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4">
              <div>
                <div className="ui-h3">Configurar categorías de {selectedAreaLabel || "esta sede"}</div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  Edita nombres, fusiona categorías y archiva solo las que no tengan productos.
                </p>
              </div>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_0.75fr]">
              <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-[var(--ui-surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Categoría</th>
                      <th className="px-3 py-2 text-center">Productos</th>
                      <th className="px-3 py-2 text-center">Orden</th>
                      <th className="px-3 py-2 text-left">Fusionar en</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCategories.map((category) => {
                      const mergeTargets = sortedCategories.filter((item) => item.id !== category.id);
                      const canArchiveOrDelete = category.productCount === 0;

                      return (
                        <tr key={category.id} className="border-t border-[var(--ui-border)] align-top">
                          <td className="px-3 py-3">
                            <form action={updateAction} className="flex gap-2">
                              <HiddenContext
                                destinationSiteId={destinationSiteId}
                                originSiteId={originSiteId}
                                bulkProfile={bulkProfile}
                                selectedAreaKind={selectedAreaKind}
                              />
                              <input type="hidden" name="category_id" value={category.id} />
                              <input
                                name="category_name"
                                defaultValue={category.name}
                                className="ui-input h-9 min-w-[220px]"
                                disabled={!canEditCategories}
                              />
                              <input
                                name="sort_order"
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={category.sortOrder}
                                className="ui-input h-9 w-20"
                                disabled={!canEditCategories}
                              />
                              <button className="ui-btn ui-btn--ghost ui-btn--sm" disabled={!canEditCategories}>
                                Guardar
                              </button>
                            </form>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold">
                            {category.productCount}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {category.sortOrder}
                          </td>
                          <td className="px-3 py-3">
                            <form action={mergeAction} className="flex gap-2">
                              <HiddenContext
                                destinationSiteId={destinationSiteId}
                                originSiteId={originSiteId}
                                bulkProfile={bulkProfile}
                                selectedAreaKind={selectedAreaKind}
                              />
                              <input type="hidden" name="source_category_id" value={category.id} />
                              <input type="hidden" name="archive_source" value="true" />
                              <select
                                name="target_category_id"
                                className="ui-input h-9 min-w-[180px]"
                                disabled={!canEditCategories || mergeTargets.length === 0}
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  Selecciona destino
                                </option>
                                {mergeTargets.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    {target.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                                disabled={!canEditCategories || mergeTargets.length === 0}
                              >
                                Fusionar
                              </button>
                            </form>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <form action={archiveAction}>
                                <HiddenContext
                                  destinationSiteId={destinationSiteId}
                                  originSiteId={originSiteId}
                                  bulkProfile={bulkProfile}
                                  selectedAreaKind={selectedAreaKind}
                                />
                                <input type="hidden" name="category_id" value={category.id} />
                                <button
                                  className="ui-btn ui-btn--ghost ui-btn--sm"
                                  disabled={!canEditCategories || !canArchiveOrDelete}
                                  title={
                                    canArchiveOrDelete
                                      ? "Archivar categoría"
                                      : "Primero fusiona o mueve sus productos"
                                  }
                                >
                                  Archivar
                                </button>
                              </form>
                              <form action={deleteAction}>
                                <HiddenContext
                                  destinationSiteId={destinationSiteId}
                                  originSiteId={originSiteId}
                                  bulkProfile={bulkProfile}
                                  selectedAreaKind={selectedAreaKind}
                                />
                                <input type="hidden" name="category_id" value={category.id} />
                                <button
                                  className="ui-btn ui-btn--danger ui-btn--sm"
                                  disabled={!canEditCategories || !canArchiveOrDelete}
                                  title={
                                    canArchiveOrDelete
                                      ? "Eliminar categoría vacía"
                                      : "Primero fusiona o mueve sus productos"
                                  }
                                >
                                  Eliminar
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <form action={createAction} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <HiddenContext
                    destinationSiteId={destinationSiteId}
                    originSiteId={originSiteId}
                    bulkProfile={bulkProfile}
                    selectedAreaKind={selectedAreaKind}
                  />
                  <div className="text-sm font-semibold text-[var(--ui-text)]">Nueva categoría</div>
                  <label className="mt-3 flex flex-col gap-1">
                    <span className="ui-label">Nombre</span>
                    <input
                      name="category_name"
                      className="ui-input"
                      placeholder="Ej. Galletas"
                      disabled={!canEditCategories}
                    />
                  </label>
                  <button className="mt-3 ui-btn ui-btn--brand w-full" disabled={!canEditCategories}>
                    Crear categoría
                  </button>
                </form>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <div className="font-semibold">Regla segura</div>
                  <p className="mt-1">
                    Para eliminar una categoría con productos, primero fusiónala con otra. El sistema moverá los productos y archivará la categoría origen.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm leading-6 text-[var(--ui-muted)]">
                  <div className="font-semibold text-[var(--ui-text)]">Categorías sugeridas para Mostrador</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="ui-chip">Galletas</span>
                    <span className="ui-chip">Postres</span>
                    <span className="ui-chip">Bollería y panadería</span>
                    <span className="ui-chip">Empaques</span>
                    <span className="ui-chip">Servicio diario</span>
                    <span className="ui-chip">Aseo y consumibles</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
