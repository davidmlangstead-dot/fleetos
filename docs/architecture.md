# FleetOS architecture

## Tenancy and identity

Supabase Auth is responsible for identity. A `CompanyMembership` selects the tenant context and role for an authenticated user. Every operational query is constrained to this company ID. A user may have memberships in several companies; company switching becomes an explicit authenticated API operation before it is enabled in the interface.

## Module contracts

The web application consumes versioned REST endpoints at `/api`. Each backend module validates its inputs at the route boundary and owns its business logic. Shared types contain permissions and neutral DTOs, not server implementation details. Record-to-record links use IDs and the relevant module service, which avoids accidental cyclic dependencies.

## Recommended delivery order

1. Supabase project, database migration, RLS policies and login/tenant selection.
2. Driver mobile journey: assigned jobs, defect report, POD upload and documents.
3. Planner journey: live jobs, assignment and driver/vehicle availability.
4. Workshop and compliance alerts.
5. Messaging with Supabase Realtime, reporting, then opt-in marketplace.

## Security controls

- Validate Supabase access tokens on the API; never expose a service-role key in the browser.
- Apply equivalent company-bound RLS policies in Supabase to every table and storage bucket.
- Use signed URLs for document access and retain an audit event for status, assignment and document changes.
- Add rate limiting, structured logging and error monitoring at the deployment edge.
