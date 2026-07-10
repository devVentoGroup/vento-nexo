import type { createClient } from "@/lib/supabase/server";
import type { OperationalSession } from "@/lib/auth/operational-session";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type SignatureRpcRow = {
  signature_id?: string | null;
  actor_employee_id?: string | null;
  actor_shift_id?: string | null;
};

type SignatureResult =
  | {
      ok: true;
      required: false;
      signatureId: null;
      actorEmployeeId: null;
      actorShiftId: null;
    }
  | {
      ok: true;
      required: true;
      signatureId: string;
      actorEmployeeId: string;
      actorShiftId: string | null;
    }
  | {
      ok: false;
      required: boolean;
      message: string;
    };

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function requireSharedDeviceActorSignature({
  supabase,
  session,
  actorPin,
  appId,
  actionCode,
  targetTable,
  targetId = null,
  ttlSeconds = 300,
  metadata = {},
}: {
  supabase: SupabaseClient;
  session: OperationalSession;
  actorPin: unknown;
  appId: string;
  actionCode: string;
  targetTable: string;
  targetId?: string | null;
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<SignatureResult> {
  if (!session.isSharedDevice) {
    return {
      ok: true,
      required: false,
      signatureId: null,
      actorEmployeeId: null,
      actorShiftId: null,
    };
  }

  const pin = cleanText(actorPin);
  if (!pin) {
    return {
      ok: false,
      required: true,
      message: "Firma de trabajador requerida para operar desde esta terminal.",
    };
  }

  const { data, error } = await supabase.rpc("sign_shared_device_action", {
    p_actor_employee_id: null,
    p_actor_pin: pin,
    p_app_code: appId,
    p_action_code: actionCode,
    p_target_table: targetTable,
    p_target_id: targetId,
    p_signature_method: "pin",
    p_ttl_seconds: ttlSeconds,
    p_metadata: metadata,
  });

  const row = Array.isArray(data) ? (data[0] as SignatureRpcRow | undefined) : null;
  const signatureId = cleanText(row?.signature_id);
  const actorEmployeeId = cleanText(row?.actor_employee_id);

  if (error || !signatureId || !actorEmployeeId) {
    return {
      ok: false,
      required: true,
      message: "Firma de trabajador requerida para operar desde esta terminal.",
    };
  }

  return {
    ok: true,
    required: true,
    signatureId,
    actorEmployeeId,
    actorShiftId: cleanText(row?.actor_shift_id) || null,
  };
}

export async function attachSharedDeviceActionSignatureTarget({
  supabase,
  signatureId,
  targetTable,
  targetId,
  metadata = {},
}: {
  supabase: SupabaseClient;
  signatureId: string | null | undefined;
  targetTable: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const cleanSignatureId = cleanText(signatureId);
  if (!cleanSignatureId) return { ok: true as const, skipped: true as const };

  const { error } = await supabase.rpc("attach_shared_device_action_signature_target", {
    p_signature_id: cleanSignatureId,
    p_target_table: targetTable,
    p_target_id: targetId,
    p_metadata: metadata,
  });

  if (error) {
    return { ok: false as const, skipped: false as const, message: error.message };
  }

  return { ok: true as const, skipped: false as const };
}
