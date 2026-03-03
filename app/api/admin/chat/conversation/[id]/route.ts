import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { getAdminConversationDetail } from "@/lib/services/chat";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    const detail = await getAdminConversationDetail({
      actor: {
        kind: "ADMIN",
        userId: actor.id,
        role: actor.role
      },
      conversationId: ctx.params.id
    });
    if (!detail) return fail("Not found", 404);
    return ok(detail);
  } catch {
    return fail("Forbidden", 403);
  }
}
