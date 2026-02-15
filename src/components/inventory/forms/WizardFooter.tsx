"use client";

import type { ReactNode } from "react";

type WizardFooterProps = {
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  rightActions?: ReactNode;
  className?: string;
};

export function WizardFooter({
  canGoPrevious = false,
  canGoNext = false,
  onPrevious,
  onNext,
  previousLabel = "Anterior",
  nextLabel = "Siguiente",
  rightActions,
  className = "",
}: WizardFooterProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}>
      <div className="flex gap-2">
        {canGoPrevious && onPrevious ? (
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onPrevious}>
            {previousLabel}
          </button>
        ) : null}
        {canGoNext && onNext ? (
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onNext}>
            {nextLabel}
          </button>
        ) : null}
      </div>
      {rightActions ? <div className="flex items-center gap-2">{rightActions}</div> : null}
    </div>
  );
}

