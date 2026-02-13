"use client";

import type { ReactNode } from "react";

import type { GuidedStep, GuidedStepStatus } from "@/lib/inventory/forms/types";

type GuidedFormShellProps = {
  title?: string;
  subtitle?: string;
  steps: GuidedStep[];
  currentStepId: string;
  onStepChange: (stepId: string) => void;
  statusByStepId?: Record<string, GuidedStepStatus>;
  allowStepJump?: boolean;
  children: ReactNode;
  className?: string;
};

function statusClass(status: GuidedStepStatus): string {
  if (status === "complete") return "border-[var(--ui-success)] bg-[var(--ui-success)]/10 text-[var(--ui-success)]";
  if (status === "current") return "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10 text-[var(--ui-brand)]";
  if (status === "blocked") return "border-[var(--ui-border)] bg-zinc-100 text-[var(--ui-muted)]";
  return "border-[var(--ui-border)] bg-white text-[var(--ui-muted)]";
}

function getDefaultStatus(stepIndex: number, currentIndex: number): GuidedStepStatus {
  if (stepIndex === currentIndex) return "current";
  if (stepIndex < currentIndex) return "complete";
  return "pending";
}

export function GuidedFormShell({
  title,
  subtitle,
  steps,
  currentStepId,
  onStepChange,
  statusByStepId,
  allowStepJump = true,
  children,
  className = "",
}: GuidedFormShellProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId)
  );
  const progress = steps.length > 1 ? ((currentIndex + 1) / steps.length) * 100 : 100;
  const currentStep = steps[currentIndex] ?? null;

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {title ? (
        <div>
          <div className="ui-h3">{title}</div>
          {subtitle ? <div className="ui-caption mt-1">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="ui-panel-soft space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="ui-caption">
            Paso {currentIndex + 1} de {steps.length}
          </div>
          <div className="ui-caption">{Math.round(progress)}%</div>
        </div>
        <div className="h-2 rounded-full bg-zinc-200">
          <div
            className="h-2 rounded-full bg-[var(--ui-brand)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const status = statusByStepId?.[step.id] ?? getDefaultStatus(index, currentIndex);
            const isBlocked = status === "blocked";
            const canClick = allowStepJump && !isBlocked;

            return (
              <button
                key={step.id}
                type="button"
                aria-current={status === "current" ? "step" : undefined}
                disabled={!canClick}
                onClick={() => onStepChange(step.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${statusClass(status)} ${canClick ? "hover:border-[var(--ui-brand)]" : "cursor-not-allowed opacity-70"}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Paso {index + 1}
                </div>
                <div className="text-sm font-semibold">{step.title}</div>
              </button>
            );
          })}
        </div>
        {currentStep ? (
          <div className="rounded-lg border border-[var(--ui-border)] bg-white p-3">
            <div className="text-sm font-semibold">{currentStep.title}</div>
            <div className="ui-caption mt-1">{currentStep.objective}</div>
            {currentStep.description ? (
              <div className="ui-caption mt-1">{currentStep.description}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}

