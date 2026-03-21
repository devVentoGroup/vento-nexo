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
        <h1 className="ui-h1">Produccion integrada</h1>
        <p className="mt-2 ui-body-muted">
          Esta vista consolida el estado de produccion y su impacto en inventario. Puedes operar inventario y abastecimiento sin depender de flujos legacy.
        </p>
      </div>

      <div className="ui-panel space-y-3">
        <p className="text-sm text-[var(--ui-muted)]">
          Para la operacion inicial usa solo catalogo, ubicaciones, stock, remisiones, retiros, traslados, conteos y ajustes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/checklist" className="ui-btn ui-btn--brand">
            Ver checklist operativo
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
