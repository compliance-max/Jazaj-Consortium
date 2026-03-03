import { fail, ok } from "@/lib/http";
import { requirePortalContext } from "@/lib/auth/guard";
import { listComplianceSummaries } from "@/lib/services/random/compliance";

function currentYear() {
  return new Date().getUTCFullYear();
}

export async function GET() {
  try {
    const { employer } = await requirePortalContext();
    const year = currentYear();
    const summaries = await listComplianceSummaries({
      year,
      employerId: employer.id
    });

    const employerSummary =
      summaries.find((row) => row.employerId === employer.id) ||
      summaries.find((row) => row.employerId === null) ||
      null;

    return ok({
      year,
      employer: {
        id: employer.id,
        legalName: employer.legalName,
        status: employer.status,
        renewalDueDate: employer.renewalDueDate
      },
      compliance: employerSummary
        ? {
            avgCoveredDrivers: employerSummary.avgCoveredDrivers,
            requiredDrug: employerSummary.requiredDrug,
            completedDrug: employerSummary.completedDrug,
            remainingDrug: Math.max(0, employerSummary.requiredDrug - employerSummary.completedDrug),
            requiredAlcohol: employerSummary.requiredAlcohol,
            completedAlcohol: employerSummary.completedAlcohol,
            remainingAlcohol: Math.max(0, employerSummary.requiredAlcohol - employerSummary.completedAlcohol)
          }
        : null
    });
  } catch {
    return fail("Unauthorized", 401);
  }
}
