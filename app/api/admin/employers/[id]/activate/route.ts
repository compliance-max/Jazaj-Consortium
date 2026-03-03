import { UserRole } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth/guard";
import { activateEmployerByAdmin, getEmployerDetail } from "@/lib/services/employers";

const schema = z.object({
  method: z.enum(["MANUAL", "INVOICE", "COMP"]),
  overrideReason: z.string().trim().min(10).max(500)
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireRole([UserRole.CTPA_ADMIN]);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const activated = await activateEmployerByAdmin({
      employerId: ctx.params.id,
      actorUserId: actor.id,
      method: parsed.data.method,
      overrideReason: parsed.data.overrideReason
    });

    const employer = await getEmployerDetail(ctx.params.id);
    return ok({
      employer,
      activation: {
        method: parsed.data.method,
        paymentId: activated.payment.id,
        certificateId: activated.certificate.id
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_NOT_FOUND") {
      return fail("Not found", 404);
    }
    return fail("Forbidden", 403);
  }
}
