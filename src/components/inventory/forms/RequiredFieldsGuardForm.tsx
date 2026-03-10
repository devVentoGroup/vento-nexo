"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

type RequiredFieldsGuardFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
};

function firstMissingLabel(labels: string[]): string {
  if (labels.length === 0) return "campos obligatorios";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} y ${labels.length - 2} mas`;
}

export function RequiredFieldsGuardForm({
  action,
  className,
  children,
}: RequiredFieldsGuardFormProps) {
  const [validationError, setValidationError] = useState("");
  const alertRef = useRef<HTMLDivElement | null>(null);

  const normalizedClassName = useMemo(() => className ?? "", [className]);

  return (
    <form
      action={action}
      className={normalizedClassName}
      onSubmit={(event) => {
        setValidationError("");

        const form = event.currentTarget;
        const missing: Array<{ node: HTMLElement; label: string }> = [];
        const seenNodes = new Set<HTMLElement>();

        const requiredNativeNodes = form.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input[required],select[required],textarea[required]");

        for (const node of requiredNativeNodes) {
          if (node.disabled) continue;
          if (node instanceof HTMLInputElement && (node.type === "hidden" || node.type === "submit")) {
            continue;
          }
          const value = String(node.value ?? "").trim();
          if (!value) {
            const label = node.getAttribute("data-required-label") || node.getAttribute("name") || "campo";
            missing.push({ node, label });
            seenNodes.add(node);
          }
        }

        const customRequiredNodes = form.querySelectorAll<HTMLInputElement>(
          'input[data-required-custom="true"]'
        );
        for (const node of customRequiredNodes) {
          const value = String(node.value ?? "").trim();
          if (!value) {
            const label = node.getAttribute("data-required-label") || node.getAttribute("name") || "campo";
            missing.push({ node, label });
            seenNodes.add(node);
          }
        }

        if (missing.length === 0) return;

        event.preventDefault();
        const uniqueLabels = Array.from(new Set(missing.map((entry) => entry.label)));
        setValidationError(`Faltan datos obligatorios: ${firstMissingLabel(uniqueLabels)}.`);

        requestAnimationFrame(() => {
          alertRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          const first = missing[0]?.node;
          if (!first) return;

          if (first instanceof HTMLInputElement && first.type === "hidden") {
            const container = first.closest('[data-required-group="true"]');
            const trigger = container?.querySelector<HTMLElement>('[data-required-trigger="true"]');
            trigger?.focus();
            trigger?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }

          first.focus();
          first.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }}
    >
      {validationError ? (
        <div ref={alertRef} className="ui-alert ui-alert--error mb-4">
          {validationError}
        </div>
      ) : null}
      {children}
    </form>
  );
}
