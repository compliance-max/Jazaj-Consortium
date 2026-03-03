import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { assignClinicSchema } from "@/lib/validation/test-request";
import { assignClinicToRequest } from "@/lib/services/test-requests";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = assignClinicSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const updated = await assignClinicToRequest({
      requestId: ctx.params.id,
      clinicId: parsed.data.clinicId,
      actorUserId: actor.id
    });
    return ok({ request: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") return fail("Request not found", 404);
    if (error instanceof Error && error.message === "REQUEST_NOT_PAID") return fail("Request is unpaid", 409);
    if (error instanceof Error && error.message === "CLINIC_NOT_FOUND") return fail("Clinic not found", 404);
    return fail("Forbidden", 403);
  }
}
