"use client";

import { useEffect, useMemo, useState } from "react";

import { buildSkuPreview } from "@/lib/inventory/sku";

type CommonProps = {
  className?: string;
  nameFieldName?: string;
  typeFieldName?: string;
  inventoryKindFieldName?: string;
  initialProductType?: string | null;
  initialInventoryKind?: string | null;
  initialName?: string | null;
};

type CreateSkuFieldProps = CommonProps & {
  mode: "create";
};

type EditSkuFieldProps = CommonProps & {
  mode: "edit";
  currentSku?: string | null;
};

type SkuFieldProps = CreateSkuFieldProps | EditSkuFieldProps;

function readFieldValue(fieldName: string): string {
  if (typeof document === "undefined") return "";

  const selector = `input[name="${fieldName}"], select[name="${fieldName}"], textarea[name="${fieldName}"]`;
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);

  return (element?.value ?? "").trim();
}

function displayAutomaticSkuPreview(value: string): string {
  const preview = String(value ?? "").trim();
  if (!preview) return "SKU-AUTO";

  return preview.replace(/#+/g, "000XXX");
}

function displayExampleSku(value: string): string {
  const preview = String(value ?? "").trim();
  if (!preview) return "INS-ITEM-000123";

  return preview.replace(/#+/g, "000123");
}

export function SkuField(props: SkuFieldProps) {
  const {
    className,
    nameFieldName = "name",
    typeFieldName = "product_type",
    inventoryKindFieldName = "inventory_kind",
    initialProductType,
    initialInventoryKind,
    initialName,
  } = props;

  const [nameValue, setNameValue] = useState(initialName ?? "");
  const [productType, setProductType] = useState(initialProductType ?? "");
  const [inventoryKind, setInventoryKind] = useState(initialInventoryKind ?? "");
  const [allowOverride, setAllowOverride] = useState(false);
  const [assignAutoSku, setAssignAutoSku] = useState(true);

  useEffect(() => {
    const onInput = () => {
      setNameValue(readFieldValue(nameFieldName));
      setProductType(readFieldValue(typeFieldName) || initialProductType || "");
      setInventoryKind(readFieldValue(inventoryKindFieldName) || initialInventoryKind || "");
    };

    onInput();
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, [initialInventoryKind, initialProductType, inventoryKindFieldName, nameFieldName, typeFieldName]);

  const preview = useMemo(
    () =>
      buildSkuPreview({
        productType,
        inventoryKind,
        name: nameValue,
      }),
    [inventoryKind, nameValue, productType]
  );

  const readablePreview = useMemo(() => displayAutomaticSkuPreview(preview), [preview]);
  const exampleSku = useMemo(() => displayExampleSku(preview), [preview]);

  if (props.mode === "create") {
    return (
      <label className={`flex flex-col gap-1 ${className ?? ""}`.trim()}>
        <span className="ui-label">SKU automático</span>
        <input
          value={readablePreview}
          readOnly
          aria-readonly="true"
          className="ui-input bg-zinc-50 font-mono"
        />
        <span className="text-xs text-[var(--ui-muted)]">
          Vista previa. El número final se asigna automáticamente al guardar con la siguiente secuencia disponible.
        </span>
      </label>
    );
  }

  const currentSku = String(props.currentSku ?? "").trim();
  const hasCurrentSku = Boolean(currentSku);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`.trim()}>
      <span className="ui-label">SKU (código interno)</span>
      {!allowOverride ? (
        <input
          value={hasCurrentSku ? currentSku : "Sin SKU (legacy)"}
          readOnly
          aria-readonly="true"
          className="ui-input bg-zinc-50 font-mono"
        />
      ) : (
        <>
          <input
            name="sku"
            defaultValue={hasCurrentSku ? currentSku : ""}
            className="ui-input font-mono"
            placeholder={hasCurrentSku ? "Ej. VEN-BEBIDA-000123" : "Deja vacío para SKU automático"}
          />
          {!hasCurrentSku ? (
            <label className="inline-flex items-center gap-2 text-xs text-[var(--ui-muted)]">
              <input
                type="checkbox"
                name="assign_auto_sku"
                value="true"
                checked={assignAutoSku}
                onChange={(event) => setAssignAutoSku(event.target.checked)}
              />
              Asignar SKU automático si el campo queda vacío.
            </label>
          ) : null}
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={() => setAllowOverride((prev) => !prev)}
        >
          {allowOverride ? "Cancelar override SKU" : "Editar SKU manualmente"}
        </button>
        {!hasCurrentSku ? (
          <span className="text-xs text-amber-700">Producto legacy sin SKU.</span>
        ) : null}
      </div>

      <input type="hidden" name="allow_sku_override" value={allowOverride ? "true" : "false"} />

      {allowOverride ? (
        <span className="text-xs text-[var(--ui-muted)]">
          Formato válido: letras y números con guiones. Ejemplo: {exampleSku}.
        </span>
      ) : null}
    </div>
  );
}
