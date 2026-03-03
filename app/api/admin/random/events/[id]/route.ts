import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { getRandomEventAuditView } from "@/lib/services/random/events";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    await requireAdminOrManager();
    const event = await getRandomEventAuditView(ctx.params.id);
    if (!event) return fail("Not found", 404);
    return ok({ event });
  } catch {
    return fail("Forbidden", 403);
  }
}
