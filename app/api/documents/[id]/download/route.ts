import { auth } from "@/auth";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentDownloadUrl } from "@/lib/storage/documents";

const ADMIN_ROLES = new Set(["CTPA_ADMIN", "CTPA_MANAGER"]);

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return fail("Unauthorized", 401);

  const document = await prisma.document.findUnique({
    where: { id: ctx.params.id }
  });
  if (!document) return fail("Not found", 404);

  if (!ADMIN_ROLES.has(session.user.role)) {
    if (!session.user.employerId || session.user.employerId !== document.employerId) {
      return fail("Forbidden", 403);
    }
  }

  const url = await buildDocumentDownloadUrl({
    storageKey: document.storageKey,
    filename: document.filename,
    contentType: document.contentType
  });

  return ok({
    url,
    filename: document.filename,
    contentType: document.contentType
  });
}
