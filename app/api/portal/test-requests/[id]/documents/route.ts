import { fail, ok } from "@/lib/http";
import { requirePortalContext } from "@/lib/auth/guard";
import { listRequestDocumentsForEmployer } from "@/lib/services/test-requests";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    const { employer } = await requirePortalContext();
    const documents = await listRequestDocumentsForEmployer({
      employerId: employer.id,
      testRequestId: ctx.params.id
    });

    return ok({
      documents: documents.map((row) => ({
        ...row,
        downloadUrl: `/api/documents/${row.id}/download`
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return fail("Not found", 404);
    }
    return fail("Unauthorized", 401);
  }
}
