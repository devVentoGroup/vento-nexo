export type GuidedStepStatus = "complete" | "current" | "pending" | "blocked";

export type GuidedFieldHelp = {
  meaning: string;
  when_to_use: string;
  example: string;
  impact?: string;
};

export type GuidedDependencyOperator =
  | "equals"
  | "not_equals"
  | "includes"
  | "not_includes"
  | "is_truthy"
  | "is_falsy";

export type GuidedDependencyRule = {
  depends_on: string;
  operator: GuidedDependencyOperator;
  value?: string | number | boolean | null;
  clear_on_hide?: boolean;
  neutral_value?: string;
};

export type GuidedStep = {
  id: string;
  title: string;
  objective: string;
  description?: string;
};

export const FORM_DRAFT_KEYS = [
  "inventory.category.settings",
  "inventory.catalog.new",
  "inventory.catalog.edit",
  "inventory.entries.create",
  "inventory.transfers.create",
  "inventory.withdraw.create",
  "inventory.remissions.create",
  "inventory.remissions.manage",
  "inventory.production-batches.create",
  "inventory.locations.create",
  "inventory.locations.edit",
  "inventory.settings.units",
  "inventory.settings.sites",
  "inventory.settings.supply-routes",
  "inventory.adjust",
  "inventory.count-initial",
] as const;

export type FormDraftKey = (typeof FORM_DRAFT_KEYS)[number];

export type DraftFormPayload = Record<string, unknown>;

