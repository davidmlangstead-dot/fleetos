-- Keep visit and timeline constraints aligned with the job lifecycle exposed by the API.

ALTER TABLE public."JobVisit" DROP CONSTRAINT IF EXISTS "JobVisit_status_check";
ALTER TABLE public."JobVisit" ADD CONSTRAINT "JobVisit_status_check" CHECK (status IN (
  'DRAFT','PLANNED','ASSIGNED','SCHEDULED','DISPATCHED','TRAVELLING','ON_SITE',
  'IN_PROGRESS','PAUSED','DELIVERED','COMPLETED','COMPLETED_ISSUES','CLOSED','CANCELLED'
));

ALTER TABLE public."JobTimelineEntry" DROP CONSTRAINT IF EXISTS "JobTimelineEntry_type_check";
ALTER TABLE public."JobTimelineEntry" ADD CONSTRAINT "JobTimelineEntry_type_check" CHECK (type IN (
  'CREATED','STATUS','NOTE','CUSTOMER','SCHEDULE','ASSIGNMENT','WORKSHEET','RISK',
  'SIGNATURE','COST','DOCUMENT','SYSTEM','ISSUED','SUBMITTED','APPROVED','REPORT','EMAIL'
));
