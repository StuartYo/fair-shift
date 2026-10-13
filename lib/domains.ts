// Official-domain allowlist. The default list is a placeholder; each app sets its
// own with APP_ALLOWED_DOMAINS (comma separated) or passes one in code.
// A host matches if it equals an entry or is a subdomain of it.

export const DEFAULT_ALLOWED_DOMAINS: readonly string[] = ["gov.tw", "gov"];

export function allowedDomains(): readonly string[] {
  const raw = process.env.APP_ALLOWED_DOMAINS;
  if (!raw) return DEFAULT_ALLOWED_DOMAINS;
  const list = raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^\.+/, ""))
    .filter((d) => /^[a-z0-9.-]+$/.test(d) && d.includes("."));
  return list.length ? list : DEFAULT_ALLOWED_DOMAINS;
}

export function isAllowedUrl(raw: string, domains: readonly string[] = allowedDomains()): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  return domains.some((d) => host === d || host.endsWith("." + d));
}

/** Keep only domains that are inside the allowlist (used to narrow a search). */
export function narrowDomains(requested: readonly string[] | undefined, domains: readonly string[] = allowedDomains()): string[] {
  if (!requested || requested.length === 0) return [...domains];
  const ok = requested.filter((r) => domains.some((d) => r === d || r.endsWith("." + d)));
  return ok.length ? ok : [...domains];
}
