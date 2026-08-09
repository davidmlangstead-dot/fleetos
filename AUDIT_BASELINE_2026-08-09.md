# FleetOS Baseline Audit

Date: 2026-08-09

## Product target
FleetOS is being built as a driver-first fleet operating system for smaller fleets (1–50 vehicles): Samsara-style operational depth with a simpler workflow, strong driver experience, messaging/community, and marketplace potential.

## Commercial target
- 1–5 vehicles: £150/month
- 6–10 vehicles: £200/month
- 11–50 vehicles: £250/month

## Current repository baseline
- Monorepo managed with pnpm.
- Web app: React 19 + Vite + React Router + Supabase JS + TanStack Query.
- API: Express + Prisma + Supabase auth integration.
- Shared workspace package is present.
- Recent commits have concentrated on authentication/session handling, API URL/CORS, onboarding, and Prisma/API alignment.

## Immediate engineering priority
Do not add broad new features before establishing a reliable end-to-end baseline. Priorities are:
1. Authentication/session restoration and protected routes.
2. Web-to-API communication and API authentication.
3. Database/schema/API consistency.
4. Onboarding and core fleet data flows.
5. Production build/deployment reliability.
6. End-to-end testing of the above.

## Product principle
Do not copy enterprise complexity. The target experience is: minimum driver input, automatic linking of driver/vehicle/context, clear next actions, evidence/audit trail, and workflows that help small operators run a professional fleet.

## Handoff principle
Before 2026-08-29, leave the repository in a known, reproducible state with stable commits and a concise list of remaining blockers/tasks for Codex Work Mode. Never claim 100% completion without verification.
