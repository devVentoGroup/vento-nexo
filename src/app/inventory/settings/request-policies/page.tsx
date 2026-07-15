import { requireAppAccess } from "@/lib/auth/guard";
import {
  RequestPolicyManager,
  type ManagerProduct,
} from "./request-policy-manager";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  stock_unit_code: string | null