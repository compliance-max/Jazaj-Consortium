import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { regenerateEnrollmentCertificate } from "@/lib/services/certificates";

const schema = z.object({
  employerId: z.string().min(1)
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("Invalid payload", 422);

    const result = await regenerateEnrollmentCertificate({
      employerId: parsed.data.employerId,
      actorUserId: actor.id
    });
    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_NOT_FOUND") return fail("Employer not found", 404);
    return fail("Forbidden", 403);
  }
}
