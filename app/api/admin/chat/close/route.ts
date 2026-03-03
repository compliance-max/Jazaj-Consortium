import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { closeAdminConversation } from "@/lib/services/chat";

const schema = z.object({
  conversationId: z.string().min(1),
  status: z.enum(["CLOSED"]).optional()
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("Invalid payload", 422);

    const conversation = await closeAdminConversation({
      actor: {
        kind: "ADMIN",
        userId: actor.id,
        role: actor.role
      },
      conversationId: parsed.data.conversationId,
      status: parsed.data.status || "CLOSED"
    });
    return ok({ conversation });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    return fail("Bad request", 400);
  }
}
