# FleetOS Incident Response

This runbook is for production incidents affecting confidentiality, integrity, availability, authentication, tenant isolation, or customer operations.

## Severity

- **SEV-1:** suspected cross-tenant data exposure, credential/secret compromise, destructive data loss, or widespread inability to operate.
- **SEV-2:** major feature outage, repeated auth failures, serious performance degradation, or security control failure without confirmed exposure.
- **SEV-3:** limited degradation with a safe workaround and no evidence of data exposure.

## First response

1. Record UTC start time, reporter, affected service, deploy SHA, symptoms, and known customer impact.
2. Preserve evidence. Do not delete logs or rotate credentials until the relevant identifiers and timestamps are recorded.
3. For suspected tenant leakage or secret compromise, treat as SEV-1 until disproven.
4. Stop risky change activity. Prefer rollback to the last known-good revision over live experimentation.
5. Verify API `/health`, web availability, Supabase status, auth behaviour, and the current Render/Vercel deployment revisions.

## Containment

- **Bad application deploy:** roll back to the last verified revision; rerun production smoke and security perimeter checks.
- **Auth outage:** do not clear valid client sessions merely because a downstream dependency is failing; verify Supabase Auth independently.
- **Tenant isolation concern:** block the affected route or feature if necessary, preserve request/audit logs, and test A→B and B→A access before reopening.
- **Secret exposure:** identify every consumer, replace the secret in controlled backend stores, deploy consumers, verify, then revoke the old secret.
- **Database/data integrity concern:** stop destructive writes where possible; capture affected IDs and timestamps before remediation.

## Recovery checks

Before declaring recovery:

- production smoke passes;
- security perimeter passes;
- build/dependency/PWA/bundle gates pass for the deployed SHA;
- if tenant/auth related, authenticated isolation tests pass with two real tenants;
- affected customer workflow is manually exercised end to end;
- monitoring/logs show no continuing error spike.

## Communication

For customer-impacting incidents, communicate facts only: what is affected, what users should avoid or can continue doing, whether data exposure is suspected/confirmed, and when the status materially changes. Do not make unsupported compliance or security claims.

## After the incident

Within the engineering record capture: timeline, root cause, contributing factors, customer impact, data impact, detection gap, recovery actions, and concrete prevention work. Convert prevention items into tracked code/config/test changes; do not close on documentation alone when an automated guard can be added.
