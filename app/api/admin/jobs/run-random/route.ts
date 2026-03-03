import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { runRandomSelections } from "@/lib/services/random/engine";

const schema = z.object({
  dryRun: z.boolean().optional(),
  commit: z.boolean().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  employerId: z.string().optional(),
  force: z.boolean().optional(),
  overrideReason: z.string().trim().min(10).max(500).optional()
}).superRefine((value, ctx) => {
  if (value.force && !value.overrideReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overrideReason"],
      message: "overrideReason is required when force=true"
    });
  }
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdminOrManager();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const result = await runRandomSelections({
      ...parsed.data,
      requestedByUserId: actor.id
    });
    return ok(result);
  } catch {
    return fail("Forbidden", 403);
  }
}
