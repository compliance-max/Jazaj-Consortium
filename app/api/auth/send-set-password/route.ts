import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createAccountToken } from "@/lib/tokens/service";
import { sendSetPasswordEmail } from "@/lib/email/postmark";
import { fail, ok } from "@/lib/http";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  email: z.string().email()
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid email", 422);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limiter = await consumeRateLimit({
    namespace: "set_password_email",
    key: `${parsed.data.email.toLowerCase()}:${ip}`,
    limit: 5,
    windowMs: 15 * 60_000
  });
  if (!limiter.ok) return fail("Too many requests", 429);

  const user = await prisma.employerUser.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (user) {
    const token = await createAccountToken({ userId: user.id, type: "SET_PASSWORD" });
    await sendSetPasswordEmail({ to: user.email, token: token.raw });
  }

  return ok({ sent: true });
}
