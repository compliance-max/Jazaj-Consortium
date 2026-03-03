import { fail, ok } from "@/lib/http";
import { isInternalJobAuthorized } from "@/lib/auth/internal-job";
import { sendQuarterEndRosterReviewReminders } from "@/lib/services/random/engine";

export async function POST(req: Request) {
  if (!isInternalJobAuthorized(req, "/api/internal/jobs/quarter-end-review")) return fail("Not found", 404);
  const result = await sendQuarterEndRosterReviewReminders();
  return ok(result);
}
