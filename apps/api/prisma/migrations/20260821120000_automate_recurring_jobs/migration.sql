CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "recurringJobId" uuid,
  ADD COLUMN IF NOT EXISTS "recurringDueAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "Job_companyId_recurringJobId_recurringDueAt_key"
  ON "Job" ("companyId", "recurringJobId", "recurringDueAt")
  WHERE "recurringJobId" IS NOT NULL AND "recurringDueAt" IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS fleet_private;

CREATE OR REPLACE FUNCTION fleet_private.next_recurring_due(
  current_due timestamptz,
  frequency text,
  interval_value integer
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE frequency
    WHEN 'WEEKLY' THEN current_due + make_interval(days => 7 * GREATEST(interval_value, 1))
    WHEN 'FORTNIGHTLY' THEN current_due + make_interval(days => 14 * GREATEST(interval_value, 1))
    WHEN 'MONTHLY' THEN current_due + make_interval(months => GREATEST(interval_value, 1))
    WHEN 'QUARTERLY' THEN current_due + make_interval(months => 3 * GREATEST(interval_value, 1))
    WHEN 'SIX_MONTHLY' THEN current_due + make_interval(months => 6 * GREATEST(interval_value, 1))
    WHEN 'YEARLY' THEN current_due + make_interval(months => 12 * GREATEST(interval_value, 1))
    ELSE current_due + make_interval(days => GREATEST(interval_value, 1))
  END
$$;

CREATE OR REPLACE FUNCTION fleet_private.generate_due_recurring_jobs(
  run_at timestamptz DEFAULT now(),
  only_company_id text DEFAULT NULL
) RETURNS TABLE("recurringJobId" uuid, "jobId" text, "dueAt" timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  recurring_row record;
  type_row record;
  customer_row record;
  site_row record;
  generated_due timestamptz;
  next_due timestamptz;
  generated_job_id text;
  generated_reference text;
  generated_status text;
  duration_minutes integer;
  generated_driver_id text;
  person_id text;
  generated_count integer;
BEGIN
  FOR recurring_row IN
    SELECT r.*
    FROM public."RecurringJob" r
    WHERE r."isActive" = true
      AND r."nextDueAt" <= run_at
      AND (only_company_id IS NULL OR r."companyId" = only_company_id)
    ORDER BY r."nextDueAt"
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT jt.* INTO type_row
    FROM public."JobType" jt
    WHERE jt."companyId" = recurring_row."companyId"
      AND jt."isActive" = true
      AND (jt.id = recurring_row."jobTypeId" OR recurring_row."jobTypeId" IS NULL)
    ORDER BY (jt.id = recurring_row."jobTypeId") DESC, jt."isSystem" DESC, jt.name
    LIMIT 1;

    IF type_row.id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT c.* INTO customer_row
    FROM public."Customer" c
    WHERE c.id = recurring_row."customerId"
      AND c."companyId" = recurring_row."companyId"
      AND c."isActive" = true;

    IF customer_row.id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT s.* INTO site_row
    FROM public."CustomerSite" s
    WHERE s.id = recurring_row."siteId"
      AND s."companyId" = recurring_row."companyId"
      AND s."customerId" = recurring_row."customerId"
      AND s."isActive" = true;

    generated_due := recurring_row."nextDueAt";
    generated_count := 0;

    WHILE generated_due <= run_at AND generated_count < 12 LOOP
      duration_minutes := COALESCE(recurring_row."estimatedDurationMinutes", type_row."defaultDurationMinutes", 60);
      generated_job_id := gen_random_uuid()::text;
      generated_reference := 'JOB-' || to_char(generated_due AT TIME ZONE 'Europe/London', 'YYMMDD') || '-' || upper(substr(replace(generated_job_id, '-', ''), 1, 4));
      generated_status := 'SCHEDULED';
      generated_driver_id := NULL;

      SELECT d.id INTO generated_driver_id
      FROM jsonb_array_elements_text(COALESCE(recurring_row."defaultPersonIds", '[]'::jsonb)) selected(id)
      JOIN public."Person" p ON p.id = selected.id AND p."companyId" = recurring_row."companyId" AND p."isActive" = true
      JOIN public."Driver" d ON d."companyId" = p."companyId" AND lower(d.email) = lower(p.email) AND d."isActive" = true
      LIMIT 1;

      INSERT INTO public."Job" (
        id,"companyId","jobTypeId","jobNumber",title,description,priority,source,
        "customerId","siteId","assetId","customerName","collectionAddress","collectionPostcode",
        "scheduledStart","scheduledEnd","dueAt","collectionDateTime","deliveryDateTime","estimatedDurationMinutes",
        "contactName","contactPhone","contactEmail","customFields","workflowSnapshot","worksheetSchema",
        "worksheetResponses","riskAssessment","customerSignature","vehicleId","driverId",instructions,status,
        "recurringJobId","recurringDueAt","createdAt","updatedAt"
      ) VALUES (
        generated_job_id,recurring_row."companyId",type_row.id,generated_reference,recurring_row.title,recurring_row.description,
        type_row."defaultPriority",'PLANNED',recurring_row."customerId",site_row.id,recurring_row."assetId",customer_row.name,
        site_row.address,site_row.postcode,generated_due,generated_due + make_interval(mins => duration_minutes),generated_due,
        generated_due,generated_due + make_interval(mins => duration_minutes),duration_minutes,site_row."contactName",site_row."contactPhone",
        site_row."contactEmail",jsonb_build_object('recurringTemplateId', recurring_row.id, 'automaticallyGenerated', true),
        type_row.workflow,type_row."formSchema",'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        CASE WHEN EXISTS (SELECT 1 FROM public."Vehicle" v WHERE v.id = recurring_row."defaultVehicleId" AND v."companyId" = recurring_row."companyId" AND v.status <> 'ARCHIVED') THEN recurring_row."defaultVehicleId" ELSE NULL END,
        generated_driver_id,recurring_row.description,generated_status::public."JobStatus",recurring_row.id,generated_due,now(),now()
      ) ON CONFLICT ("companyId", "recurringJobId", "recurringDueAt") WHERE "recurringJobId" IS NOT NULL AND "recurringDueAt" IS NOT NULL DO NOTHING;

      IF FOUND THEN
        INSERT INTO public."JobVisit" ("companyId","jobId",sequence,title,status,"scheduledStart","scheduledEnd")
        VALUES (recurring_row."companyId",generated_job_id,1,'Recurring visit',generated_status,generated_due,generated_due + make_interval(mins => duration_minutes));

        FOR person_id IN
          SELECT p.id
          FROM jsonb_array_elements_text(COALESCE(recurring_row."defaultPersonIds", '[]'::jsonb)) selected(id)
          JOIN public."Person" p ON p.id = selected.id AND p."companyId" = recurring_row."companyId" AND p."isActive" = true
        LOOP
          INSERT INTO public."JobAssignment" ("companyId","jobId","personId",role,status)
          VALUES (recurring_row."companyId",generated_job_id,person_id,'ASSIGNEE','ASSIGNED');
        END LOOP;

        INSERT INTO public."JobTimelineEntry" ("companyId","jobId",type,summary,detail,metadata,"createdById")
        VALUES (
          recurring_row."companyId",generated_job_id,'CREATED','Job automatically created from recurring work',recurring_row.description,
          jsonb_build_object('recurringTemplateId', recurring_row.id, 'dueAt', generated_due),recurring_row."createdById"
        );

        "recurringJobId" := recurring_row.id;
        "jobId" := generated_job_id;
        "dueAt" := generated_due;
        RETURN NEXT;
      END IF;

      next_due := fleet_private.next_recurring_due(generated_due, recurring_row.frequency, recurring_row."intervalValue");
      generated_due := next_due;
      generated_count := generated_count + 1;
    END LOOP;

    UPDATE public."RecurringJob"
    SET "lastGeneratedAt" = run_at, "nextDueAt" = generated_due, "updatedAt" = now()
    WHERE id = recurring_row.id AND "companyId" = recurring_row."companyId";
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION fleet_private.next_recurring_due(timestamptz,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet_private.generate_due_recurring_jobs(timestamptz,text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'fleetos-recurring-job-generation' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
  PERFORM cron.schedule(
    'fleetos-recurring-job-generation',
    '15 * * * *',
    'SELECT * FROM fleet_private.generate_due_recurring_jobs(now(), NULL);'
  );
END
$$;

