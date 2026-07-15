export function hostnameFromHostHeader(value?: string | null): string {
  const host = String(value ?? "").trim().toLowerCase();
  if (!host) return "";

  if (host.startsWith("[")) {
    const closingBracket = host.indexOf("]");
    return closingBracket > 0 ? host.slice(1, closingBracket) : host;
  }

  return host.split(":")[0] ?? "";
}

export function isLocalHostname(value?: string | null): boolean {
  const hostname = hostnameFromHostHeader(value);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function resolveRequestProtocol(
  host?: string | null,
  forwardedProto?: string | null,
): "http" | "https" {
  const forwarded = String(forwardedProto ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwarded === "http" || forwarded === "https") {
    return forwarded;
  }

  return isLocalHostname(host) ? "http" : "https";
}
