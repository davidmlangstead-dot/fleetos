export type PortalKind = "CUSTOMER" | "MANAGER" | "RESELLER";

export const CUSTOMER_URL = "https://fleetos-orpin-one.vercel.app";
export const MANAGER_URL = "https://fleetos-davidmlangstead-dots-projects.vercel.app";
export const RESELLER_URL = "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app";

const hostOf = (url: string) => new URL(url).hostname;

export function resolvePortalKind(hostname = typeof window === "undefined" ? "" : window.location.hostname): PortalKind {
  const host = hostname.toLowerCase();
  if (host === hostOf(MANAGER_URL)) return "MANAGER";
  if (host === hostOf(RESELLER_URL)) return "RESELLER";
  return "CUSTOMER";
}

export const portalKind = resolvePortalKind();

export function portalTitle(kind: PortalKind) {
  if (kind === "MANAGER") return "FleetOS Manager";
  if (kind === "RESELLER") return "White-label Partner Portal";
  return "FleetOS";
}
