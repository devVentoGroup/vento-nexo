import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function ProductionBatchesInfoPage() {
  await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/production-batches",
  });

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <h1 className="ui-h1">Produccion fuera de v1</h1>
        <p className="mt-2 ui-body-muted">
          NEXO v1 sale a operar con inventario base, entradas manuales y remisiones. Produccion integrada y consumo por receta quedan fuera del arranque.
        </p>
      </div>

      <div className="ui-panel space-y-3">
        <p className="text-sm text-[var(--ui-muted)]">
          Para la operacion inicial usa solo catalogo, ubicaciones, stock, remisiones, retiros, traslados, conteos y ajustes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/checklist" className="ui-btn ui-btn--brand">
            Ver checklist v1
          </Link>
          <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
            Ir a catalogo
          </Link>
          <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
            Ir a remisiones
          </Link>
        </div>
      </div>
    </div>
  );
}
