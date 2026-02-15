"use client";

import { useEffect, useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { getCategoryDomainMeaning } from "@/lib/constants";
import type { GuidedStep } from "@/lib/inventory/forms/types";
import type { CategoryKind } from "@/lib/inventory/categories";

type SiteOption = {
  id: string;
  name: string | null;
};

type ParentCategoryOption = {
  id: string;
  name: string;
  path: string;
  isRoot: boolean;
};

type DomainOption = {
  value: string;
  label: string;
};

type CategorySettingsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  saveDraftAction?: (formData: FormData) => void | Promise<void>;
  returnQs: string;
  editingCategoryId?: string;
  defaultName?: string;
  defaultSlug?: string;
  defaultParentId?: string;
  defaultKinds: CategoryKind[];
  defaultSiteId?: string;
  defaultDomain?: string;
  defaultIsActive?: boolean;
  sites: SiteOption[];
  parentOptions: ParentCategoryOption[];
  channelOptions: DomainOption[];
  initialStepId?: string;
};

const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  insumo: "Insumo",
  preparacion: "Preparacion",
  venta: "Venta",
  equipo: "Equipo",
};

const CATEGORY_KIND_ORDER: CategoryKind[] = ["insumo", "preparacion", "venta", "equipo"];

const WIZARD_STEPS: GuidedStep[] = [
  {
    id: "identidad",
    title: "Identidad",
    objective: "Define nombre, slug y categoria padre.",
  },
  {
    id: "uso",
    title: "Uso",
    objective: "Define para que tipo de items aplica la categoria.",
  },
  {
    id: "alcance",
    title: "Alcance",
    objective: "Define si la categoria es global o exclusiva de una sede.",
  },
  {
    id: "canal",
    title: "Canal",
    objective: "Configura canal solo cuando el uso incluye Venta.",
  },
  {
    id: "resumen",
    title: "Resumen",
    objective: "Valida el impacto y confirma guardado.",
  },
];

function normalizeStepId(stepId: string | null | undefined, steps: GuidedStep[]): string {
  const normalized = String(stepId ?? "").trim().toLowerCase();
  if (steps.some((step) => step.id === normalized)) return normalized;
  return steps[0]?.id ?? "";
}

function setStepInUrl(stepId: string) {
  if (typeof window === "undefined") return;
  const next = new URL(window.location.href);
  next.searchParams.set("step", stepId);
  window.history.replaceState(null, "", next.toString());
}

function StepHelp(props: {
  meaning: string;
  whenToUse: string;
  example: string;
  impact?: string;
}) {
  return (
    <div className="ui-panel-soft space-y-1 p-3">
      <div className="ui-caption">
        <strong>Que significa:</strong> {props.meaning}
      </div>
      <div className="ui-caption">
        <strong>Cuando usarlo:</strong> {props.whenToUse}
      </div>
      <div className="ui-caption">
        <strong>Ejemplo:</strong> {props.example}
      </div>
      {props.impact ? (
        <div className="ui-caption">
          <strong>Impacto:</strong> {props.impact}
        </div>
      ) : null}
    </div>
  );
}

export function CategorySettingsForm({
  action,
  saveDraftAction,
  returnQs,
  editingCategoryId = "",
  defaultName = "",
  defaultSlug = "",
  defaultParentId = "",
  defaultKinds,
  defaultSiteId = "",
  defaultDomain = "",
  defaultIsActive = true,
  sites,
  parentOptions,
  channelOptions,
  initialStepId = "",
}: CategorySettingsFormProps) {
  const initialKinds: CategoryKind[] = defaultKinds.length > 0 ? defaultKinds : ["insumo"];
  const [activeStepId, setActiveStepId] = useState<string>(
    normalizeStepId(initialStepId, WIZARD_STEPS)
  );
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug);
  const [selectedParentId, setSelectedParentId] = useState(defaultParentId);
  const [selectedKinds, setSelectedKinds] = useState<CategoryKind[]>(initialKinds);
  const [selectedSiteId, setSelectedSiteId] = useState(defaultSiteId);
  const [selectedDomain, setSelectedDomain] = useState(defaultDomain);
  const [isActive, setIsActive] = useState(defaultIsActive);

  const showChannel = selectedKinds.includes("venta");

  const wizardSteps = showChannel
    ? WIZARD_STEPS
    : WIZARD_STEPS.filter((step) => step.id !== "canal");
  const currentStepId =
    activeStepId === "canal" && !showChannel
      ? "resumen"
      : normalizeStepId(activeStepId, wizardSteps);
  const summaryStepNumber = showChannel ? 5 : 4;

  useEffect(() => {
    setStepInUrl(currentStepId);
  }, [currentStepId]);

  const selectedSiteName = useMemo(() => {
    if (!selectedSiteId) return "";
    const site = sites.find((row) => row.id === selectedSiteId);
    return site?.name ?? selectedSiteId;
  }, [selectedSiteId, sites]);

  const scopeDescription = selectedSiteId
    ? `Sede: esta categoria solo se vera en ${selectedSiteName}.`
    : "Global: esta categoria se vera en todas las sedes.";

  const rootParentOptions = parentOptions.filter((row) => row.isRoot);
  const nestedParentOptions = parentOptions.filter((row) => !row.isRoot);

  const isIdentityComplete = Boolean(name.trim());
  const isUsageComplete = selectedKinds.length > 0;
  const isScopeComplete = true;
  const isFormComplete = isIdentityComplete && isUsageComplete && isScopeComplete;

  const statusByStepId = {
    identidad:
      currentStepId === "identidad"
        ? "current"
        : isIdentityComplete
          ? "complete"
          : "pending",
    uso:
      currentStepId === "uso"
        ? "current"
        : isUsageComplete
          ? "complete"
          : "pending",
    alcance:
      currentStepId === "alcance"
        ? "current"
        : isScopeComplete
          ? "complete"
          : "pending",
    canal: currentStepId === "canal" ? "current" : "pending",
    resumen:
      currentStepId === "resumen"
        ? "current"
        : isFormComplete
          ? "complete"
          : "pending",
  } as const;

  const stepIndex = wizardSteps.findIndex((step) => step.id === currentStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= wizardSteps.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(wizardSteps.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(wizardSteps[nextIndex].id);
  };

  const toggleKind = (kind: CategoryKind) => {
    setSelectedKinds((current) => {
      const next = current.includes(kind)
        ? current.filter((value) => value !== kind)
        : [...current, kind];
      if (!next.includes("venta")) {
        setSelectedDomain("");
      }
      return next;
    });
  };

  return (
    <GuidedFormShell
      title="Formulario guiado"
      subtitle="Completa cada paso con contexto y ejemplo antes de guardar."
      steps={wizardSteps}
      currentStepId={currentStepId}
      onStepChange={setActiveStepId}
      statusByStepId={statusByStepId}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="_return_qs" value={returnQs} />
        <input type="hidden" name="_return_view" value="ficha" />
        <input type="hidden" name="_current_step" value={currentStepId} />
        <input type="hidden" name="_draft_entity_id" value={editingCategoryId} />
        {editingCategoryId ? <input type="hidden" name="id" value={editingCategoryId} /> : null}

        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="parent_id" value={selectedParentId} />
        <input type="hidden" name="site_id" value={selectedSiteId} />
        <input type="hidden" name="domain" value={showChannel ? selectedDomain : ""} />
        <input type="hidden" name="is_active" value={isActive ? "on" : ""} />
        {selectedKinds.map((kind) => (
          <input key={`kind-${kind}`} type="hidden" name="applies_to_kinds" value={kind} />
        ))}

        <section className={currentStepId === "identidad" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Identidad</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Nombre</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="ui-input"
                placeholder="Ej. Bebidas frias"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Slug</span>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="ui-input"
                placeholder="bebidas-frias"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Categoria padre</span>
              <select
                value={selectedParentId}
                onChange={(event) => setSelectedParentId(event.target.value)}
                className="ui-input"
              >
                <option value="">Sin padre (raiz)</option>
                <optgroup label="Categorias padre">
                  {rootParentOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </optgroup>
                {nestedParentOptions.length > 0 ? (
                  <optgroup label="Subcategorias (avanzado)">
                    {nestedParentOptions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.path}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </div>
          <StepHelp
            meaning="El nombre identifica la categoria y el padre define su jerarquia."
            whenToUse="Usa categoria padre cuando quieras agrupar subcategorias bajo un nodo principal."
            example="Padre: Bebidas. Hija: Bebidas frias."
            impact="Mejora busqueda, filtros y orden del catalogo."
          />
        </section>

        <section className={currentStepId === "uso" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Uso</div>
          <div className="flex flex-wrap gap-3">
            {CATEGORY_KIND_ORDER.map((kind) => (
              <label
                key={kind}
                className="flex items-center gap-2 rounded-md border border-[var(--ui-border)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selectedKinds.includes(kind)}
                  onChange={() => toggleKind(kind)}
                />
                <span className="text-sm">{CATEGORY_KIND_LABELS[kind]}</span>
              </label>
            ))}
          </div>
          <StepHelp
            meaning="Define para que tipo de item se permite usar esta categoria."
            whenToUse="Marca uno o varios usos segun el contexto operativo real."
            example="Categoria para equipos: solo Equipo. Categoria transversal: Insumo y Preparacion."
            impact="Evita que una categoria aparezca donde no corresponde."
          />
        </section>

        <section className={currentStepId === "alcance" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Alcance</div>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Alcance</span>
            <select
              value={selectedSiteId}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              className="ui-input"
            >
              <option value="">Global</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
            <span className="ui-caption">{scopeDescription}</span>
          </label>
          <StepHelp
            meaning="Alcance define visibilidad por sede."
            whenToUse="Global para categorias comunes. Sede para categorias locales o excepciones."
            example="Global: Insumos secos. Sede Saudo: Menaje de salon."
            impact="Controla que cada sede vea solo lo que aplica."
          />
        </section>

        {showChannel ? (
          <section className={currentStepId === "canal" ? "ui-panel space-y-4" : "hidden"}>
            <div className="ui-h3">Paso 4. Canal</div>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Canal de venta</span>
              <select
                value={selectedDomain}
                onChange={(event) => setSelectedDomain(event.target.value)}
                className="ui-input"
              >
                <option value="">Sin canal</option>
                {channelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ui-panel-soft space-y-1 p-3">
              <div className="ui-caption font-semibold">Que significa cada opcion</div>
              <div className="ui-caption">Sin canal: usable en cualquier flujo de venta.</div>
              {channelOptions.map((option) => (
                <div key={`channel-help-${option.value}`} className="ui-caption">
                  {option.label}: {getCategoryDomainMeaning(option.value)}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={currentStepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso {summaryStepNumber}. Resumen y validacion</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Nombre</div>
              <div className="font-semibold">{name || "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Slug</div>
              <div className="font-semibold">{slug || "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Uso</div>
              <div className="font-semibold">
                {selectedKinds.length
                  ? selectedKinds.map((kind) => CATEGORY_KIND_LABELS[kind]).join(", ")
                  : "Sin definir"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Alcance</div>
              <div className="font-semibold">{selectedSiteId ? `Sede: ${selectedSiteName}` : "Global"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Canal</div>
              <div className="font-semibold">
                {showChannel ? selectedDomain || "Sin canal" : "No aplica"}
              </div>
            </div>
            <label className="ui-panel-soft flex items-center gap-2 p-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span className="ui-label">Categoria activa</span>
            </label>
          </div>
          {!isFormComplete ? (
            <div className="ui-alert ui-alert--warn">
              Completa los campos requeridos en pasos anteriores antes de guardar.
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {!atFirstStep ? (
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => moveStep(-1)}
              >
                Anterior
              </button>
            ) : null}
            {!atLastStep ? (
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => moveStep(1)}
              >
                Siguiente
              </button>
            ) : null}
          </div>

          <div className="flex gap-2">
            {saveDraftAction ? (
              <button type="submit" formAction={saveDraftAction} className="ui-btn ui-btn--ghost">
                Guardar borrador
              </button>
            ) : null}
            <button type="submit" className="ui-btn ui-btn--brand" disabled={!isFormComplete || currentStepId !== "resumen"}>
              {editingCategoryId ? "Guardar cambios" : "Crear categoria"}
            </button>
          </div>
        </div>
      </form>
    </GuidedFormShell>
  );
}
