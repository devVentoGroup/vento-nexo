import type { ReactNode } from "react";

type CatalogSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
};

type CatalogHintPanelProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

type CatalogOptionalDetailsProps = {
  title: string;
  summary?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

type CatalogCategoryContextFormProps = {
  hiddenFields?: Array<{ name: string; value: string }>;
  categoryScope: string;
  categorySiteId: string;
  categoryDomain: string;
  showDomain?: boolean;
  categoryDomainOptions: Array<{ value: string; label: string }>;
  sites: Array<{ id: string; name: string | null }>;
  submitLabel?: string;
};

export function CatalogSection({
  title,
  description,
  children,
  className = "",
}: CatalogSectionProps) {
  return (
    <section className={`ui-panel ui-remission-section space-y-6 ${className}`.trim()}>
      <div className="flex items-start gap-3 border-b border-[var(--ui-border)] pb-3">
        <span
          aria-hidden="true"
          className="mt-1 flex h-3 w-3 shrink-0 rounded-full bg-[var(--ui-brand)]"
        />
        <div>
          <h2 className="ui-h3">{title}</h2>
          <p className="text-sm text-[var(--ui-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function CatalogHintPanel({
  title,
  children,
  className = "",
}: CatalogHintPanelProps) {
  return (
    <div className={`ui-panel ui-remission-section p-4 text-sm text-[var(--ui-muted)] space-y-2 ${className}`.trim()}>
      <p className="font-semibold text-[var(--ui-text)]">{title}</p>
      {children}
    </div>
  );
}

export function CatalogOptionalDetails({
  title,
  summary,
  badge = "Opcional",
  children,
  className = "",
  defaultOpen = false,
}: CatalogOptionalDetailsProps) {
  return (
    <details
      open={defaultOpen}
      className={`ui-panel ui-remission-section space-y-4 ${className}`.trim()}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="ui-h3">{title}</h2>
          {summary ? <p className="text-sm text-[var(--ui-muted)]">{summary}</p> : null}
        </div>
        <span className="ui-chip shrink-0">{badge}</span>
      </summary>
      <div className="space-y-4">{children}</div>
    </details>
  );
}

export function CatalogCategoryContextForm({
  hiddenFields = [],
  categoryScope,
  categorySiteId,
  categoryDomain,
  showDomain = false,
  categoryDomainOptions,
  sites,
  submitLabel = "Actualizar categorias",
}: CatalogCategoryContextFormProps) {
  return (
    <form method="get" className="ui-panel ui-remission-section grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {hiddenFields.map((field) => (
        <input key={`${field.name}:${field.value}`} type="hidden" name={field.name} value={field.value} />
      ))}

      <div className="sm:col-span-2 lg:col-span-4 ui-caption">
        Ajusta solo el arbol operativo visible en esta pantalla.
      </div>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Alcance de categoria operativa</span>
        <select name="category_scope" defaultValue={categoryScope} className="ui-input">
          <option value="all">Todas</option>
          <option value="global">Globales</option>
          <option value="site">Sede activa</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Sede para categoria operativa</span>
        <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
          <option value="">Seleccionar sede</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name ?? site.id}
            </option>
          ))}
        </select>
      </label>

      {showDomain ? (
        <label className="flex flex-col gap-1">
          <span className="ui-label">Dominio operativo</span>
          <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
            <option value="">Todos</option>
            {categoryDomainOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex items-end">
        <button className="ui-btn ui-btn--ghost">{submitLabel}</button>
      </div>
    </form>
  );
}
