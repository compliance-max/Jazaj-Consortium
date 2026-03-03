import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { getEmployerDetail, updateEmployer } from "@/lib/services/employers";
import { employerUpdateSchema } from "@/lib/validation/employer";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    await requireAdminOrManager();
    const employer = await getEmployerDetail(ctx.params.id);
    if (!employer) return fail("Not found", 404);
    return ok({ employer });
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = employerUpdateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const updated = await updateEmployer(ctx.params.id, parsed.data, actor.id);
    const detail = await getEmployerDetail(ctx.params.id);
    return ok({
      employer: detail,
      migrationSummary: updated.migrationSummary
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_STATUS_REQUIRES_ACTIVATION") {
      return fail("Use activation endpoint to set employer ACTIVE", 422);
    }
    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : "Forbidden";
      return fail(`Failed to update employer: ${message}`, 403);
    }
    return fail("Forbidden", 403);
  }
}
