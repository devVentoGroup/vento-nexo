import Link from "next/link";

type TabLink = {
  value: string;
  label: string;
  href: string;
  active: boolean;
};

type ToolbarAction = {
  href: string;
  label: string;
  tone: "brand" | "ghost";
};

type CatalogToolbarProps = {
  tabs: TabLink[];
  actions: ToolbarAction[];
};

export function CatalogToolbar({ tabs, actions }: CatalogToolbarProps) {
  return (
    <>
      <div className="mt-6 flex gap-1 overflow-x-auto ui-panel-soft p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.href}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab.active
                ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={`${action.label}:${action.href}`}
              href={action.href}
              className={action.tone === "brand" ? "ui-btn ui-btn--brand ui-btn--sm" : "ui-btn ui-btn--ghost ui-btn--sm"}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
