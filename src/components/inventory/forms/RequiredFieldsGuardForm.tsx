"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type RequiredFieldsGuardFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
  persistKey?: string;
};

type ServerErrorHint = {
  fieldName?: string;
  message: string;
};

function normalizeErrorText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferServerErrorHint(rawMessage: string): ServerErrorHint {
  const normalized = normalizeErrorText(rawMessage);

  if (normalized.includes("nombre")) {
    return { fieldName: "name", message: rawMessage };
  }
  if (normalized.includes("categoria")) {
    return { fieldName: "category_id", message: rawMessage };
  }
  if (normalized.includes("sku")) {
    return { fieldName: "sku", message: rawMessage };
  }
  if (normalized.includes("unidad base")) {
    return { fieldName: "stock_unit_code", message: rawMessage };
  }
  if (
    normalized.includes("proveedor") ||
    normalized.includes("unidad de compra") ||
    normalized.includes("bloque de proveedores")
  ) {
    return { fieldName: "supplier_lines__client_validation", message: rawMessage };
  }
  if (
    normalized.includes("disponibilidad por sede") ||
    normalized.includes("seleccionar una sede")
  ) {
    return { fieldName: "site_settings_lines", message: rawMessage };
  }

  return { message: rawMessage };
}

export function RequiredFieldsGuardForm({
  action,
  className,
  children,
  persistKey,
}: RequiredFieldsGuardFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const errorToken = searchParams.get("error") ?? "";

  const normalizedClassName = useMemo(() => className ?? "", [className]);
  const storageKey = useMemo(() => {
    if (persistKey?.trim()) return `nexo:form-draft:${persistKey.trim()}`;
    return `nexo:form-draft:${pathname || "unknown"}`;
  }, [pathname, persistKey]);

  const restoreDraft = () => {
    const form = formRef.current;
    if (!form || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return;
    let snapshot: Record<string, unknown> | null = null;
    try {
      snapshot = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      snapshot = null;
    }
    if (!snapshot) return;
    const nodes = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[name],select[name],textarea[name]"
    );
    for (const node of nodes) {
      const name = node.name;
      if (!name) continue;
      if (!(name in snapshot)) continue;
      const saved = snapshot[name];
      if (node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")) {
        if (Array.isArray(saved)) {
          node.checked = saved.includes(node.value);
        } else {
          node.checked = Boolean(saved);
        }
      } else if (saved != null) {
        node.value = String(saved);
      } else {
        node.value = "";
      }
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const persistDraft = () => {
    const form = formRef.current;
    if (!form || typeof window === "undefined") return;
    const fd = new FormData(form);
    const snapshot: Record<string, unknown> = {};
    for (const [name, value] of fd.entries()) {
      if (value instanceof File) continue;
      if (name in snapshot) {
        const current = snapshot[name];
        if (Array.isArray(current)) {
          current.push(value);
          snapshot[name] = current;
        } else {
          snapshot[name] = [current, value];
        }
        continue;
      }
      snapshot[name] = value;
    }
    const checkboxes = form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]');
    for (const node of checkboxes) {
      if (!node.checked && !(node.name in snapshot)) {
        snapshot[node.name] = false;
      }
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  };

  const clearInlineErrors = (form: HTMLFormElement) => {
    const errorNodes = form.querySelectorAll<HTMLElement>("[data-required-inline-error='true']");
    for (const errorNode of errorNodes) errorNode.remove();
    const invalidNodes = form.querySelectorAll<HTMLElement>("[data-required-invalid='true']");
    for (const invalidNode of invalidNodes) {
      invalidNode.removeAttribute("data-required-invalid");
      invalidNode.removeAttribute("aria-invalid");
      invalidNode.classList.remove("border-[var(--ui-danger)]");
      invalidNode.classList.remove("ring-1");
      invalidNode.classList.remove("ring-[var(--ui-danger)]/30");
    }
  };

  const placeInlineError = (node: HTMLElement, message: string) => {
    const container =
      node.closest<HTMLElement>("[data-required-group='true']") ||
      node.closest<HTMLElement>("label") ||
      node.parentElement;
    if (!container) return;
    const errorEl = document.createElement("div");
    errorEl.setAttribute("data-required-inline-error", "true");
    errorEl.className = "mb-1 text-xs font-medium text-[var(--ui-danger)]";
    errorEl.textContent = message;
    container.prepend(errorEl);
    node.setAttribute("data-required-invalid", "true");
    node.setAttribute("aria-invalid", "true");
    node.classList.add("border-[var(--ui-danger)]", "ring-1", "ring-[var(--ui-danger)]/30");
  };

  const findTargetNodeByName = (form: HTMLFormElement, fieldName: string): HTMLElement | null => {
    const escaped = fieldName.replace(/"/g, '\\"');
    const field = form.querySelector<HTMLElement>(`[name="${escaped}"]`);
    if (!field) return null;

    const customTargetId =
      field.getAttribute("data-required-target") ||
      field.getAttribute("aria-controls");
    if (customTargetId) {
      const targetNode = document.getElementById(customTargetId);
      if (targetNode) return targetNode;
    }

    if (field instanceof HTMLInputElement && field.type === "hidden") {
      const trigger = form.querySelector<HTMLElement>(
        `[data-required-trigger="true"], [id="${escaped}-add-line"]`
      );
      if (trigger) return trigger;
    }
    return field;
  };

  useEffect(() => {
    if (!errorToken) return;
    restoreDraft();
    const form = formRef.current;
    if (!form) return;
    clearInlineErrors(form);
    const hint = inferServerErrorHint(errorToken);
    const targetNode =
      (hint.fieldName ? findTargetNodeByName(form, hint.fieldName) : null) ??
      form.querySelector<HTMLElement>("input[name],select[name],textarea[name]");
    if (!targetNode) return;
    placeInlineError(targetNode, hint.message || "No se pudo guardar. Revisa los datos.");
    targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
    targetNode.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorToken, storageKey]);

  return (
    <form
      ref={formRef}
      action={action}
      className={normalizedClassName}
      onInputCapture={(event) => {
        const form = formRef.current;
        if (!form) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const container =
          target.closest<HTMLElement>("[data-required-group='true']") ||
          target.closest<HTMLElement>("label") ||
          target.parentElement;
        if (container) {
          const error = container.querySelector<HTMLElement>("[data-required-inline-error='true']");
          if (error) error.remove();
        }
        target.removeAttribute("data-required-invalid");
        target.removeAttribute("aria-invalid");
        target.classList.remove("border-[var(--ui-danger)]");
        target.classList.remove("ring-1");
        target.classList.remove("ring-[var(--ui-danger)]/30");
      }}
      onSubmit={(event) => {
        const form = event.currentTarget;
        if (form.dataset.submitting === "1") {
          event.preventDefault();
          return;
        }
        clearInlineErrors(form);
        const missing: Array<{ node: HTMLElement; label: string }> = [];

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
          }
        }

        const customRequiredNodes = form.querySelectorAll<HTMLInputElement>(
          'input[data-required-custom="true"]'
        );
        for (const node of customRequiredNodes) {
          const value = String(node.value ?? "").trim();
          if (!value) {
            const label = node.getAttribute("data-required-label") || node.getAttribute("name") || "campo";
            const targetId = node.getAttribute("data-required-target");
            const targetNode = targetId ? document.getElementById(targetId) : null;
            missing.push({ node: (targetNode as HTMLElement) ?? node, label });
          }
        }

        if (missing.length === 0) {
          form.dataset.submitting = "1";
          const submitButtons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
          for (const button of submitButtons) {
            button.disabled = true;
          }
          persistDraft();
          return;
        }

        event.preventDefault();
        for (const entry of missing) {
          placeInlineError(entry.node, `Completa ${entry.label}.`);
        }
        const first = missing[0]?.node;
        if (first) {
          first.focus();
          first.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }}
    >
      {children}
    </form>
  );
}
