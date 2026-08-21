import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260821095918_repair_fleet_document_storage_access.sql", import.meta.url),
  "utf8",
);

function requireText(text, message) {
  if (!migration.includes(text)) {
    console.error(`FAIL storage policy contract: ${message}`);
    process.exit(1);
  }
}

requireText("security definer", "tenant lookup helper must have the deliberate privileged execution mode");
requireText("set search_path = ''", "privileged helper must use an empty search path");
requireText("(select auth.uid()) is not null", "privileged helper must reject unauthenticated callers");
requireText('u."authUserId" = (select auth.uid())', "helper must bind membership to the authenticated identity");
requireText("(storage.foldername(object_name))[1]", "helper must bind access to the company folder");
requireText("revoke all on function private.staff_can_access_fleet_storage(text, boolean) from public, anon", "helper must not be callable by public or anonymous roles");
requireText("grant execute on function private.staff_can_access_fleet_storage(text, boolean) to authenticated", "authenticated storage policies need explicit helper access");
requireText("private.staff_can_access_fleet_storage(name, false)", "read policy must call the scoped helper");
requireText("private.staff_can_access_fleet_storage(name, true)", "write policies must call the scoped helper");
requireText("with check", "update and insert policies need write-time checks");

if (/grant\s+(?:select|all).*CompanyMembership.*authenticated/is.test(migration)) {
  console.error("FAIL storage policy contract: migration reopens CompanyMembership to browser roles");
  process.exit(1);
}

console.log("PASS storage policy contract: private tenant lookup repairs storage without reopening business tables.");
