import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { adminCreateEmployerUserSchema } from "@/lib/validation/user-management";
import { createEmployerScopedUser, listEmployerUsers } from "@/lib/services/users";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    await requireAdminOrManager();
    const users = await listEmployerUsers({ employerId: ctx.params.id });
    return ok({ users });
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();

    const body = await req.json().catch(() => null);
    const parsed = adminCreateEmployerUserSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const user = await createEmployerScopedUser({
      actor: {
        id: actor.id,
        role: actor.role
      },
      employerId: ctx.params.id,
      email: parsed.data.email.trim().toLowerCase(),
      role: parsed.data.role
    });

    return ok({ user }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_NOT_FOUND") return fail("Employer not found", 404);
    if (error instanceof Error && error.message === "USER_EXISTS") return fail("User already exists", 409);
    return fail("Forbidden", 403);
  }
}
