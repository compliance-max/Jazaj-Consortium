import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { listAdminTestRequests } from "@/lib/services/test-requests";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined
    });
    if (!parsed.success) return fail("Invalid query", 422);

    const result = await listAdminTestRequests({
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 25,
      resultOnly: true
    });
    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}
