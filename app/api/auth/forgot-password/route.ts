import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createAccountToken } from "@/lib/tokens/service";
import { sendResetPasswordEmail } from "@/lib/email/postmark";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email()
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid email", 422);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limiter = await consumeRateLimit({
    namespace: "forgot_password",
    key: `${parsed.data.email.toLowerCase()}:${ip}`,
    limit: 5,
    windowMs: 30 * 60_000
  });
  if (!limiter.ok) return fail("Too many requests", 429);

  const user = await prisma.employerUser.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (user) {
    const token = await createAccountToken({ userId: user.id, type: "RESET_PASSWORD" });
    await sendResetPasswordEmail({ to: user.email, token: token.raw });
  }

  return ok({ sent: true });
}
