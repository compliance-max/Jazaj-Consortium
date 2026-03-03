import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { listComplianceSummaries } from "@/lib/services/random/compliance";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  employerId: z.string().optional()
});

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      year: searchParams.get("year"),
      employerId: searchParams.get("employerId") || undefined
    });
    if (!parsed.success) return fail("Invalid query", 422);

    const items = await listComplianceSummaries(parsed.data);
    return ok({ items });
  } catch {
    return fail("Forbidden", 403);
  }
}
