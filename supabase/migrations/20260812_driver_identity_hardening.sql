-- FleetOS driver identity hardening.
-- Idempotent copy of the production migration applied through Supabase.

ALTER TABLE public."Driver" ADD COLUMN IF NOT EXISTS "personId" text NULL;

UPDATE public."Driver" d
SET "personId" = p.id
FROM public."Person" p
WHERE d."personId" IS NULL
  AND p.id = d.id
  AND p."companyId" = d."companyId";

CREATE UNIQUE INDEX IF NOT EXISTS "Driver_personId_key" ON public."Driver"("personId") WHERE "personId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Driver_companyId_personId_idx" ON public."Driver"("companyId", "personId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Driver_personId_fkey') THEN
    ALTER TABLE public."Driver"
      ADD CONSTRAINT "Driver_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public."fleetos_set_driver_person_link"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."personId" IS NULL AND EXISTS (
    SELECT 1 FROM public."Person" p WHERE p.id = NEW.id AND p."companyId" = NEW."companyId"
  ) THEN
    NEW."personId" := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Driver_set_person_link" ON public."Driver";
CREATE TRIGGER "Driver_set_person_link"
BEFORE INSERT OR UPDATE OF id, "companyId", "personId" ON public."Driver"
FOR EACH ROW EXECUTE FUNCTION public."fleetos_set_driver_person_link"();

CREATE OR REPLACE FUNCTION public."fleetos_sync_user_email_to_staff"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public."Person"
      SET email = NEW.email, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = NEW.id;

    UPDATE public."Driver" d
      SET email = NEW.email, "updatedAt" = CURRENT_TIMESTAMP
      FROM public."Person" p
      WHERE p."userId" = NEW.id
        AND p."companyId" = d."companyId"
        AND (d."personId" = p.id OR d.id = p.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "User_sync_email_to_staff" ON public."User";
CREATE TRIGGER "User_sync_email_to_staff"
AFTER UPDATE OF email ON public."User"
FOR EACH ROW EXECUTE FUNCTION public."fleetos_sync_user_email_to_staff"();

REVOKE ALL ON TABLE public."Driver" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Person" FROM anon, authenticated;
REVOKE ALL ON FUNCTION public."fleetos_set_driver_person_link"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."fleetos_sync_user_email_to_staff"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."fleetos_set_driver_person_link"() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public."fleetos_sync_user_email_to_staff"() TO postgres, service_role;
