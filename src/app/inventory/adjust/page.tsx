import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function InventoryAdjustPage() {
  await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/adjust",
    permissionCode: "inventory.adjustments",
  });

  return (
    <div className="w-full px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Ajustes manuales con motivo, permisos y evidencia opcional. (En construcción.)
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-sm font-medium text-amber-800">Próximamente</p>
        <p className="mt-2 text-sm text-amber-700">
          Esta pantalla permitirá registrar ajustes de inventario con motivo y trazabilidad.
        </p>
        <Link
          href="/inventory/stock"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500"
        >
          Ir a Stock
        </Link>
      </div>
    </div>
  );
}
