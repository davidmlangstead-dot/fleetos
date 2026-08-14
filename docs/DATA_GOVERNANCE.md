# FleetOS Data Governance Baseline

This document defines engineering rules for handling tenant and personal data. It is an operational baseline, not legal advice or a claim of regulatory certification.

## Principles

- Tenant data must be scoped to the active company at every application boundary.
- Collect only data required for a defined operational purpose.
- Production data must not be copied into development/test environments unless explicitly sanitized and approved.
- Secrets, access tokens, passwords, password hashes, full authorization headers, and reset/invite tokens must never be written to application logs.
- Compliance documents, licences, personnel records, incident records and similar personal information are sensitive even when they are operationally necessary.

## Access

- Authentication proves identity; company membership proves tenant access; role checks prove permission for the requested action.
- Platform/admin privileges must not be used as a substitute for ordinary tenant membership in customer-facing flows.
- Changes that widen access require explicit review and role/tenant regression tests.

## Logging

Logs should contain enough information to investigate failures without becoming a secondary customer-data store. Prefer request IDs, company/user IDs, route names, status codes and error categories over raw request bodies. Redact secrets and sensitive document contents.

## Exports

Tenant exports must be authorized for the active company and generated without cross-tenant joins or shared temporary locations. Export generation and retrieval should be auditable. Temporary exports should have a defined expiry/removal mechanism before broad commercial launch.

## Deletion and retention

Deletion requests must identify the tenant, subject/scope, requester, authority to request deletion, records affected, legal/operational holds, execution time and outcome. Do not promise immediate hard deletion where records must be retained for a legitimate legal/operational reason; document the applicable policy instead.

A commercial launch must define retention periods for at least:

- authentication/audit records;
- personnel records;
- driver and vehicle compliance records;
- defects/maintenance/incident records;
- messages and attachments;
- generated exports/backups;
- marketplace content;
- operational logs.

## Backups

Backup retention is distinct from live-data retention. Deletion from the live database does not necessarily erase historical backup copies immediately. Backup handling and restore procedures must prevent a restore from silently resurrecting deleted data without reconciliation.

## Incident handling

Suspected cross-tenant disclosure or unauthorized personal-data access is a SEV-1 incident under `docs/INCIDENT_RESPONSE.md`. Preserve evidence and determine affected tenants/subjects before making unsupported statements about impact.

## Pre-launch evidence

Before unrestricted commercial launch, retain evidence that authenticated tenant isolation, role restrictions, export/deletion workflows, storage access controls and backup/restore procedures have been tested against production-equivalent configuration.
