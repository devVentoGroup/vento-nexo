import { CatalogHintPanel } from "@/features/inventory/catalog/catalog-ui";

type ProductChecklistPanelProps = {
  items: string[];
  title?: string;
};

export function ProductChecklistPanel({
  items,
  title = "Checklist rapido antes de guardar",
}: ProductChecklistPanelProps) {
  return (
    <CatalogHintPanel title={title}>
      {items.map((item, index) => (
        <p key={`${index + 1}-${item}`}>{index + 1}) {item}</p>
      ))}
    </CatalogHintPanel>
  );
}
