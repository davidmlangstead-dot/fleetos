# API modules

Each module owns its HTTP routes, validation, services and persistence mapping. New modules should not import another module’s Prisma models directly; expose a service or domain event instead.

| Module | Responsibility |
| --- | --- |
| `dashboard` | Role-aware operational summaries |
| `vehicles` | Vehicle and trailer record, lifecycle and costs |
| `drivers` | Driver profile, credentials and assignment |
| `jobs` | Planning, assignments, delivery status and POD |
| `workshop` | Repairs, inspections, parts and labour |
| `compliance` | Expiry tracking and reminders |
| `documents` | Metadata and Supabase Storage integration |
| `messaging` | Record-linked conversations and realtime delivery |
| `marketplace` | Opt-in cross-company listings |
| `notifications` | In-app, push and email delivery |
| `reporting` | Read models and scheduled aggregates |
