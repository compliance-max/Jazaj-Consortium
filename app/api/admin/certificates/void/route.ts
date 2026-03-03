import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { voidEnrollmentCertificate } from "@/lib/services/certificates";

const schema = z.object({
  certificateId: z.string().min(1),
  reason: z.string().min(10).max(500)
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const certificate = await voidEnrollmentCertificate({
      certificateId: parsed.data.certificateId,
      reason: parsed.data.reason,
      actorUserId: actor.id
    });
    return ok({ certificate });
  } catch (error) {
    if (error instanceof Error && error.message === "CERTIFICATE_NOT_FOUND") return fail("Not found", 404);
    return fail("Forbidden", 403);
  }
}
