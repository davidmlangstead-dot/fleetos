import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { JobsPage } from "./pages/JobsPage";
import { DriversPage } from "./pages/DriversPage";
import { ListPage } from "./modules/shared/ListPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/jobs", element: <JobsPage /> },
      { path: "/vehicles", element: <VehiclesPage /> },
      { path: "/drivers", element: <DriversPage /> },
      { path: "/workshop", element: <ListPage title="Workshop" description="Defects, maintenance and inspection work in one queue." action="Log repair" /> },
      { path: "/compliance", element: <ListPage title="Compliance" description="Stay ahead of MOT, tax, insurance and driver documents." action="Add item" /> },
      { path: "/messages", element: <ListPage title="Messages" description="Conversations that stay connected to the job, vehicle or work." action="New message" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);