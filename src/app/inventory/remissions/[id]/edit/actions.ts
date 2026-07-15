"use server";

import { redirect } from "next/navigation";

import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  getRequestPolicyInputUnitCode,
  mapProductRequestPolicyRow,
  validateRequestedPolicyQuantity,
  type ProductRequestPolicyRow,
} from "@/lib/inventory/request-policy";
import { roundQuantity } from "@/lib/inventory/uom";
import {