import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";

const DashboardPageClean = lazy(() => import("./modules/dashboard/DashboardPageClean").then(module => ({ default: module.DashboardPageClean })));
const VehiclesPage = lazy(() => import("./modules/vehicles/VehiclesPage").then(module => ({ default: module.VehiclesPage })));
const DriversPage = lazy(() => import("./modules/drivers/DriversPage").then(module => ({ default: module.DriversPage })));
const PersonalPage = lazy(() => import("./modules/personal/PersonalPage").then(module => ({ default: module.PersonalPage })));
const HoursBoardPage = lazy(() => import("./modules/operations/HoursBoardPage").then(module => ({ default: module.HoursBoardPage })));
const WorkshopPage = lazy(() => import("./modules/workshop/WorkshopPage").then(module => ({ default: module.WorkshopPage })));
const ComplianceGuardianPage = lazy(() => import("./modules/compliance/ComplianceGuardianPage").then(module => ({ default: module.ComplianceGuardianPage })));
const CompanySettingsPage = lazy(() => import("./modules/company/CompanySettingsPage").then(module => ({ default: module.CompanySettingsPage })));
const DepotsPage = lazy(() => import("./modules/organisation/DepotsPage").then(module => ({ default: module.DepotsPage })));
const AuditPage = lazy(() => import("./modules/organisation/AuditPage").then(module => ({ default: module.AuditPage })));
const RegistersHubPage = lazy(() => import("./modules/registers/RegisterPages").then(module => ({ default: module.RegistersHubPage })));
const RegisterModulePage = lazy(() => import("./modules/registers/RegisterPages").then(module => ({ default: module.RegisterModulePage })));
const MessagesPage = lazy(() => import("./modules/messages/MessagesPage").then(module => ({ default: module.MessagesPage })));
const DocumentsPage = lazy(() => import("./modules/documents/DocumentsPage").then(module => ({ default: module.DocumentsPage })));
const ReportsPage = lazy(() => import("./modules/reports/ReportsPage").then(module => ({ default: module.ReportsPage })));
const MarketplacePage = lazy(() => import("./modules/marketplace/MarketplacePage").then(module => ({ default: module.MarketplacePage })));
const MedicPage = lazy(() => import("./modules/medic/MedicPage").then(module => ({ default: module.MedicPage })));
const DriverCockpitPage = lazy(() => import("./modules/driver/DriverCockpitPage").then(module => ({ default: module.DriverCockpitPage })));
const DriverOperationsOfficePage = lazy(() => import("./modules/driver/DriverOperationsOfficePage").then(module => ({ default: module.DriverOperationsOfficePage })));
const JobsPage = lazy(() => import("./modules/jobs/JobsPage").then(module => ({ default: module.JobsPage })));
const MyWorkPage = lazy(() => import("./modules/jobs/MyWorkPage").then(module => ({ default: module.MyWorkPage })));

const pageFallback = <main className="loading-page"><div><h1>Loading FleetOS</h1></div></main>;
const load = (element: React.ReactNode) => <Suspense fallback={pageFallback}>{element}</Suspense>;

export const router = createBrowserRouter([{ element: <AppShell />, children: [
  { path: "/", element: load(<DashboardPageClean />) },
  { path: "/driver", element: load(<DriverCockpitPage />) },
  { path: "/driver-operations", element: load(<DriverOperationsOfficePage />) },
  { path: "/hours", element: load(<HoursBoardPage />) },
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
  { path: "/organisation/depots", element: load(<DepotsPage />) },
  { path: "/settings/company", element: load(<CompanySettingsPage />) },
  { path: "/settings/audit", element: load(<AuditPage />) },
  { path: "/settings/medic", element: load(<MedicPage />) },
  { path: "/messages", element: load(<MessagesPage />) },
  { path: "*", element: <Navigate to="/" replace /> },
]}]);
