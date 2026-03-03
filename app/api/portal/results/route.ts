import { fail, ok } from "@/lib/http";
import { requirePortalContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const { employer } = await requirePortalContext();
    const results = await prisma.testRequest.findMany({
      where: {
        employerId: employer.id,
        resultStatus: {
          not: "PENDING"
        }
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [{ resultReportedAt: "desc" }, { id: "desc" }]
    });

    return ok({ results });
  } catch {
    return fail("Unauthorized", 401);
  }
}
