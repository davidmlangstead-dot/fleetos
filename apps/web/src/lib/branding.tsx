import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, API_BASE_URL } from "./api";

export type Branding = {
  name: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  showPoweredBy: boolean;
  marketplaceEnabled: boolean;
  companySlug: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  name: "FleetOS",
  tagline: "Transport operations, made simpler",
  logoUrl: null,
  primaryColor: "#197B58",
  accentColor: "#32C58B",
  sidebarColor: "#0E1B2C",
  supportEmail: null,
  supportPhone: null,
  showPoweredBy: true,
  marketplaceEnabled: true,
  companySlug: null,
};

type BrandingContextValue = { branding: Branding; setBranding: (branding: Branding) => void };
const BrandingContext = createContext<BrandingContextValue>({ branding: DEFAULT_BRANDING, setBranding: () => undefined });

function normaliseBranding(value: Partial<Branding> | null | undefined): Branding {
  const colour = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
  return {
    name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : DEFAULT_BRANDING.name,
    tagline: typeof value?.tagline === "string" && value.tagline.trim() ? value.tagline.trim().slice(0, 160) : DEFAULT_BRANDING.tagline,
    logoUrl: typeof value?.logoUrl === "string" && value.logoUrl.startsWith("https://") ? value.logoUrl : null,
    primaryColor: colour(value?.primaryColor, DEFAULT_BRANDING.primaryColor),
    accentColor: colour(value?.accentColor, DEFAULT_BRANDING.accentColor),
    sidebarColor: colour(value?.sidebarColor, DEFAULT_BRANDING.sidebarColor),
    supportEmail: typeof value?.supportEmail === "string" && value.supportEmail.trim() ? value.supportEmail.trim() : null,
    supportPhone: typeof value?.supportPhone === "string" && value.supportPhone.trim() ? value.supportPhone.trim() : null,
    showPoweredBy: value?.showPoweredBy !== false,
    marketplaceEnabled: value?.marketplaceEnabled !== false,
    companySlug: typeof value?.companySlug === "string" && value.companySlug ? value.companySlug : null,
  };
}

export async function loadPublicBranding() {
  const params = new URLSearchParams();
  const slug = new URLSearchParams(window.location.search).get("company")?.trim();
  const host = window.location.hostname.toLowerCase();
  if (slug) params.set("slug", slug);
  if (host && host !== "localhost" && host !== "127.0.0.1") params.set("host", host);
  if (![...params.keys()].length) return DEFAULT_BRANDING;

  try {
    const response = await fetch(`${API_BASE_URL}/company/branding?${params.toString()}`);
    if (!response.ok) return DEFAULT_BRANDING;
    return normaliseBranding(await response.json() as Partial<Branding>);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function loadCurrentBranding() {
  return normaliseBranding(await api<Partial<Branding>>("/company/branding/current"));
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, updateBranding] = useState(DEFAULT_BRANDING);
  const setBranding = (next: Branding) => updateBranding(normaliseBranding(next));

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", branding.primaryColor);
    root.style.setProperty("--brand-accent", branding.accentColor);
    root.style.setProperty("--brand-sidebar", branding.sidebarColor);
    document.title = branding.name;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", branding.sidebarColor);
  }, [branding]);

  return <BrandingContext.Provider value={{ branding, setBranding }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const { branding } = useBranding();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [branding.logoUrl]);
  const mark = branding.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "F";

  return <>
    {branding.logoUrl && !failed
      ? <img className={`brand-logo${compact ? " compact" : ""}`} src={branding.logoUrl} alt="" onError={() => setFailed(true)} />
      : <span className="brand-mark">{mark}</span>}
    <span>{branding.name}</span>
  </>;
}

export function PoweredBy() {
  const { branding } = useBranding();
  if (!branding.showPoweredBy || branding.name === DEFAULT_BRANDING.name) return null;
  return <small className="powered-by">Powered by FleetOS</small>;
}

export function BrandSupport() {
  const { branding } = useBranding();
  if (!branding.supportEmail && !branding.supportPhone) return null;

  return <p className="brand-support">
    Need help?{" "}
    {branding.supportEmail && <a href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>}
    {branding.supportEmail && branding.supportPhone && <span aria-hidden="true"> · </span>}
    {branding.supportPhone && <a href={`tel:${branding.supportPhone.replace(/[^+\d]/g, "")}`}>{branding.supportPhone}</a>}
  </p>;
}
