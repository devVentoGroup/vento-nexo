"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

type SaveRequestConfigurationInput = {
  productId: string;
  policyId?: string | null;
  label: string;
