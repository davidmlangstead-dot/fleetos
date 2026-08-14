# FleetOS Disaster Recovery

This runbook defines the minimum recovery process for a serious FleetOS outage. It is not evidence that a backup has been restored successfully; restore drills must be recorded separately.

## Recovery priorities

1. Protect tenant confidentiality and prevent destructive writes.
2. Restore authentication and tenant-safe API access.
3. Restore core driver/office workflows.
4. Restore secondary reporting/marketplace/admin functions.

## Systems

- Web/PWA deployment: Vercel.
- API deployment: Render.
- Authentication/database/storage: Supabase.
- Source and release history: GitHub `main` and verified workflow runs.

## Application rollback

1. Identify the last deployed commit with a successful build, dependency audit, PWA contract, bundle budget, production smoke, and security perimeter check.
2. Roll back the affected hosting service to that revision rather than editing production manually.
3. Confirm API `/health` and web availability.
4. Run `scripts/smoke.mjs` and `scripts/security-smoke.mjs`.
5. For auth/tenant-related incidents, do not declare full recovery until real authenticated tenant isolation is proven.

## Database recovery

Never rehearse a destructive restore against the production project.

A proper restore drill must use an isolated recovery target and record:

- backup/snapshot timestamp;
- restore start/end timestamps;
- schema/migration level;
- row-count/integrity checks for critical tenant tables;
- authentication mapping checks;
- tenant separation checks;
- application smoke tests against the recovered target;
- any data-loss window (RPO) and recovery duration (RTO).

Do not point production traffic at a recovered database until schema compatibility and tenant isolation are verified.

## Supabase outage/degradation

- Keep valid cached client sessions when identity has not been proven invalid.
- Do not weaken RLS, grants, or API authorization to work around an outage.
- Allow the PWA to use only intentionally cached shell/offline data; API responses must not be broadly cached as a workaround.
- Reconcile queued/offline writes after service recovery using existing idempotency controls.

## Verification before reopening

- correct production SHA is serving;
- API health succeeds;
- production smoke passes;
- security perimeter passes;
- dependency audit is clean at the configured severity threshold;
- PWA installability and bundle budget pass;
- database queries and core tenant-scoped reads/writes behave normally;
- if recovery touched auth or tenant data, authenticated A→B and B→A isolation tests pass.

## Drill cadence

Run a non-destructive application rollback exercise after material deployment-system changes and a database restore drill to an isolated target before broad commercial launch, then periodically thereafter. Record evidence and remediation from every drill.
