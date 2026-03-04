import { fail, ok } from "@/lib/http";
import { ensureEmployerActiveForMutation, ensurePortalWriteAccess, requirePortalContext } from "@/lib/auth/guard";
import { createCheckoutForExistingPendingRequest } from "@/lib/services/test-requests";
import { testRequestCheckoutSchema } from "@/lib/validation/test-request";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { user, employer } = await requirePortalContext();
    ensurePortalWriteAccess(user.role);
    ensureEmployerActiveForMutation(employer.status);
    const body = await req.json().catch(() => ({}));
    const parsed = testRequestCheckoutSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const checkout = await createCheckoutForExistingPendingRequest({
      requestId: ctx.params.id,
      employerId: employer.id,
      customerEmail: user.email || employer.email,
      promoCode: parsed.data.promoCode || null
    });
    return ok(checkout);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") return fail("Employer is inactive", 403);
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") return fail("Not found", 404);
    if (error instanceof Error && error.message === "REQUEST_NOT_PENDING_PAYMENT") {
      return fail("Request is not pending payment", 409);
    }
    return fail("Unauthorized", 401);
  }
}
