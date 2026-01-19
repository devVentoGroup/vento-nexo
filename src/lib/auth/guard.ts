import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { normalizePermissionCode } from "@/lib/auth/permissions";

type GuardOptions = {
  appId: string;
  returnTo: string;
  supabase?: any;
  permissionCode?: string | string[];
};

export async function requireAppAccess({
  appId,
  returnTo,
  supabase,
  permissionCode,
}: GuardOptions) {
  const client = supabase ?? (await createClient());

  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user ?? null;

  if (!user) {
    redirect(await buildShellLoginUrl(returnTo));
  }

  const { data: canAccess, error: accessErr } = await client.rpc("has_permission", {
    p_permission_code: `${appId}.access`,
  });

  if (accessErr || !canAccess) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    if (accessErr) qs.set("reason", "no_access");
    redirect(`/no-access?${qs.toString()}`);
  }

  const permissionCodes = Array.isArray(permissionCode)
    ? permissionCode.filter(Boolean)
    : permissionCode
      ? [permissionCode]
      : [];

  if (permissionCodes.length) {
    const normalizedCodes = permissionCodes.map((code) =>
      normalizePermissionCode(appId, code)
    );
    const checks = await Promise.all(
      normalizedCodes.map((code) =>
        client.rpc("has_permission", { p_permission_code: code })
      )
    );

    const deniedIndex = checks.findIndex((res) => res.error || !res.data);
    if (deniedIndex !== -1) {
      const qs = new URLSearchParams();
      qs.set("returnTo", returnTo);
      qs.set("reason", "no_permission");
      qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
      redirect(`/no-access?${qs.toString()}`);
    }
  }

  return { supabase: client, user };
}
