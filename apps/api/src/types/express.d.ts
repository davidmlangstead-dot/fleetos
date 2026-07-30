import type { AuthenticatedUser } from "@fleetros/shared";
declare global { namespace Express { interface Request { user?: AuthenticatedUser; } } }
export {};
