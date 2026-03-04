import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { resendInvite } from "@/lib/services/users";

export async function POST(_: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    await resendInvite({
      actor: {
        id: actor.id,
        role: actor.role
      },
      userId: ctx.params.id
    });

    return ok({ sent: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Not found", 404);
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    return fail("Forbidden", 403);
  }
}
