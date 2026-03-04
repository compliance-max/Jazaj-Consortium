import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeAccountToken } from "@/lib/tokens/service";
import { hashPassword } from "@/lib/security/password";
import { isStrongPassword } from "@/lib/security/password-policy";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(10)
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 422);
  if (!isStrongPassword(parsed.data.password)) return fail("Weak password", 422);

  const consumed = await consumeAccountToken({
    rawToken: parsed.data.token,
    type: "SET_PASSWORD"
  });
  if (!consumed.ok) {
    if (consumed.reason === "EXPIRED") return fail("Token expired", 410);
    return fail("Token invalid", 404);
  }

  const hash = await hashPassword(parsed.data.password);
  await prisma.employerUser.update({
    where: { id: consumed.token.userId },
    data: {
      passwordHash: hash,
      passwordSet: true,
      passwordSetAt: new Date(),
      emailVerifiedAt: consumed.token.user.emailVerifiedAt || new Date()
    }
  });

  return ok({ updated: true });
}
