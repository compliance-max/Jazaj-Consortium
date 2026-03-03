import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeAccountToken } from "@/lib/tokens/service";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  token: z.string().min(20)
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid token", 422);

  const consumed = await consumeAccountToken({
    rawToken: parsed.data.token,
    type: "EMAIL_VERIFICATION"
  });

  if (!consumed.ok) {
    if (consumed.reason === "EXPIRED") return fail("Token expired", 410);
    return fail("Token invalid", 404);
  }

  await prisma.employerUser.update({
    where: { id: consumed.token.userId },
    data: { emailVerifiedAt: new Date() }
  });

  return ok({ verified: true });
}
