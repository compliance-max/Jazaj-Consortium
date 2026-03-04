import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/http";
import { ensureEmployerActiveForMutation, requirePortalContext } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { isStrongPassword } from "@/lib/security/password-policy";

const schema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(10)
});

export async function POST(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensureEmployerActiveForMutation(employer.status);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("Invalid payload", 422);
    if (!isStrongPassword(parsed.data.newPassword)) return fail("Weak password", 422);

    const dbUser = await prisma.employerUser.findUnique({
      where: { id: user.id }
    });
    if (!dbUser?.passwordHash) return fail("Password not set", 422);

    const valid = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash);
    if (!valid) return fail("Current password is incorrect", 403);

    const hash = await hashPassword(parsed.data.newPassword);
    await prisma.employerUser.update({
      where: { id: dbUser.id },
      data: { passwordHash: hash, passwordSet: true, passwordSetAt: new Date() }
    });

    return ok({ updated: true });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    return fail("Unauthorized", 401);
  }
}
