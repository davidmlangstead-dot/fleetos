import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPageClean } from "./modules/dashboard/DashboardPageClean";
import { VehiclesPage } from "./modules/vehicles/VehiclesPage";
import { JobsPage } from "./modules/jobs/JobsPage";
import { DriversPage } from "./modules/drivers/DriversPage";
import { PersonalPage } from "./modules/personal/PersonalPage";
import { DriverCockpitPage } from "./modules/driver/DriverCockpitPage";
import { HoursBoardPage } from "./modules/operations/HoursBoardPage";
import { WorkshopPage } from "./modules/workshop/WorkshopPage";
import { ComplianceGuardianPage } from "./modules/compliance/ComplianceGuardianPage";
import { CompanySettingsPage } from "./modules/company/CompanySettingsPage";
import { DepotsPage } from "./modules/organisation/DepotsPage";
import { AuditPage } from "./modules/organisation/AuditPage";
import { RegistersHubPage, RegisterModulePage } from "./modules/registers/RegisterPages";
import { ListPage } from "./modules/shared/ListPage";

export const router = createBrowserRouter([{ element: <AppShell />, children: [
  { path: "/", element: <DashboardPageClean /> },
  { path: "/driver", element: <DriverCockpitPage /> },
  { path: "/hours", element: <HoursBoardPage /> },
  { path: "/jobs", element: <JobsPage /> },
  { path: "/vehicles", element: <VehiclesPage /> },
  { path: "/drivers", element: <DriversPage /> },
  { path: "/personal", element: <PersonalPage /> },
  { path: "/workshop", element: <WorkshopPage /> },
  { path: "/compliance", element: <ComplianceGuardianPage /> },
  { path: "/registers", element: <RegistersHubPage /> },
  { path: "/registers/:module", element: <RegisterModulePage /> },
  { path: "/organisation/depots", element: <DepotsPage /> },
  { path: "/settings/company", element: <CompanySettingsPage /> },
  { path: "/settings/audit", element: <AuditPage /> },
  { path: "/messages", element: <ListPage title="Messages" description="Conversations connected to your work." action="New message" /> },
  { path: "*", element: <Navigate to="/" replace /> },
]}]);
