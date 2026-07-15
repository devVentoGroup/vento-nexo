"use server";

import { revalidatePath } from "next/cache";

import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export type SaveMeasurementConfigurationInput = {
  product