import { UserRole } from "@prisma/client";

export function validateEmployerUserInvariant(input: { role: UserRole; employerId: string | null }) {
  const employerScoped = input.role === "EMPLOYER_DER" || input.role === "READONLY_AUDITOR";
  const globalRole = input.role === "CTPA_ADMIN" || input.role === "CTPA_MANAGER";

  if (employerScoped && !input.employerId) {
    throw new Error("EMPLOYER_SCOPED_ROLE_REQUIRES_EMPLOYER");
  }

  if (globalRole && input.employerId) {
    throw new Error("GLOBAL_ROLE_MUST_NOT_HAVE_EMPLOYER");
  }
}
