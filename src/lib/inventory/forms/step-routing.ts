import type { GuidedStep } from "@/lib/inventory/forms/types";

type SearchValue = string | string[] | undefined;

function normalizeSearchValue(value: SearchValue): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export function normalizeGuidedStepId(params: {
  stepId?: string | null;
  steps: GuidedStep[];
  fallbackStepId?: string;
}): string {
  const stepId = String(params.stepId ?? "").trim();
  const allowed = new Set(params.steps.map((step) => step.id));
  if (stepId && allowed.has(stepId)) return stepId;

  if (params.fallbackStepId && allowed.has(params.fallbackStepId)) {
    return params.fallbackStepId;
  }

  return params.steps[0]?.id ?? "";
}

export function getStepFromSearchRecord(
  searchParams: Record<string, SearchValue> | undefined,
  key = "step"
): string {
  if (!searchParams) return "";
  return normalizeSearchValue(searchParams[key]);
}

export function setGuidedStepQuery(params: URLSearchParams, stepId: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (stepId) next.set("step", stepId);
  else next.delete("step");
  return next;
}

export function buildGuidedStepHref(params: URLSearchParams, stepId: string): string {
  const next = setGuidedStepQuery(params, stepId);
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function getGuidedStepIndex(steps: GuidedStep[], stepId: string): number {
  const idx = steps.findIndex((step) => step.id === stepId);
  return idx >= 0 ? idx : 0;
}

