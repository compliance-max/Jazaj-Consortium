import { prisma } from "@/lib/db/prisma";
import { generateRawToken, hashToken } from "@/lib/security/token";

export async function createCheckoutConfirmToken(input: { stripeSessionId: string; ttlMinutes?: number }) {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + (input.ttlMinutes || 30) * 60_000);

  await prisma.checkoutConfirmToken.upsert({
    where: { stripeSessionId: input.stripeSessionId },
    create: {
      stripeSessionId: input.stripeSessionId,
      tokenHash,
      expiresAt
    },
    update: {
      tokenHash,
      expiresAt,
      usedAt: null
    }
  });

  return { token: raw, raw, expiresAt };
}

export async function consumeCheckoutConfirmToken(input: { stripeSessionId: string; token: string }) {
  const tokenHash = hashToken(input.token);
  const row = await prisma.checkoutConfirmToken.findUnique({
    where: { stripeSessionId: input.stripeSessionId }
  });
  if (!row) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (row.usedAt) return { ok: false as const, reason: "USED" as const };
  if (row.expiresAt <= new Date()) return { ok: false as const, reason: "EXPIRED" as const };
  if (row.tokenHash !== tokenHash) return { ok: false as const, reason: "INVALID" as const };

  await prisma.checkoutConfirmToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() }
  });

  return { ok: true as const };
}
