import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { adminPatchUserSchema } from "@/lib/validation/user-management";
import { patchUserByAdmin } from "@/lib/services/users";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    if (actor.role !== "CTPA_ADMIN") return fail("Forbidden", 403);

    const body = await req.json().catch(() => null);
    const parsed = adminPatchUserSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const user = await patchUserByAdmin({
      actor: {
        id: actor.id,
        role: actor.role
      },
      userId: ctx.params.id,
      role: parsed.data.role,
      disabled: parsed.data.disabled
    });

    return ok({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Not found", 404);
    if (error instanceof Error && error.message === "CANNOT_DISABLE_SELF") return fail("Cannot disable current user", 422);
    if (error instanceof Error && error.message === "ROLE_TRANSITION_REQUIRES_SCOPE_CHANGE") {
      return fail("Role change requires scope change endpoint", 422);
    }
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    return fail("Forbidden", 403);
  }
}
