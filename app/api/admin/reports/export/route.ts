import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { generateAuditExport } from "@/lib/services/reports";
import { createLogger } from "@/lib/logging/logger";

const schema = z.object({
  employerId: z.string().cuid().optional().nullable(),
  dateFrom: z.string().datetime().optional().nullable(),
  dateTo: z.string().datetime().optional().nullable()
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({ requestId, route: "/api/admin/reports/export", method: "POST" });
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body || {});
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const result = await generateAuditExport({
      actorUserId: actor.id,
      employerId: parsed.data.employerId || null,
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : null,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : null
    });
    logger.info("Audit export generated", {
      actorUserId: actor.id,
      employerId: parsed.data.employerId || null
    });
    return ok(result);
  } catch {
    logger.error("Audit export failed");
    return fail("Forbidden", 403);
  }
}
