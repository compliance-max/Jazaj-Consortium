import { fail, ok } from "@/lib/http";
import { requirePortalContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  try {
    const { employer } = await requirePortalContext();
    if (!employer.activePoolId) return ok({ events: [] });

    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : undefined;

    const events = await prisma.randomSelectionEvent.findMany({
      where: {
        poolId: employer.activePoolId,
        ...(year ? { randomPeriod: { year } } : {})
      },
      include: {
        randomPeriod: true,
        selectedDrivers: {
          where: {
            employerId: employer.id
          },
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            testRequest: {
              include: {
                clinic: true
              }
            }
          },
          orderBy: {
            driver: {
              lastName: "asc"
            }
          }
        }
      },
      orderBy: [{ runAt: "desc" }]
    });

    return ok({ events });
  } catch {
    return fail("Unauthorized", 401);
  }
}
