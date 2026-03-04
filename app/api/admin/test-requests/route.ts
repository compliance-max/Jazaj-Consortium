import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { adminTestRequestCreateSchema } from "@/lib/validation/test-request";
import { createTestRequestWithCheckout, listAdminTestRequests } from "@/lib/services/test-requests";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(["PENDING_PAYMENT", "REQUESTED", "SCHEDULED", "COMPLETED", "CANCELLED"])
    .optional()
});

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      status: searchParams.get("status") || undefined
    });
    if (!parsed.success) return fail("Invalid query", 422);

    const result = await listAdminTestRequests({
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 25,
      status: parsed.data.status || null,
      resultOnly: false
    });
    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = adminTestRequestCreateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const created = await createTestRequestWithCheckout({
      employerId: parsed.data.employerId,
      requestedByUserId: actor.id,
      driverId: parsed.data.driverId || null,
      testType: parsed.data.testType,
      reason: "USER_REQUEST",
      notes: parsed.data.reasonDetail || null,
      promoCode: parsed.data.promoCode || null
    });

    return ok(created, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "DRIVER_NOT_FOUND") return fail("Driver not found", 404);
    return fail("Forbidden", 403);
  }
}
