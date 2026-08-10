# FleetOS UK Compliance Baseline

## Purpose

FleetOS is a fleet-management and compliance-support product for UK operators. This baseline defines the compliance domains the product must support. It is a product/control framework, not legal advice or a certification that an operator is compliant.

## Authority hierarchy

1. UK legislation and current official government guidance.
2. Traffic Commissioner / DVSA requirements and operator-licence undertakings.
3. Applicable sector/scheme requirements such as FORS and CLOCS.
4. RHA guidance and industry best practice as an enhanced operational layer.

Where sources conflict, FleetOS must not silently choose an interpretation. The requirement should be flagged for review and the source/version recorded.

## Core compliance domains

### Operator and licence

- Operator licence details and status.
- Licence type and authorised vehicle details.
- Operating centres and relevant limits/conditions.
- Transport manager details and responsibilities.
- Licence undertakings and review dates.
- Financial-standing evidence/reminders where applicable.
- Insurance and supporting operator documents.

### Vehicles and trailers

- Vehicle identity and registration.
- MOT/test status where applicable.
- Planned safety inspections.
- Inspection intervals and evidence.
- Defect reporting, categorisation and closure.
- Maintenance and repair records.
- Brake-test records where applicable.
- Tachograph calibration where applicable.
- Roadworthiness evidence.
- Tax and insurance reminders.
- Vehicle status: available, off-road, restricted or retired.

### Drivers

- Driving licence details and entitlement checks.
- Driver CPC/DCPC evidence where applicable.
- Tachograph card details where applicable.
- Medical/fitness evidence where applicable.
- Training and competence records.
- Driver induction and policy acknowledgement.
- Driver status and review dates.

### Drivers' hours and working time

- Tachograph data/evidence tracking where applicable.
- Download schedules and missing-data alerts.
- Drivers' hours infringement records.
- Working-time records where applicable.
- Review/audit history.

### Daily operations

- Daily/pre-use walkaround checks.
- Defect capture with photographs/evidence.
- Vehicle defect escalation.
- Vehicle release/return-to-service workflow.
- Driver/job/vehicle allocation checks.
- Load/weight evidence where applicable.

### Documents and evidence

Every compliance record should support:

- Source document/evidence.
- Issue date.
- Expiry/review date where applicable.
- Responsible person.
- Status.
- Notes.
- Version/history.
- Upload/audit timestamp.
- Link to the relevant company, driver, vehicle or job.

## FleetOS status model

The UI should distinguish at least:

- **GREEN** — current/complete.
- **AMBER** — due soon, review required, or evidence incomplete.
- **RED** — overdue, failed, expired, or otherwise requires immediate action.
- **BLOCKED** — an operational control prevents dispatch/use until an authorised person resolves it.
- **NOT APPLICABLE** — requirement does not apply to this operator/vehicle/driver.

A compliance status must always retain the reason and the underlying evidence rather than being a manually editable colour.

## Audit principle

FleetOS should preserve an immutable-style history of material compliance events: who performed the action, what changed, when it changed, the reason, and supporting evidence. Users should not be able to erase an audit history simply by deleting the current record.

## Rule versioning

Compliance rules must be versioned. Each automated check should record:

- rule identifier;
- authority/source;
- source publication/update date;
- FleetOS rule version;
- effective date;
- review date;
- applicability conditions;
- resulting status/reason.

This is required because official guidance and scheme requirements can change.

## Product safety boundary

FleetOS assists operators in organising records, workflows, reminders and evidence. It must not claim that an operator is legally compliant solely because the dashboard is green. Where a legal interpretation or applicability decision is uncertain, the product should direct the operator to obtain appropriate professional advice.

## Initial implementation priority

P0: authentication, tenant isolation and reliable company membership.

P0: vehicle/driver/defect records and audit-safe evidence model.

P1: operator licence and operating-centre records.

P1: safety inspection and maintenance workflows.

P1: driver licence/CPC/training checks.

P1: compliance dashboard with calculated statuses.

P2: tachograph/drivers-hours evidence and infringement workflows.

P2: FORS/CLOCS/RHA enhanced checklists where applicable.

P2: configurable compliance rule engine with versioned sources.
