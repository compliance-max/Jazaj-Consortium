import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

function quarterStart(date = new Date()) {
  const quarter = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1, 0, 0, 0, 0));
}

export async function GET() {
  try {
    await requireAdminOrManager();

    const now = new Date();
    const thisQuarterStart = quarterStart(now);
    const lastQuarterStart = new Date(thisQuarterStart);
    lastQuarterStart.setUTCMonth(thisQuarterStart.getUTCMonth() - 3);
    const renewalWindowEnd = new Date(now);
    renewalWindowEnd.setUTCDate(renewalWindowEnd.getUTCDate() + 30);

    const [
      activeEmployers,
      renewalDueSoon,
      unpaidTestRequests,
      paidUnassignedClinic,
      resultsPending,
      chatsOpen,
      randomRunsLastQuarter,
      lastRandomRun
    ] = await Promise.all([
      prisma.employer.count({ where: { status: "ACTIVE" } }),
      prisma.employer.count({
        where: {
          status: "ACTIVE",
          renewalDueDate: {
            gte: now,
            lte: renewalWindowEnd
          }
        }
      }),
      prisma.testRequest.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.testRequest.count({
        where: {
          paid: true,
          clinicId: null,
          status: { in: ["REQUESTED", "SCHEDULED"] }
        }
      }),
      prisma.testRequest.count({
        where: {
          resultStatus: "PENDING",
          status: { in: ["REQUESTED", "SCHEDULED", "COMPLETED"] }
        }
      }),
      prisma.chatConversation.count({ where: { status: "OPEN" } }),
      prisma.randomSelectionEvent.count({
        where: {
          runAt: {
            gte: lastQuarterStart,
            lt: thisQuarterStart
          }
        }
      }),
      prisma.randomSelectionEvent.findFirst({
        orderBy: { runAt: "desc" },
        select: {
          id: true,
          runAt: true,
          selectedCountDrug: true,
          selectedCountAlcohol: true
        }
      })
    ]);

    return ok({
      activeEmployers,
      renewalDueSoon,
      unpaidTestRequests,
      paidUnassignedClinic,
      resultsPending,
      chatsOpen,
      randomRunsLastQuarter,
      lastRandomRun: lastRandomRun
        ? {
            id: lastRandomRun.id,
            runAt: lastRandomRun.runAt.toISOString(),
            selectedTotal: lastRandomRun.selectedCountDrug + lastRandomRun.selectedCountAlcohol
          }
        : null,
      generatedAt: now.toISOString()
    });
  } catch {
    return fail("Forbidden", 403);
  }
}
