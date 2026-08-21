-- Allow an office person record to carry the read-only Finance app role.

ALTER TABLE public."Person" DROP CONSTRAINT IF EXISTS "Person_accessRole_check";
ALTER TABLE public."Person" ADD CONSTRAINT "Person_accessRole_check" CHECK ("accessRole" IN (
  'DRIVER','OFFICE','WORKSHOP','SUPERVISOR','MANAGER','ADMIN','FINANCE'
));

