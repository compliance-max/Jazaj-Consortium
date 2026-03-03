import { fail, ok } from "@/lib/http";
import { ensureEmployerActiveForMutation, requirePortalContext } from "@/lib/auth/guard";
import { createTestRequestWithCheckout, listPortalTestRequests } from "@/lib/services/test-requests";
import { portalTestRequestCreateSchema } from "@/lib/validation/test-request";

export async function GET() {
  try {
    const { employer } = await requirePortalContext();
    const requests = await listPortalTestRequests(employer.id);
    return ok({ requests });
  } catch {
    return fail("Unauthorized", 401);
  }
}

export async function POST(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensureEmployerActiveForMutation(employer.status);

    const body = await req.json().catch(() => null);
    const parsed = portalTestRequestCreateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const created = await createTestRequestWithCheckout({
      employerId: employer.id,
      requestedByUserId: user.id,
      customerEmail: user.email || employer.email,
      driverId: parsed.data.driverId || null,
      testType: parsed.data.testType,
      reason: "USER_REQUEST",
      notes: parsed.data.reasonDetail || null
    });

    return ok(created, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    if (error instanceof Error && error.message === "DRIVER_NOT_FOUND") {
      return fail("Driver not found", 404);
    }
    if (process.env.NODE_ENV !== "production") {
      return fail(error instanceof Error ? error.message : "Unauthorized", 401);
    }
    return fail("Unauthorized", 401);
  }
}
