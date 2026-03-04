import { fail, ok } from "@/lib/http";
import { ensureEmployerActiveForMutation, ensurePortalWriteAccess, requirePortalContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { normalizePortalCompanyUpdateInput, portalCompanyUpdateSchema } from "@/lib/validation/employer";

export async function GET() {
  try {
    const { employer } = await requirePortalContext();
    const company = await prisma.employer.findUnique({
      where: { id: employer.id },
      include: {
        activePool: {
          select: {
            id: true,
            type: true,
            dotAgency: true,
            cadence: true,
            timezone: true
          }
        },
        certificates: {
          where: {
            status: "ACTIVE"
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            document: {
              select: {
                id: true,
                filename: true
              }
            }
          }
        }
      }
    });
    return ok({ employer: company });
  } catch {
    return fail("Unauthorized", 401);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensurePortalWriteAccess(user.role);
    ensureEmployerActiveForMutation(employer.status);

    const body = await req.json().catch(() => null);
    const parsed = portalCompanyUpdateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const input = normalizePortalCompanyUpdateInput(parsed.data);
    if (input.poolMode) {
      return fail("Pool mode changes are admin-only", 403);
    }

    const updated = await prisma.employer.update({
      where: { id: employer.id },
      data: {
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {})
      },
      include: {
        activePool: {
          select: {
            id: true,
            type: true,
            dotAgency: true,
            cadence: true,
            timezone: true
          }
        }
      }
    });

    return ok({ employer: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return fail("Forbidden", 403);
    }
    return fail("Unauthorized", 401);
  }
}
