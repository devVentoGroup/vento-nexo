import type { GuidedFieldHelp } from "@/lib/inventory/forms/types";

const HELP_CONTENT: Record<string, GuidedFieldHelp> = {
  category_scope: {
    meaning: "Define donde se vera la categoria.",
    when_to_use: "Global cuando aplica en todas las sedes. Sede cuando solo aplica en una sede puntual.",
    example: "Categoria global: Insumos secos. Categoria por sede: Menaje exclusivo de Saudo.",
    impact: "Cambia el universo de categorias visibles al crear y editar productos.",
  },
  category_channel: {
    meaning: "Segmenta categorias de venta por canal o marca.",
    when_to_use: "Solo cuando el uso incluye Venta. Si no hay segmentacion, dejar Sin canal.",
    example: "Venta -> Saudo. Venta -> Vento Cafe. Sin canal para categoria comun.",
    impact: "Evita mezclar categorias de venta entre marcas o canales.",
  },
  stock_unit_code: {
    meaning: "Unidad canonica del inventario.",
    when_to_use: "Siempre; representa la unidad en la que vive el stock.",
    example: "Leche: ml. Harina: g. Huevos: un.",
    impact: "Afecta conversiones, costo unitario y consistencia de movimientos.",
  },
  default_unit: {
    meaning: "Unidad sugerida para captura en formularios.",
    when_to_use: "Cuando el usuario opera mejor en una unidad distinta pero compatible.",
    example: "Stock en g, captura en kg.",
    impact: "Mejora usabilidad sin perder consistencia tecnica.",
  },
  track_inventory: {
    meaning: "Habilita control de existencias.",
    when_to_use: "Activado para insumos, preparaciones y productos con control de stock.",
    example: "Insumo de cocina: activo. Servicio sin inventario: inactivo.",
    impact: "Define si el item participa en entradas, salidas, ajustes y conteos.",
  },
};

export function getGuidedFieldHelp(fieldId: string): GuidedFieldHelp | null {
  return HELP_CONTENT[fieldId] ?? null;
}

export function getGuidedHelpSnapshot(fieldIds: string[]): Record<string, GuidedFieldHelp> {
  const result: Record<string, GuidedFieldHelp> = {};
  for (const fieldId of fieldIds) {
    const help = getGuidedFieldHelp(fieldId);
    if (help) result[fieldId] = help;
  }
  return result;
}

