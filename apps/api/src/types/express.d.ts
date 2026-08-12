type FleetOSRole =
  | "DRIVER"
  | "WORKSHOP_TECHNICIAN"
  | "TRANSPORT_PLANNER"
  | "TRANSPORT_MANAGER"
  | "OFFICE_STAFF"
  | "FINANCE"
  | "COMPANY_ADMIN"
  | "PLATFORM_ADMIN";

type AuthenticatedUser = {
  id: string;
  email: string;
  companyId: string;
  role: FleetOSRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
