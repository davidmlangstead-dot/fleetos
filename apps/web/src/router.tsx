import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { ListPage } from "./modules/shared/ListPage";
export const router = createBrowserRouter([{ element: <AppShell/>, children: [
  { path: "/", element: <DashboardPage/> },
  { path: "/jobs", element: <ListPage title="Jobs" description="Plan, assign and track every collection and delivery." action="Create job"/> },
  { path: "/vehicles", element: <ListPage title="Vehicles" description="One reliable record for every vehicle and trailer." action="Add vehicle"/> },
  { path: "/drivers", element: <ListPage title="Drivers" description="Keep licences, training and assignments close at hand." action="Add driver"/> },
  { path: "/workshop", element: <ListPage title="Workshop" description="Defects, maintenance and inspection work in one queue." action="Log repair"/> },
  { path: "/compliance", element: <ListPage title="Compliance" description="Stay ahead of MOT, tax, insurance and driver documents." action="Add item"/> },
  { path: "/messages", element: <ListPage title="Messages" description="Conversations that stay connected to the job, vehicle or work." action="New message"/> },
  { path: "*", element: <Navigate to="/" replace/> },
] }]);
