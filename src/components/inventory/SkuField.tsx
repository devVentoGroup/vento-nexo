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

function readInputValue(selector: string): string {
  if (typeof document === "undefined") return "";
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  return (element?.value ?? "").trim();
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
    const nameSelector = `input[name="${nameFieldName}"]`;
    const typeSelector = `select[name="${typeFieldName}"]`;
    const inventoryKindSelector = `select[name="${inventoryKindFieldName}"]`;

    const onInput = () => {
      setNameValue(readInputValue(nameSelector));
      setProductType(readInputValue(typeSelector) || initialProductType || "");
      setInventoryKind(readInputValue(inventoryKindSelector) || initialInventoryKind || "");
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

  if (props.mode === "create") {
    return (
      <label className={`flex flex-col gap-1 ${className ?? ""}`.trim()}>
        <span className="ui-label">SKU (automatico)</span>
        <input value={preview} readOnly className="ui-input font-mono bg-zinc-50" />
        <span className="text-xs text-[var(--ui-muted)]">
          Se genera automaticamente al guardar. El numero final se asigna con secuencia global.
        </span>
      </label>
    );
  }

  const currentSku = String(props.currentSku ?? "").trim();
  const hasCurrentSku = Boolean(currentSku);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`.trim()}>
      <span className="ui-label">SKU (codigo interno)</span>
      {!allowOverride ? (
        <input
          value={hasCurrentSku ? currentSku : "Sin SKU (legacy)"}
          readOnly
          className="ui-input font-mono bg-zinc-50"
        />
      ) : (
        <>
          <input
            name="sku"
            defaultValue={hasCurrentSku ? currentSku : ""}
            className="ui-input font-mono"
            placeholder={hasCurrentSku ? "Ej. VEN-BEBIDA-000123" : "Deja vacio para SKU automatico"}
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
              Asignar SKU automatico si el campo queda vacio.
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
          Formato valido: letras y numeros con guiones (ej. {preview.replace("######", "000123")}).
        </span>
      ) : (
        <span className="text-xs text-[var(--ui-muted)]">
          El SKU se mantiene fijo para trazabilidad. Solo cambia con override explicito.
        </span>
      )}
    </div>
  );
}

