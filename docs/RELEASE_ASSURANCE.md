# FleetOS Release Assurance

FleetOS should be treated as releasable only when the required automated and manual checks below are satisfied. A green build alone is not release approval.

## Automated release gate

Every production change should pass:

1. Dependency install from the lockfile.
2. Prisma client generation.
3. Full monorepo build.
4. Production smoke checks.
5. Security perimeter probes.
6. Authenticated cross-tenant isolation probes.
7. Authenticated read-load checks.
8. CodeQL static security analysis.

The nightly assurance workflow additionally runs:

- High/critical dependency vulnerability audit.
- Safe staged public load test.
- Authenticated tenant-isolation attacks.
- Authenticated read-load checks.

## Required production controls

- RLS and backend authorization remain deny-by-default.
- No release may silently skip authenticated tenant-isolation tests.
- Database schema changes must be recorded as migrations.
- Failed security, tenant-isolation or build checks block release.
- Load tests must use non-destructive GET/read-only targets unless an isolated test environment is explicitly being used.
- Secrets must never be committed to the repository.

## Manual release checklist

Before a significant production release:

- Confirm the target deployment and database migration set.
- Confirm current database backup/restore capability.
- Review Supabase security and performance advisors.
- Review new dependency/security alerts.
- Verify web sign-in, onboarding and dashboard on a mobile-sized browser.
- Verify driver, office/workshop and management role access for changed workflows.
- Verify poor-network/offline behaviour for changed PWA workflows.
- Confirm rollback path to the previous known-good release.
- After deployment, run production smoke checks and inspect service/auth/database logs for unexpected errors.

## Current release blockers

Until configured, the following are explicit blockers rather than silent skips:

- Two isolated test tenants/users and their GitHub Actions secrets for authenticated cross-tenant testing.
- Supabase leaked-password protection should be enabled at the Auth project level.

## Ongoing engineering practices

- Dependabot reviews dependencies weekly.
- CodeQL scans source on main, pull requests and weekly schedule.
- Nightly assurance exercises production health/security/load behaviour.
- Periodically run longer soak tests, restore drills, browser/device checks, accessibility audits and incident-response exercises.

This document is a release-control checklist, not a claim of regulatory certification.
