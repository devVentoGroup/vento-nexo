import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function WarehouseQRPage() {
  redirect("/inventory/locations");
}
