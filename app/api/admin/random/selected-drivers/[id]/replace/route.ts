import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { replaceSelectedDriver } from "@/lib/services/random/events";

const schema = z.object({
  replacementDriverId: z.string().min(1),
  overrideReason: z.string().min(10)
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const replaced = await replaceSelectedDriver({
      selectedDriverId: ctx.params.id,
      replacementDriverId: parsed.data.replacementDriverId,
      overrideReason: parsed.data.overrideReason,
      actorUserId: actor.id,
      actorRole: actor.role
    });

    return ok({ selectedDriver: replaced });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "LOCKED_SELECTION_ADMIN_ONLY") return fail("Locked selection can only be overridden by CTPA_ADMIN", 403);
      if (error.message === "OVERRIDE_REASON_REQUIRED") return fail("Override reason is required", 422);
      if (error.message.endsWith("_NOT_FOUND")) return fail("Not found", 404);
      if (error.message.includes("MISMATCH") || error.message.includes("NOT_ELIGIBLE") || error.message.includes("NOT_IN_ELIGIBLE_SET")) {
        return fail("Replacement driver is not eligible for this selection event", 422);
      }
      if (error.message === "REPLACEMENT_ALREADY_SELECTED") return fail("Driver already selected in this event", 422);
    }
    return fail("Forbidden", 403);
  }
}
