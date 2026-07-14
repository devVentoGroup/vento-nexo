import { createClient } from "@/lib/supabase/server";
import { normalizeUnitCode } from "@/lib/inventory/uom";

const IN_CHUNK_SIZE = 120;

export type SearchParams = { site_id?: string; location_id?: string };
export type EmployeeSiteRow = { site_id: string | null; is_primary: boolean | null };
export type SiteRow = { id: string; name: string | null };
export type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description