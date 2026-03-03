import { AccountTokenType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateRawToken, hashToken } from "@/lib/security/token";

const EXPIRY_MINUTES: Record<AccountTokenType, number> = {
  EMAIL_VERIFICATION: 60 * 24,
  SET_PASSWORD: 60 * 24,
  RESET_PASSWORD: 30
};

export async function createAccountToken(input: { userId: string; type: AccountTokenType }) {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const ttlMinutes = EXPIRY_MINUTES[input.type];
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await prisma.accountToken.create({
    data: {
      userId: input.userId,
      type: input.type,
      tokenHash,
      expiresAt
    }
  });

  return { raw, expiresAt };
}

export async function consumeAccountToken(input: { rawToken: string; type: AccountTokenType }) {
  const tokenHash = hashToken(input.rawToken);
  const now = new Date();

  const token = await prisma.accountToken.findFirst({
    where: {
      tokenHash,
      type: input.type,
      usedAt: null
    },
    include: { user: true }
  });

  if (!token) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (token.expiresAt <= now) return { ok: false as const, reason: "EXPIRED" as const };

  await prisma.accountToken.update({
    where: { id: token.id },
    data: { usedAt: now }
  });

  return { ok: true as const, token };
}
