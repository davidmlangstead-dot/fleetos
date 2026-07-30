# FleetOS

Driver-focused transport operations platform. The workspace is split into independently deployable web and API applications, supported by shared domain types.

## Getting started

1. Install Node 22+ and pnpm 9+.
2. Copy `.env.example` into `apps/api/.env` and `apps/web/.env.local`; provide your Supabase values.
3. Run `pnpm install`.
4. Start PostgreSQL (or create a Supabase database), then run `pnpm db:generate` and `pnpm db:migrate`.
5. Run `pnpm dev`.

The web app runs on port 5173 and the API on 3001 by default.

## Structure

- `apps/web` – React PWA, route-level modules and mobile-first UI.
- `apps/api` – Express REST API, Prisma data access and Supabase token verification.
- `packages/shared` – Cross-service domain types and permission definitions.

## Architecture rules

- A company is the tenant boundary. Every business record carries a `companyId`.
- API modules own their routes and service logic; modules communicate through explicit services/events rather than database shortcuts.
- Browser clients never receive Supabase service-role credentials.
- Row-level security must mirror the API's company and role checks when Supabase is enabled.
"# fleetos" 
