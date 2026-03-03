import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { createEmployerWithDer, listEmployers } from "@/lib/services/employers";
import { employerCreateSchema } from "@/lib/validation/employer";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.enum(["PENDING_PAYMENT", "ACTIVE", "INACTIVE"]).optional()
});

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined
    });
    if (!parsed.success) return fail("Invalid query", 422);

    const result = await listEmployers({
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 20,
      q: parsed.data.q || null,
      status: parsed.data.status || null
    });

    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = employerCreateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const created = await createEmployerWithDer(parsed.data);
    return ok(
      {
        employer: created.employer,
        user: {
          id: created.user.id,
          email: created.user.email,
          fullName: created.user.fullName,
          role: created.user.role
        }
      },
      201
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : "Forbidden";
      return fail(`Failed to create employer: ${message}`, 403);
    }
    return fail("Forbidden", 403);
  }
}
