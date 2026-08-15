import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useRouteError } from "react-router-dom";
import { AppShell } from "./components/AppShell";

const CHUNK_RECOVERY_KEY = "fleetos-chunk-recovery";

function looksLikeChunkFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(message);
}

async function loadWithChunkRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    const result = await loader();
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
    return result;
  } catch (error) {
    if (looksLikeChunkFailure(error) && sessionStorage.getItem(CHUNK_RECOVERY_KEY) !== "1") {
      sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("fleetos-shell-")).map((key) => caches.delete(key)));
        }
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.update();
        }
      } catch (recoveryError) {
        console.warn("FleetOS stale-chunk cache recovery could not complete", recoveryError);
      }
      window.location.reload();
      return new Promise<T>(() => undefined);
    }
    throw error;
  }
}

const DashboardPageClean = lazy(() => loadWithChunkRecovery(() => import("./modules/dashboard/DashboardPageClean").then(module => ({ default: module.DashboardPageClean }))));
const VehiclesPage = lazy(() => loadWithChunkRecovery(() => import("./modules/vehicles/VehiclesPage").then(module => ({ default: module.VehiclesPage }))));
const DriversPage = lazy(() => loadWithChunkRecovery(() => import("./modules/drivers/DriversPage").then(module => ({ default: module.DriversPage }))));
const PersonalPage = lazy(() => loadWithChunkRecovery(() => import("./modules/personal/PersonalPage").then(module => ({ default: module.PersonalPage }))));
const HoursBoardPage = lazy(() => loadWithChunkRecovery(() => import("./modules/operations/HoursBoardPage").then(module => ({ default: module.HoursBoardPage }))));
const WorkshopPage = lazy(() => loadWithChunkRecovery(() => import("./modules/workshop/WorkshopPage").then(module => ({ default: module.WorkshopPage }))));
const ComplianceGuardianPage = lazy(() => loadWithChunkRecovery(() => import("./modules/compliance/ComplianceGuardianPage").then(module => ({ default: module.ComplianceGuardianPage }))));
const CompanySettingsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/company/CompanySettingsPage").then(module => ({ default: module.CompanySettingsPage }))));
const BetaControlsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/company/BetaControlsPage").then(module => ({ default: module.BetaControlsPage }))));
const SpreadsheetImportPage = lazy(() => loadWithChunkRecovery(() => import("./modules/imports/SpreadsheetImportPage").then(module => ({ default: module.SpreadsheetImportPage }))));
const DepotsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/organisation/DepotsPage").then(module => ({ default: module.DepotsPage }))));
const AuditPage = lazy(() => loadWithChunkRecovery(() => import("./modules/organisation/AuditPage").then(module => ({ default: module.AuditPage }))));
const RegistersHubPage = lazy(() => loadWithChunkRecovery(() => import("./modules/registers/RegisterPages").then(module => ({ default: module.RegistersHubPage }))));
const RegisterModulePage = lazy(() => loadWithChunkRecovery(() => import("./modules/registers/RegisterPages").then(module => ({ default: module.RegisterModulePage }))));
const MessagesPage = lazy(() => loadWithChunkRecovery(() => import("./modules/messages/MessagesPage").then(module => ({ default: module.MessagesPage }))));
const DocumentsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/documents/DocumentsPage").then(module => ({ default: module.DocumentsPage }))));
const TachographPage = lazy(() => loadWithChunkRecovery(() => import("./modules/tachograph/TachographPage").then(module => ({ default: module.TachographPage }))));
const DriverTachographPage = lazy(() => loadWithChunkRecovery(() => import("./modules/tachograph/DriverTachographPage").then(module => ({ default: module.DriverTachographPage }))));
const ReportsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/reports/ReportsPage").then(module => ({ default: module.ReportsPage }))));
const MarketplacePage = lazy(() => loadWithChunkRecovery(() => import("./modules/marketplace/MarketplacePage").then(module => ({ default: module.MarketplacePage }))));
const MedicPage = lazy(() => loadWithChunkRecovery(() => import("./modules/medic/MedicPage").then(module => ({ default: module.MedicPage }))));
const DriverCockpitPage = lazy(() => loadWithChunkRecovery(() => import("./modules/driver/DriverCockpitPage").then(module => ({ default: module.DriverCockpitPage }))));
const DriverOperationsOfficePage = lazy(() => loadWithChunkRecovery(() => import("./modules/driver/DriverOperationsOfficePage").then(module => ({ default: module.DriverOperationsOfficePage }))));
const JobsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/jobs/JobsPage").then(module => ({ default: module.JobsPage }))));
const MyWorkPage = lazy(() => loadWithChunkRecovery(() => import("./modules/jobs/MyWorkPage").then(module => ({ default: module.MyWorkPage }))));
const PlatformControlPage = lazy(() => loadWithChunkRecovery(() => import("./modules/platform/PlatformControlPage").then(module => ({ default: module.PlatformControlPage }))));
const PlatformCustomersPage = lazy(() => loadWithChunkRecovery(() => import("./modules/platform/PlatformControlPage").then(module => ({ default: module.PlatformCustomersPage }))));
const PlatformMoneyPage = lazy(() => loadWithChunkRecovery(() => import("./modules/platform/PlatformControlPage").then(module => ({ default: module.PlatformMoneyPage }))));
const ResellerPortalPage = lazy(() => loadWithChunkRecovery(() => import("./modules/platform/ResellerPortalPage").then(module => ({ default: module.ResellerPortalPage }))));
const AccountsPage = lazy(() => loadWithChunkRecovery(() => import("./modules/accounts/AccountsPage").then(module => ({ default: module.AccountsPage }))));
const AccessibilityPage = lazy(() => loadWithChunkRecovery(() => import("./modules/settings/AccessibilityPage").then(module => ({ default: module.AccessibilityPage }))));

const pageFallback = <main className="loading-page"><div><h1>Loading FleetOS</h1></div></main>;
const load = (element: React.ReactNode) => <Suspense fallback={pageFallback}>{element}</Suspense>;

function RouteError() {
  const error = useRouteError();
  const chunkFailure = looksLikeChunkFailure(error);
  const detail = error instanceof Error ? error.message : "The page could not be opened.";
  return <main className="loading-page"><div><p className="eyebrow">FleetOS recovery</p><h1>{chunkFailure ? "FleetOS has just been updated" : "We couldn't open this page"}</h1><p>{chunkFailure ? "Your browser still has part of the previous version. Reload to switch to the current version safely." : detail}</p><button onClick={() => window.location.reload()}>Reload FleetOS</button></div></main>;
}

export const router = createBrowserRouter([{ element: <AppShell />, errorElement: <RouteError />, children: [
  { path: "/", element: load(<DashboardPageClean />) },
  { path: "/driver", element: load(<DriverCockpitPage />) },
  { path: "/driver/tachograph", element: load(<DriverTachographPage />) },
  { path: "/driver-operations", element: load(<DriverOperationsOfficePage />) },
  { path: "/hours", element: load(<HoursBoardPage />) },
  { path: "/tachograph", element: load(<TachographPage />) },
  { path: "/jobs", element: load(<JobsPage />) },
  { path: "/my-work", element: load(<MyWorkPage />) },
  { path: "/vehicles", element: load(<VehiclesPage />) },
  { path: "/drivers", element: load(<DriversPage />) },
  { path: "/personal", element: load(<PersonalPage />) },
  { path: "/workshop", element: load(<WorkshopPage />) },
  { path: "/compliance", element: load(<ComplianceGuardianPage />) },
  { path: "/documents", element: load(<DocumentsPage />) },
  { path: "/registers", element: load(<RegistersHubPage />) },
  { path: "/registers/:module", element: load(<RegisterModulePage />) },
  { path: "/reports", element: load(<ReportsPage />) },
  { path: "/marketplace", element: load(<MarketplacePage />) },
  { path: "/imports", element: load(<SpreadsheetImportPage />) },
  { path: "/accounts", element: load(<AccountsPage />) },
  { path: "/control", element: load(<PlatformControlPage />) },
  { path: "/control/customers", element: load(<PlatformCustomersPage />) },
  { path: "/control/money", element: load(<PlatformMoneyPage />) },
  { path: "/reseller", element: load(<ResellerPortalPage />) },
  { path: "/organisation/depots", element: load(<DepotsPage />) },
  { path: "/settings/company", element: load(<CompanySettingsPage />) },
  { path: "/settings/beta", element: load(<BetaControlsPage />) },
  { path: "/settings/audit", element: load(<AuditPage />) },
  { path: "/settings/medic", element: load(<MedicPage />) },
  { path: "/settings/accessibility", element: load(<AccessibilityPage />) },
  { path: "/messages", element: load(<MessagesPage />) },
  { path: "*", element: <Navigate to="/" replace /> },
]}]);