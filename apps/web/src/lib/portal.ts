export type PortalKind = "CUSTOMER" | "MANAGER" | "RESELLER";

export const CUSTOMER_URL = "https://fleetos-orpin-one.vercel.app";
export const MANAGER_URL = "https://fleetos-manager-portal.onrender.com";
export const RESELLER_URL = "https://fleetos-reseller-portal.onrender.com";

const LEGACY_MANAGER_URL = "https://fleetos-davidmlangstead-dots-projects.vercel.app";
const LEGACY_RESELLER_URL = "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app";
const hostOf = (url: string) => new URL(url).hostname;

function configuredPortalKind(): PortalKind | null {
  const value = String(import.meta.env.VITE_PORTAL_KIND ?? "").trim().toUpperCase();
  return value === "CUSTOMER" || value === "MANAGER" || value === "RESELLER" ? value : null;
}

export function resolvePortalKind(hostname = typeof window === "undefined" ? "" : window.location.hostname): PortalKind {
  const configured = configuredPortalKind();
  if (configured) return configured;
  const host = hostname.toLowerCase();
  if (host === hostOf(MANAGER_URL) || host === hostOf(LEGACY_MANAGER_URL)) return "MANAGER";
  if (host === hostOf(RESELLER_URL) || host === hostOf(LEGACY_RESELLER_URL)) return "RESELLER";
  return "CUSTOMER";
}

export const portalKind = resolvePortalKind();

export function portalTitle(kind: PortalKind) {
  if (kind === "MANAGER") return "FleetOS Manager";
  if (kind === "RESELLER") return "White-label Partner Portal";
  return "FleetOS";
}
