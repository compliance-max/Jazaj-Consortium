import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { listAdminConversations } from "@/lib/services/chat";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  source: z.enum(["GUEST", "MEMBER"]).optional()
});

export async function GET(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      status: searchParams.get("status") || undefined,
      source: searchParams.get("source") || undefined
    });
    if (!parsed.success) return fail("Invalid query", 422);

    const result = await listAdminConversations({
      actor: {
        kind: "ADMIN",
        userId: actor.id,
        role: actor.role
      },
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 25,
      status: parsed.data.status || null,
      source: parsed.data.source || null
    });

    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}
