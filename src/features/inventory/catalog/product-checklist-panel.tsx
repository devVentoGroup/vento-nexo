import { CatalogOptionalDetails } from "@/features/inventory/catalog/catalog-ui";

type ProductChecklistPanelProps = {
  items: string[];
  title?: string;
};

export function ProductChecklistPanel({
  items,
  title = "Checklist rapido antes de guardar",
}: ProductChecklistPanelProps) {
  return (
    <CatalogOptionalDetails
      title={title}
      summary="Abre este bloque solo si quieres validar el cierre antes de guardar."
    >
      {items.map((item, index) => (
        <p key={`${index + 1}-${item}`}>{index + 1}) {item}</p>
      ))}
    </CatalogOptionalDetails>
  );
}
