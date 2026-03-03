import { fail, ok } from "@/lib/http";
import { isInternalJobAuthorized } from "@/lib/auth/internal-job";
import { runRandomSelections } from "@/lib/services/random/engine";

export async function POST(req: Request) {
  if (!isInternalJobAuthorized(req, "/api/internal/jobs/run-random")) return fail("Not found", 404);
  const result = await runRandomSelections({
    commit: true,
    dryRun: false,
    requestedByUserId: null
  });
  return ok(result);
}
