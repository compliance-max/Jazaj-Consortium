import { DocumentRetentionCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const RETENTION_PERIOD_DAYS: Record<DocumentRetentionCategory, number> = {
  RANDOM: 365 * 5,
  POST_ACCIDENT: 365 * 2,
  REASONABLE_SUSPICION: 365 * 2,
  RETURN_TO_DUTY: 365 * 5,
  FOLLOW_UP: 365 * 5,
  OTHER: 365 * 2,
  CERTIFICATE: 365 * 5
};

function cutoffDateForCategory(category: DocumentRetentionCategory) {
  const days = RETENTION_PERIOD_DAYS[category];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function identifyRetentionCandidates(input?: {
  limitPerCategory?: number;
  actorUserId?: string | null;
}) {
  const limit = Math.max(1, Math.min(1000, input?.limitPerCategory || 200));

  const categories = Object.keys(RETENTION_PERIOD_DAYS) as DocumentRetentionCategory[];
  const candidates = [];

  for (const category of categories) {
    const cutoff = cutoffDateForCategory(category);
    const rows = await prisma.document.findMany({
      where: {
        retentionCategory: category,
        createdAt: { lte: cutoff }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit
    });

    for (const row of rows) {
      await prisma.auditLog.create({
        data: {
          userId: input?.actorUserId || null,
          employerId: row.employerId,
          action: "RETENTION_CANDIDATE",
          entityType: "Document",
          entityId: row.id,
          metadata: {
            retentionCategory: row.retentionCategory,
            cutoff: cutoff.toISOString(),
            createdAt: row.createdAt.toISOString(),
            storageKey: row.storageKey
          }
        }
      });
    }

    candidates.push({
      retentionCategory: category,
      count: rows.length
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    candidates
  };
}
