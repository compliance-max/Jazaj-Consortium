import { fail, ok } from "@/lib/http";
import { isInternalJobAuthorized } from "@/lib/auth/internal-job";
import { identifyRetentionCandidates } from "@/lib/services/retention";

export async function POST(req: Request) {
  if (!isInternalJobAuthorized(req, "/api/internal/jobs/retention-candidates")) {
    return fail("Not found", 404);
  }

  const result = await identifyRetentionCandidates();
  return ok(result);
}
