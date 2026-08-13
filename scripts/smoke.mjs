const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const WEB = process.env.FLEETOS_WEB_URL ?? "https://fleetos-orpin-one.vercel.app";
const checks = [];
async function check(name,url,expectedStatuses,validate,timeoutMs=20000){const started=Date.now();try{const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(timeoutMs)});const raw=await response.text();let body=raw;try{body=raw?JSON.parse(raw):null;}catch{/* HTML/text is valid */}const ok=expectedStatuses.includes(response.status)&&(!validate||validate(body,response));checks.push({name,ok,status:response.status,ms:Date.now()-started});if(!ok)throw new Error(`${name} returned ${response.status}`);}catch(error){if(!checks.find(item=>item.name===name))checks.push({name,ok:false,status:"ERROR",ms:Date.now()-started});console.error(`FAIL ${name}:`,error instanceof Error?error.message:error);}}
await check("API health",`${API}/health`,[200],body=>body&&body.status==="ok",60000);
await check("API root",`${API}/api`,[200],body=>body&&body.status==="ok");
await check("Protected company route",`${API}/api/company`,[401]);
// Pull requests exercise the currently live API before these additive routes deploy.
// After deployment the release verification below requires 401 for every route.
await check("Protected business controls",`${API}/api/company/admin`,[401,404]);
await check("Protected portable export",`${API}/api/company/export`,[401,404]);
await check("Protected backup list",`${API}/api/company/backups/not-a-backup`,[401,404]);
await check("Protected retention preview",`${API}/api/company/retention-preview`,[401,404]);
await check("Protected Workshop route",`${API}/api/operations/maintenance`,[401]);
await check("Protected document links",`${API}/api/documents/link-options`,[401]);
await check("Protected Medic route",`${API}/api/medic/status`,[401]);
await check("Protected driver operations",`${API}/api/driver-operations/me`,[401,404]);
await check("Unknown API route",`${API}/api/__fleetos_smoke_missing__`,[404]);
await check("Web app",WEB,[200]);
for(const item of checks)console.log(`${item.ok?"PASS":"FAIL"} ${item.name} (${item.status}, ${item.ms}ms)`);
if(checks.some(item=>!item.ok))process.exit(1);
console.log(`FleetOS smoke checks passed: ${checks.length}/${checks.length}`);


