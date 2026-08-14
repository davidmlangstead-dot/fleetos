import fs from "node:fs";

const path = "supabase/functions/create-staff/index.ts";
const source = fs.readFileSync(path, "utf8");

const checks = [
  ["tracks only memberships created by the request", /let\s+createdMembershipId:\s*string\s*\|\s*null\s*=\s*null/],
  ["captures the inserted membership id", /\.from\("CompanyMembership"\)\.insert\([\s\S]*?\.select\("id"\)\.single\(\)/],
  ["stores created membership id after successful insert", /createdMembershipId\s*=\s*createdMembership\.id/],
  ["rolls back only when a membership was created", /if\s*\(createdMembershipId\)\s*\{/],
  ["deletes the created membership during failure cleanup", /\.from\("CompanyMembership"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id",\s*createdMembershipId\)[\s\S]*?\.eq\("companyId",\s*companyId\)/],
  ["preserves existing membership path", /if\s*\(!existingMembership\)\s*\{/],
];

let failed = false;
for (const [label, pattern] of checks) {
  if (!pattern.test(source)) {
    console.error(`FAIL: ${label}`);
    failed = true;
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failed) process.exit(1);
console.log("Staff rollback contract passed.");
