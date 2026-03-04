import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { adminCreateGlobalUserSchema, adminUsersQuerySchema } from "@/lib/validation/user-management";
import { createGlobalAdminUser, listAdminUsers } from "@/lib/services/users";

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = adminUsersQuerySchema.safeParse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || undefined,
      q: searchParams.get("q") || undefined,
      role: searchParams.get("role") || undefined
    });

    if (!parsed.success) return fail("Invalid query", 422);

    const result = await listAdminUsers({
      cursor: parsed.data.cursor || null,
      limit: parsed.data.limit || 25,
      q: parsed.data.q || null,
      role: parsed.data.role || null
    });

    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    if (actor.role !== "CTPA_ADMIN") return fail("Forbidden", 403);

    const body = await req.json().catch(() => null);
    const parsed = adminCreateGlobalUserSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const user = await createGlobalAdminUser({
      actor: {
        id: actor.id,
        role: actor.role
      },
      email: parsed.data.email.trim().toLowerCase(),
      role: parsed.data.role
    });

    return ok({ user }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "USER_EXISTS") {
      return fail("User already exists", 409);
    }
    return fail("Forbidden", 403);
  }
}
