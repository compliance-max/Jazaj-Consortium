import { fail, ok } from "@/lib/http";
import { getPublicCertificateStatus } from "@/lib/services/certificates";

export async function GET(_: Request, ctx: { params: { certificateId: string } }) {
  const certificate = await getPublicCertificateStatus(ctx.params.certificateId);
  if (!certificate) return fail("Not found", 404);
  return ok(certificate);
}
