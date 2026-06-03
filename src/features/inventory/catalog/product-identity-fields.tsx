import type { ReactNode } from "react";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { SkuField } from "@/components/inventory/SkuField";
import type { InventoryCategoryRow } from "@/lib/inventory/categories";

type SkuFieldConfig =
  | {
      mode: "create";
      initialProductType?: string | null;
      initialInventoryKind?: string | null;
      initialName?: string | null;
    }
  | {
      mode: "edit";
      currentSku?: string | null;
      initialProductType?: string | null;
      initialInventoryKind?: string | null;
      initialName?: string | null;
    };

type LockedTypeField = {
  value: string;
  label?: string;
  hint?: string;
  hiddenName?: string;
  hiddenValue?: string;
};

type PriceField = {
  defaultValue?: string | number | null;
  placeholder?: string;
  label?: string;
  hint?: string;
};

type ProductIdentityFieldsProps = {
  nameLabel?: string;
  nameRequired?: boolean;
  namePlaceholder: string;
  nameDefaultValue?: string | null;
  categories: InventoryCategoryRow[];
  selectedCategoryId: string;
  siteNamesById?: Record<string, string>;
  categoryLabel?: string;
  categoryRequired?: boolean;
  categoryEmptyOptionLabel?: string;
  descriptionLabel?: string;
  descriptionRequired?: boolean;
  descriptionDefaultValue?: string | null;
  descriptionPlaceholder?: string;
  descriptionHint?: string;
  skuField: SkuFieldConfig;
  aside?: ReactNode;
  lockedTypeField?: LockedTypeField;
  priceField?: PriceField;
  trailingContent?: ReactNode;
};

export function ProductIdentityFields({
  nameLabel = "Nombre",
  nameRequired = true,
  namePlaceholder,
  nameDefaultValue,
  categories,
  selectedCategoryId,
  siteNamesById,
  categoryLabel = "Categoría operativa",
  categoryRequired = false,
  categoryEmptyOptionLabel = "Selecciona categoría",
  descriptionLabel = "Descripción",
  descriptionRequired = false,
  descriptionDefaultValue,
  descriptionPlaceholder = "Opcional",
  descriptionHint,
  skuField,
  aside = null,
  lockedTypeField,
  priceField,
  trailingContent = null,
}: ProductIdentityFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="ui-label">
          {nameLabel}
          {nameRequired ? <span className="text-[var(--ui-danger)]"> *</span> : null}
        </span>
        <input
          name="name"
          defaultValue={nameDefaultValue ?? ""}
          className="ui-input"
          placeholder={namePlaceholder}
          required={nameRequired}
        />
      </label>

      {skuField.mode === "edit" ? (
        <SkuField
          mode="edit"
          currentSku={skuField.currentSku}
          initialProductType={skuField.initialProductType}
          initialInventoryKind={skuField.initialInventoryKind}
          initialName={skuField.initialName}
          className="flex flex-col gap-1"
        />
      ) : (
        <SkuField
          mode="create"
          initialProductType={skuField.initialProductType}
          initialInventoryKind={skuField.initialInventoryKind}
          initialName={skuField.initialName}
          className="flex flex-col gap-1"
        />
      )}

      {aside}

      {lockedTypeField ? (
        <label className="flex flex-col gap-1">
          <span className="ui-label">{lockedTypeField.label ?? "Tipo"}</span>
          <input className="ui-input" value={lockedTypeField.value} readOnly />
          {lockedTypeField.hiddenName ? (
            <input
              type="hidden"
              name={lockedTypeField.hiddenName}
              value={lockedTypeField.hiddenValue ?? ""}
            />
          ) : null}
          {lockedTypeField.hint ? (
            <span className="text-xs text-[var(--ui-muted)]">{lockedTypeField.hint}</span>
          ) : null}
        </label>
      ) : null}

      <CategoryTreeFilter
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        siteNamesById={siteNamesById}
        className="sm:col-span-2"
        label={categoryLabel}
        required={categoryRequired}
        emptyOptionLabel={categoryEmptyOptionLabel}
        maxVisibleOptions={8}
        selectionMode="leaf_only"
        nonSelectableHint="Categoría padre"
      />

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="ui-label">
          {descriptionLabel}
          {descriptionRequired ? <span className="text-[var(--ui-danger)]"> *</span> : null}
        </span>
        <input
          name="description"
          defaultValue={descriptionDefaultValue ?? ""}
          className="ui-input"
          placeholder={descriptionPlaceholder}
          required={descriptionRequired}
        />
        {descriptionHint ? (
          <span className="text-xs text-[var(--ui-muted)]">{descriptionHint}</span>
        ) : null}
      </label>

      {priceField ? (
        <label className="flex flex-col gap-1">
          <span className="ui-label">{priceField.label ?? "Precio de venta"}</span>
          <input
            name="price"
            type="number"
            step="0.01"
            defaultValue={priceField.defaultValue ?? ""}
            className="ui-input"
            placeholder={priceField.placeholder ?? "0.00"}
          />
          {priceField.hint ? (
            <span className="text-xs text-[var(--ui-muted)]">{priceField.hint}</span>
          ) : null}
        </label>
      ) : null}

      {trailingContent}
    </div>
  );
}
