-- Multi-trade field roles and skills used by flexible job allocation.

ALTER TABLE public."Person" DROP CONSTRAINT IF EXISTS "Person_personType_check";
ALTER TABLE public."Person" ADD CONSTRAINT "Person_personType_check" CHECK ("personType" IN (
  'DRIVER','ENGINEER','TECHNICIAN','OPERATIVE','SUBCONTRACTOR','OFFICE','WORKSHOP','SUPERVISOR','MANAGER','ADMIN'
));
ALTER TABLE public."Person" ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."Person" DROP CONSTRAINT IF EXISTS "Person_skills_check";
ALTER TABLE public."Person" ADD CONSTRAINT "Person_skills_check" CHECK (jsonb_typeof(skills)='array');

COMMENT ON COLUMN public."Person".skills IS 'Company-defined trades, certifications and competencies used during job allocation.';
