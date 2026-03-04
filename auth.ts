import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/security/password";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email / Password",
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const ip = request?.headers?.get("x-forwarded-for") || "unknown";
        const limiter = await consumeRateLimit({
          namespace: "auth_login",
          key: `${parsed.data.email.toLowerCase()}:${ip}`,
          limit: 10,
          windowMs: 15 * 60_000
        });
        if (!limiter.ok) return null;

        const user = await prisma.employerUser.findUnique({
          where: { email: parsed.data.email.toLowerCase() }
        });

        if (user?.disabledAt) return null;
        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        prisma.employerUser
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          })
          .catch(() => {
            // Non-blocking telemetry field; do not fail login on write errors.
          });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          employerId: user.employerId,
          emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
          disabledAt: user.disabledAt ? user.disabledAt.toISOString() : null
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role as UserRole;
        token.employerId = (user.employerId as string | null) || null;
        token.emailVerifiedAt = (user.emailVerifiedAt as string | null) || null;
        token.disabledAt = (user.disabledAt as string | null) || null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub || "";
      session.user.role = (token.role as UserRole) || "EMPLOYER_DER";
      session.user.employerId = (token.employerId as string | null) || null;
      session.user.emailVerifiedAt = (token.emailVerifiedAt as string | null) || null;
      session.user.disabledAt = (token.disabledAt as string | null) || null;
      return session;
    }
  }
});
