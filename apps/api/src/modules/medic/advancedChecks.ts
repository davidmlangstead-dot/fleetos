import { prisma } from "../../lib/prisma.js";

type MedicCheck = { key: string; label: string; status: "HEALTHY" | "DEGRADED"; detail: string };

type CountRow = { count: bigint };
type SourceRow = { source: string; status: string; lastCheckedAt: Date; lastSuccessAt: Date | null; lastError: string | null; lastItemCount: number };

export async function runAdvancedMedicChecks(companyId: string): Promise<MedicCheck[]> {
  const [stuckDriver, stuckReview, failedEmail, incompleteFleet] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Job"
      WHERE "companyId"=${companyId}
        AND "issuedToDriverAt" IS NOT NULL AND "submittedByDriverAt" IS NULL
        AND "issuedToDriverAt" < NOW()-INTERVAL '12 hours'
        AND status NOT IN ('COMPLETED','CLOSED','CANCELLED')
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Job"
      WHERE "companyId"=${companyId}
        AND "submittedByDriverAt" IS NOT NULL AND "officeApprovedAt" IS NULL
        AND "submittedByDriverAt" < NOW()-INTERVAL '24 hours'
        AND status NOT IN ('CLOSED','CANCELLED')
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Job"
      WHERE "companyId"=${companyId}
        AND "reportEmailStatus" IS NOT NULL
        AND lower("reportEmailStatus") IN ('failed','error','bounced','rejected')
        AND "updatedAt" > NOW()-INTERVAL '30 days'
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Vehicle"
      WHERE "companyId"=${companyId} AND status='ACTIVE'
        AND type IN ('TRUCK','VAN')
        AND ("motDue" IS NULL OR "insuranceDue" IS NULL)
    `,
  ]);

  const driverCount = Number(stuckDriver[0]?.count ?? 0n);
  const reviewCount = Number(stuckReview[0]?.count ?? 0n);
  const emailCount = Number(failedEmail[0]?.count ?? 0n);
  const fleetCount = Number(incompleteFleet[0]?.count ?? 0n);
  const checks: MedicCheck[] = [
    { key: "job-driver-flow", label: "Driver job flow", status: driverCount ? "DEGRADED" : "HEALTHY", detail: driverCount ? `${driverCount} issued job${driverCount === 1 ? " has" : "s have"} waited over 12 hours for driver submission.` : "No issued jobs are stuck waiting for driver submission." },
    { key: "job-office-review", label: "Office job review", status: reviewCount ? "DEGRADED" : "HEALTHY", detail: reviewCount ? `${reviewCount} submitted job${reviewCount === 1 ? " has" : "s have"} waited over 24 hours for office approval.` : "No submitted jobs are stuck waiting for office review." },
    { key: "report-delivery", label: "Customer report delivery", status: emailCount ? "DEGRADED" : "HEALTHY", detail: emailCount ? `${emailCount} report email${emailCount === 1 ? " has" : "s have"} failed, bounced or been rejected in the last 30 days.` : "No recent report-email delivery failures were found." },
    { key: "fleet-data-integrity", label: "Fleet data integrity", status: fleetCount ? "DEGRADED" : "HEALTHY", detail: fleetCount ? `${fleetCount} active truck/van record${fleetCount === 1 ? " is" : "s are"} missing MOT or insurance due dates.` : "Active truck/van records have MOT and insurance due dates." },
  ];

  try {
    const rows = await prisma.$queryRaw<SourceRow[]>`
      SELECT source,status,"lastCheckedAt","lastSuccessAt","lastError","lastItemCount"
      FROM "ComplianceIntelligenceSource" ORDER BY source
    `;
    const degraded = rows.filter((row) => row.status !== "HEALTHY");
    const stale = rows.filter((row) => Date.now() - row.lastCheckedAt.getTime() > 12 * 60 * 60 * 1000);
    checks.push({
      key: "compliance-intelligence",
      label: "DVSA / RHA / FORS / CLOCS intelligence",
      status: rows.length >= 3 && degraded.length === 0 && stale.length === 0 ? "HEALTHY" : "DEGRADED",
      detail: rows.length ? `${rows.length}/4 sources checked; ${degraded.length} degraded and ${stale.length} stale.` : "Compliance intelligence has not completed its first sweep yet.",
    });
  } catch {
    checks.push({ key: "compliance-intelligence", label: "DVSA / RHA / FORS / CLOCS intelligence", status: "DEGRADED", detail: "Compliance intelligence storage is not available yet." });
  }
  return checks;
}
