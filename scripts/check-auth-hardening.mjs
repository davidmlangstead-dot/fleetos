import fs from "node:fs";

const auth = fs.readFileSync("apps/api/src/middleware/auth.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const index = fs.readFileSync("apps/web/index.html", "utf8");

const checks = [
  ["confirmed email required", auth.includes("email_confirmed_at")],
  ["tenant selected through membership", auth.includes("userId_companyId") && auth.includes("companyId: membership.companyId")],
  ["authenticated responses are not cached", auth.includes('Cache-Control", "no-store, private')],
  ["inline scripts removed from HTML", !/<script>(.|\n)*?<\/script>/i.test(index)],
  ["CSP disallows inline scripts", vercel.includes("script-src 'self';") && !vercel.includes("script-src 'self' 'unsafe-inline'" )],
  ["cross-origin resource policy enabled", vercel.includes("Cross-Origin-Resource-Policy")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`Auth/browser hardening contract passed: ${checks.length}/${checks.length}`);
