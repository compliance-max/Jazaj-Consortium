import { UserRole } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: UserRole;
    employerId: string | null;
    emailVerifiedAt: string | null;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      employerId: string | null;
      emailVerifiedAt: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    employerId?: string | null;
    emailVerifiedAt?: string | null;
  }
}
