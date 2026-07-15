"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildShellLoginUrl } from "@/lib/auth/sso";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value