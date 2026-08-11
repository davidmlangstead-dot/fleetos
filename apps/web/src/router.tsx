import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPageClean } from "./modules/dashboard/DashboardPageClean";
import { VehiclesPage } from "./modules/vehicles/VehiclesPage";
import { JobsPage } from "./modules/jobs/JobsPage";
import { DriversPage } from "./modules/drivers/DriversPage";
import { ListPage } from "./modules/shared/ListPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <DashboardPageClean /> },
      { path: "/jobs", element: <JobsPage /> },
      { path: "/vehicles", element: <VehiclesPage /> },
      { path: "/drivers", element: <DriversPage /> },
      { path: "/workshop", element: <ListPage title="Workshop" description="Defects, maintenance and inspection work in one queue." action="Log repair" /> },
      { path: "/compliance", element: <ListPage title="Compliance" description="Recorded evidence, dates and actions for your fleet." action="Add item" /> },
      { path: "/messages", element: <ListPage title="Messages" description="Conversations connected to your work." action="New message" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
