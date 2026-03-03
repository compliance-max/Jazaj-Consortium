import { fail, ok } from "@/lib/http";
import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentDownloadUrl } from "@/lib/storage/documents";

export async function GET() {
  try {
    await requireRole(["CTPA_ADMIN"]);

    const rows = await prisma.auditLog.findMany({
      where: {
        action: "EXPORT_AUDIT"
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    const items = await Promise.all(
      rows.map(async (row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const storageKey = typeof metadata.storageKey === "string" ? metadata.storageKey : "";
        const filename =
          typeof metadata.filename === "string" && metadata.filename
            ? metadata.filename
            : `${storageKey.split("/").pop() || "audit-export.zip"}`;

        const downloadUrl = storageKey
          ? await buildDocumentDownloadUrl({
              storageKey,
              filename,
              contentType: "application/zip"
            })
          : null;

        return {
          id: row.id,
          createdAt: row.createdAt,
          employerId: row.employerId,
          storageKey,
          filename,
          downloadUrl
        };
      })
    );

    return ok({ items });
  } catch {
    return fail("Forbidden", 403);
  }
}
